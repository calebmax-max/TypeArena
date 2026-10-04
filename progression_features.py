from __future__ import annotations

from datetime import date, datetime
from typing import Any, Callable, Dict, Optional
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, request


STREAK_TIMEZONE = ZoneInfo('Africa/Nairobi')
STREAK_FREEZE_CAP = 3
STREAK_FREEZE_LEVEL_INTERVAL = 5
PROGRESSION_REWARD_DEFAULTS = {
    'race_completed': 50,
    'personal_best': 25,
    'streak_3_days': 50,
    'streak_7_days': 150,
}


def xp_required_for_level(level: int) -> int:
    if level <= 1:
        return 0
    levels_above_one = level - 1
    return levels_above_one * (500 + 50 * (level - 2))


def level_for_xp(xp: int) -> int:
    level = 1
    while xp >= xp_required_for_level(level + 1):
        level += 1
    return level


def _date_value(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _progress_snapshot(user: Dict[str, Any], xp_earned: int = 0, awards=None) -> Dict[str, Any]:
    xp = max(0, int(user.get('xp') or 0))
    level = max(1, int(user.get('level') or level_for_xp(xp)))
    floor = xp_required_for_level(level)
    next_level = xp_required_for_level(level + 1)
    last_play_date = _date_value(user.get('last_play_date'))
    return {
        'xp': xp,
        'level': level,
        'xpEarned': int(xp_earned),
        'xpIntoLevel': xp - floor,
        'xpToNextLevel': max(0, next_level - xp),
        'currentStreak': max(0, int(user.get('current_streak') or 0)),
        'longestStreak': max(0, int(user.get('longest_streak') or 0)),
        'lastPlayDate': last_play_date.isoformat() if last_play_date else None,
        'streakFreezes': min(STREAK_FREEZE_CAP, max(0, int(user.get('streak_freezes') or 0))),
        'awards': awards or [],
    }


def ensure_progression_schema(cur) -> None:
    columns = {
        'xp': "ALTER TABLE users ADD COLUMN xp BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER account_plan",
        'level': "ALTER TABLE users ADD COLUMN level INT UNSIGNED NOT NULL DEFAULT 1 AFTER xp",
        'current_streak': "ALTER TABLE users ADD COLUMN current_streak INT UNSIGNED NOT NULL DEFAULT 0 AFTER level",
        'longest_streak': "ALTER TABLE users ADD COLUMN longest_streak INT UNSIGNED NOT NULL DEFAULT 0 AFTER current_streak",
        'last_play_date': "ALTER TABLE users ADD COLUMN last_play_date DATE NULL AFTER longest_streak",
        'streak_freezes': "ALTER TABLE users ADD COLUMN streak_freezes TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER last_play_date",
    }
    for name, statement in columns.items():
        cur.execute(f"SHOW COLUMNS FROM users LIKE '{name}'")
        if not cur.fetchone():
            cur.execute(statement)

    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS xp_transactions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            amount INT NOT NULL,
            reason VARCHAR(40) NOT NULL,
            reference_code VARCHAR(120) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_xp_user_reference_reason (user_id, reference_code, reason),
            KEY idx_xp_user_created (user_id, created_at),
            CONSTRAINT fk_xp_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS streak_freeze_transactions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            amount SMALLINT NOT NULL,
            reason VARCHAR(40) NOT NULL,
            reference_code VARCHAR(120) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_freeze_user_reference_reason (user_id, reference_code, reason),
            KEY idx_freeze_user_created (user_id, created_at),
            CONSTRAINT fk_freeze_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS progression_reward_settings (
            setting_key VARCHAR(40) PRIMARY KEY,
            amount INT UNSIGNED NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    for key, amount in PROGRESSION_REWARD_DEFAULTS.items():
        cur.execute(
            'INSERT IGNORE INTO progression_reward_settings (setting_key, amount) VALUES (%s, %s)',
            (key, amount),
        )


def award_race_progress(
    cur,
    *,
    user_id: int,
    race_code: str,
    personal_best: bool,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    reference_code = str(race_code or '').strip()
    if not reference_code or len(reference_code) > 120:
        raise ValueError('A valid race reference is required for progression awards.')

    cur.execute(
        '''
        SELECT xp, level, current_streak, longest_streak, last_play_date, streak_freezes
        FROM users WHERE id=%s FOR UPDATE
        ''',
        (user_id,),
    )
    stored_user = cur.fetchone()
    if not stored_user:
        raise ValueError('Progression account was not found.')
    user = dict(stored_user)

    cur.execute(
        '''
        SELECT id FROM xp_transactions
        WHERE user_id=%s AND reference_code=%s AND reason='race_completed'
        LIMIT 1 FOR UPDATE
        ''',
        (user_id, reference_code),
    )
    if cur.fetchone():
        return _progress_snapshot(user)

    cur.execute('SELECT setting_key, amount FROM progression_reward_settings')
    rewards = {row['setting_key']: int(row['amount']) for row in cur.fetchall()}
    amounts = {
        key: rewards.get(key, default)
        for key, default in PROGRESSION_REWARD_DEFAULTS.items()
    }

    today = today or datetime.now(STREAK_TIMEZONE).date()
    last_play_date = _date_value(user.get('last_play_date'))
    current_streak = max(0, int(user.get('current_streak') or 0))
    previous_streak = current_streak
    longest_streak = max(0, int(user.get('longest_streak') or 0))
    freezes = min(STREAK_FREEZE_CAP, max(0, int(user.get('streak_freezes') or 0)))
    streak_bonus_reasons = []

    if last_play_date is None:
        current_streak = 1
    elif today > last_play_date:
        days_since_play = (today - last_play_date).days
        if days_since_play == 1:
            current_streak += 1
        else:
            missed_days = days_since_play - 1
            if freezes >= missed_days:
                freezes -= missed_days
                cur.execute(
                    '''
                    INSERT INTO streak_freeze_transactions
                        (user_id, amount, reason, reference_code)
                    VALUES (%s, %s, 'streak_protection', %s)
                    ''',
                    (user_id, -missed_days, reference_code),
                )
                current_streak += days_since_play
            else:
                current_streak = 1
    if last_play_date is None or today > last_play_date:
        longest_streak = max(longest_streak, current_streak)
        if previous_streak < 3 <= current_streak:
            streak_bonus_reasons.append('streak_3_days')
        if previous_streak < 7 <= current_streak:
            streak_bonus_reasons.append('streak_7_days')

    awards = [{'reason': 'race_completed', 'amount': amounts['race_completed']}]
    if personal_best:
        awards.append({'reason': 'personal_best', 'amount': amounts['personal_best']})
    for streak_bonus_reason in streak_bonus_reasons:
        awards.append({
            'reason': streak_bonus_reason,
            'amount': amounts[streak_bonus_reason],
        })
    for award in awards:
        cur.execute(
            '''
            INSERT INTO xp_transactions (user_id, amount, reason, reference_code)
            VALUES (%s, %s, %s, %s)
            ''',
            (user_id, award['amount'], award['reason'], reference_code),
        )

    xp_earned = sum(award['amount'] for award in awards)
    old_xp = max(0, int(user.get('xp') or 0))
    new_xp = old_xp + xp_earned
    old_level = max(1, int(user.get('level') or level_for_xp(old_xp)))
    new_level = level_for_xp(new_xp)
    for reached_level in range(old_level + 1, new_level + 1):
        if reached_level % STREAK_FREEZE_LEVEL_INTERVAL != 0 or freezes >= STREAK_FREEZE_CAP:
            continue
        freeze_reference = f'{reference_code}:level:{reached_level}'
        cur.execute(
            '''
            INSERT INTO streak_freeze_transactions
                (user_id, amount, reason, reference_code)
            VALUES (%s, 1, 'level_reward', %s)
            ''',
            (user_id, freeze_reference),
        )
        freezes += 1
        awards.append({
            'reason': 'level_reward',
            'level': reached_level,
            'streakFreezes': 1,
        })

    cur.execute(
        '''
        UPDATE users
        SET xp=%s, level=%s, current_streak=%s, longest_streak=%s,
            last_play_date=CASE WHEN last_play_date IS NULL OR last_play_date<%s THEN %s ELSE last_play_date END,
            streak_freezes=%s
        WHERE id=%s
        ''',
        (new_xp, new_level, current_streak, longest_streak, today, today, freezes, user_id),
    )
    user.update({
        'xp': new_xp,
        'level': new_level,
        'current_streak': current_streak,
        'longest_streak': longest_streak,
        'last_play_date': max(last_play_date, today) if last_play_date else today,
        'streak_freezes': freezes,
    })
    return _progress_snapshot(user, xp_earned, awards)


def register_progression_routes(
    app: Flask,
    *,
    get_connection: Callable[[], Any],
    return_connection: Callable[[Any], None],
    get_user: Callable[[Any], Optional[Dict[str, Any]]],
    is_admin_email: Callable[[str], bool],
) -> Callable[..., None]:
    @app.get('/api/progression')
    def progression_status():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT xp, level, current_streak, longest_streak, last_play_date, streak_freezes
                    FROM users WHERE id=%s
                    ''',
                    (user['id'],),
                )
                row = cur.fetchone()
            if not row:
                return jsonify({'message': 'Account not found.'}), 404
            return jsonify(_progress_snapshot(dict(row)))
        finally:
            return_connection(conn)

    @app.get('/api/progression/history')
    def progression_history():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT amount, reason, reference_code, created_at
                    FROM xp_transactions
                    WHERE user_id=%s
                    ORDER BY created_at DESC, id DESC
                    LIMIT 50
                    ''',
                    (user['id'],),
                )
                xp_history = cur.fetchall()
                cur.execute(
                    '''
                    SELECT amount, reason, reference_code, created_at
                    FROM streak_freeze_transactions
                    WHERE user_id=%s
                    ORDER BY created_at DESC, id DESC
                    LIMIT 50
                    ''',
                    (user['id'],),
                )
                freeze_history = cur.fetchall()
            return jsonify({
                'xpTransactions': [{
                    'amount': int(row['amount']),
                    'reason': row['reason'],
                    'referenceCode': row.get('reference_code'),
                    'createdAt': row['created_at'].isoformat() if row.get('created_at') else None,
                } for row in xp_history],
                'streakFreezeTransactions': [{
                    'amount': int(row['amount']),
                    'reason': row['reason'],
                    'referenceCode': row.get('reference_code'),
                    'createdAt': row['created_at'].isoformat() if row.get('created_at') else None,
                } for row in freeze_history],
            })
        finally:
            return_connection(conn)

    @app.post('/api/progression/races/<race_code>/award')
    def award_recorded_race(race_code: str):
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT race_code, wpm
                    FROM race_history
                    WHERE race_code=%s AND user_id=%s
                    ''',
                    (race_code, user['id']),
                )
                race = cur.fetchone()
                if not race:
                    return jsonify({'message': 'Recorded race not found for this account.'}), 404
                cur.execute(
                    '''
                    SELECT MAX(wpm) AS best_wpm
                    FROM race_history
                    WHERE user_id=%s AND race_code<>%s
                    ''',
                    (user['id'], race_code),
                )
                best = cur.fetchone() or {}
                previous_best = best.get('best_wpm')
                result = award_race_progress(
                    cur,
                    user_id=int(user['id']),
                    race_code=str(race['race_code']),
                    personal_best=previous_best is None or float(race['wpm'] or 0) > float(previous_best),
                )
            conn.commit()
            return jsonify(result)
        finally:
            return_connection(conn)

    @app.get('/api/admin/progression/rewards')
    def admin_get_progression_rewards():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user or not is_admin_email(str(user.get('email') or '')):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                cur.execute('SELECT setting_key, amount FROM progression_reward_settings')
                values = {row['setting_key']: int(row['amount']) for row in cur.fetchall()}
            return jsonify({
                'rewards': {
                    key: values.get(key, default)
                    for key, default in PROGRESSION_REWARD_DEFAULTS.items()
                },
                'streakFreezeCap': STREAK_FREEZE_CAP,
                'streakFreezeLevelInterval': STREAK_FREEZE_LEVEL_INTERVAL,
            })
        finally:
            return_connection(conn)

    @app.put('/api/admin/progression/rewards')
    def admin_update_progression_rewards():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({'message': 'A JSON object is required.'}), 400
        if not payload or set(payload) - set(PROGRESSION_REWARD_DEFAULTS):
            return jsonify({'message': 'Provide one or more supported XP reward keys.'}), 400
        parsed = {}
        for key, value in payload.items():
            if isinstance(value, bool):
                return jsonify({'message': f'{key} must be a whole number from 0 to 10000.'}), 400
            try:
                amount = int(value)
            except (TypeError, ValueError):
                return jsonify({'message': f'{key} must be a whole number from 0 to 10000.'}), 400
            if str(value).strip() != str(amount) or amount < 0 or amount > 10000:
                return jsonify({'message': f'{key} must be a whole number from 0 to 10000.'}), 400
            parsed[key] = amount

        conn = get_connection()
        try:
            user = get_user(conn)
            if not user or not is_admin_email(str(user.get('email') or '')):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                for key, amount in parsed.items():
                    cur.execute(
                        '''
                        INSERT INTO progression_reward_settings (setting_key, amount)
                        VALUES (%s, %s)
                        ON DUPLICATE KEY UPDATE amount=VALUES(amount)
                        ''',
                        (key, amount),
                    )
            conn.commit()
            return jsonify({'message': 'XP reward settings updated.', 'rewards': parsed})
        finally:
            return_connection(conn)

    def ensure_schema(cur) -> None:
        ensure_progression_schema(cur)

    return ensure_schema
