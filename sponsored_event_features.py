from __future__ import annotations

import hashlib
import hmac
import math
from threading import Lock
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional
from urllib.parse import urlparse

from flask import Flask, jsonify, request


EVENT_METRICS = {'event_page_view', 'results_view', 'sponsor_impression'}
MAX_EVENT_AMOUNT = 9_999_999_999.99
PRIZE_STATUSES = {'pending', 'under_review', 'approved', 'paid', 'disputed'}
PRIZE_TRANSITIONS = {
    'pending': {'under_review'},
    'under_review': {'approved', 'disputed', 'pending'},
    'approved': {'paid', 'disputed', 'under_review'},
    'disputed': {'under_review', 'pending'},
    'paid': set(),
}


def ensure_sponsored_event_schema(cur) -> None:
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS sponsored_events (
            tournament_id INT PRIMARY KEY,
            sponsor_name VARCHAR(150) NOT NULL,
            sponsor_logo_url VARCHAR(1000) NULL,
            powered_by VARCHAR(150) NULL,
            sponsor_message TEXT NULL,
            sponsor_link VARCHAR(1000) NULL,
            starts_at DATETIME NOT NULL,
            ends_at DATETIME NOT NULL,
            eligibility TEXT NOT NULL,
            rules TEXT NOT NULL,
            funding_pledged DECIMAL(12,2) NOT NULL DEFAULT 0,
            funding_received DECIMAL(12,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_sponsored_event_tournament
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            KEY idx_sponsored_events_schedule (starts_at, ends_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS sponsored_event_entries (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tournament_id INT NOT NULL,
            user_id INT NOT NULL,
            terms_accepted_at DATETIME NOT NULL,
            terms_hash CHAR(64) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_sponsored_event_entry (tournament_id, user_id),
            KEY idx_sponsored_event_entries_user (user_id, tournament_id),
            CONSTRAINT fk_sponsored_entry_event
                FOREIGN KEY (tournament_id) REFERENCES sponsored_events(tournament_id) ON DELETE CASCADE,
            CONSTRAINT fk_sponsored_entry_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute("SHOW COLUMNS FROM sponsored_event_entries LIKE 'terms_hash'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE sponsored_event_entries ADD COLUMN terms_hash CHAR(64) NOT NULL DEFAULT '' AFTER terms_accepted_at"
        )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS sponsored_event_attempts (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tournament_id INT NOT NULL,
            user_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL,
            race_code VARCHAR(80) NULL,
            wpm DECIMAL(6,2) NULL,
            status ENUM('started','completed','rejected') NOT NULL DEFAULT 'started',
            started_at DATETIME NOT NULL,
            completed_at DATETIME NULL,
            UNIQUE KEY uq_sponsored_event_token (tournament_id, token_hash),
            UNIQUE KEY uq_sponsored_event_race (tournament_id, race_code),
            KEY idx_sponsored_event_attempts_score (tournament_id, status, user_id),
            CONSTRAINT fk_sponsored_attempt_event
                FOREIGN KEY (tournament_id) REFERENCES sponsored_events(tournament_id) ON DELETE CASCADE,
            CONSTRAINT fk_sponsored_attempt_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS sponsored_event_metrics (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tournament_id INT NOT NULL,
            metric_type ENUM('event_page_view','results_view','sponsor_impression') NOT NULL,
            user_id INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_sponsored_event_metrics (tournament_id, metric_type),
            CONSTRAINT fk_sponsored_metric_event
                FOREIGN KEY (tournament_id) REFERENCES sponsored_events(tournament_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS sponsored_event_prizes (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tournament_id INT NOT NULL,
            place TINYINT UNSIGNED NOT NULL,
            prize_description VARCHAR(255) NOT NULL,
            prize_value DECIMAL(12,2) NOT NULL DEFAULT 0,
            status ENUM('pending','under_review','approved','paid','disputed') NOT NULL DEFAULT 'pending',
            winner_user_id INT NULL,
            admin_note TEXT NULL,
            paid_at DATETIME NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_sponsored_event_prize_place (tournament_id, place),
            CONSTRAINT fk_sponsored_prize_event
                FOREIGN KEY (tournament_id) REFERENCES sponsored_events(tournament_id) ON DELETE CASCADE,
            CONSTRAINT fk_sponsored_prize_winner
                FOREIGN KEY (winner_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS sponsored_event_disputes (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tournament_id INT NOT NULL,
            user_id INT NOT NULL,
            message TEXT NOT NULL,
            status ENUM('open','resolved','rejected') NOT NULL DEFAULT 'open',
            admin_response TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME NULL,
            KEY idx_sponsored_event_disputes (tournament_id, status),
            CONSTRAINT fk_sponsored_dispute_event
                FOREIGN KEY (tournament_id) REFERENCES sponsored_events(tournament_id) ON DELETE CASCADE,
            CONSTRAINT fk_sponsored_dispute_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )


def _parse_datetime(value: Any, label: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value or '').strip().replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError(f'{label} must be a valid date and time.') from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _http_url(value: Any, label: str, *, required: bool = False) -> Optional[str]:
    normalized = str(value or '').strip()
    if not normalized:
        if required:
            raise ValueError(f'{label} is required.')
        return None
    parsed = urlparse(normalized)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc or len(normalized) > 1000:
        raise ValueError(f'{label} must be a valid HTTP or HTTPS URL.')
    return normalized


def validate_event_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    name = str(payload.get('name') or '').strip()
    sponsor_name = str(payload.get('sponsorName') or '').strip()
    eligibility = str(payload.get('eligibility') or '').strip()
    rules = str(payload.get('rules') or '').strip()
    if not name or len(name) > 150:
        raise ValueError('Tournament name must be between 1 and 150 characters.')
    if not sponsor_name or len(sponsor_name) > 150:
        raise ValueError('Sponsor name must be between 1 and 150 characters.')
    if not eligibility or not rules:
        raise ValueError('Eligibility and event rules are required.')
    starts_at = _parse_datetime(payload.get('startsAt'), 'Event start')
    ends_at = _parse_datetime(payload.get('endsAt'), 'Event end')
    if ends_at <= starts_at:
        raise ValueError('Event end must be after its start.')
    try:
        funding_pledged = float(payload.get('fundingPledged', 0))
        funding_received = float(payload.get('fundingReceived', 0))
    except (OverflowError, TypeError, ValueError) as exc:
        raise ValueError('Sponsor funding amounts must be valid numbers.') from exc
    if (
        not math.isfinite(funding_pledged)
        or not math.isfinite(funding_received)
        or funding_pledged < 0
        or funding_received < 0
        or funding_received > funding_pledged
        or funding_pledged > MAX_EVENT_AMOUNT
    ):
        raise ValueError(
            'Funding amounts must be non-negative, received funding cannot exceed the pledge, '
            'and the pledge must fit within the supported limit.'
        )
    prizes = payload.get('prizes')
    if not isinstance(prizes, list) or len(prizes) != 3:
        raise ValueError('Define a prize for each of the top three places.')
    normalized_prizes = []
    for place, prize in enumerate(prizes, 1):
        if not isinstance(prize, dict):
            raise ValueError('Each place needs a prize description and value.')
        description = str(prize.get('description') or '').strip()
        try:
            value = float(prize.get('value', 0))
        except (OverflowError, TypeError, ValueError) as exc:
            raise ValueError('Prize values must be valid numbers.') from exc
        if not math.isfinite(value):
            raise ValueError('Prize values must be finite numbers.')
        if not description or len(description) > 255 or value < 0 or value > MAX_EVENT_AMOUNT:
            raise ValueError('Each place needs a prize description and a non-negative value.')
        normalized_prizes.append({'place': place, 'description': description, 'value': round(value, 2)})
    if sum(prize['value'] for prize in normalized_prizes) > MAX_EVENT_AMOUNT:
        raise ValueError('The combined prize value is too large.')
    return {
        'name': name,
        'description': str(payload.get('description') or '').strip(),
        'image': str(payload.get('image') or 'T').strip()[:20] or 'T',
        'sponsorName': sponsor_name,
        'sponsorLogoUrl': _http_url(payload.get('sponsorLogoUrl'), 'Sponsor logo URL'),
        'poweredBy': str(payload.get('poweredBy') or '').strip()[:150] or None,
        'sponsorMessage': str(payload.get('sponsorMessage') or '').strip() or None,
        'sponsorLink': _http_url(payload.get('sponsorLink'), 'Sponsor link'),
        'startsAt': starts_at,
        'endsAt': ends_at,
        'eligibility': eligibility,
        'rules': rules,
        'fundingPledged': round(funding_pledged, 2),
        'fundingReceived': round(funding_received, 2),
        'prizes': normalized_prizes,
    }


def _serialize_event(row: Dict[str, Any], prizes: list[Dict[str, Any]]) -> Dict[str, Any]:
    starts_at = row['starts_at']
    ends_at = row['ends_at']
    now = datetime.utcnow()
    status = 'upcoming' if now < starts_at else 'completed' if now >= ends_at else 'active'
    return {
        'id': int(row['tournament_id']),
        'name': row['name'],
        'description': row.get('description') or '',
        'image': row.get('image') or 'T',
        'sponsorName': row['sponsor_name'],
        'sponsorLogoUrl': row.get('sponsor_logo_url'),
        'poweredBy': row.get('powered_by'),
        'sponsorMessage': row.get('sponsor_message'),
        'sponsorLink': row.get('sponsor_link'),
        'startsAt': starts_at.isoformat() + 'Z',
        'endsAt': ends_at.isoformat() + 'Z',
        'status': status,
        'eligibility': row['eligibility'],
        'rules': row['rules'],
        'termsHash': hashlib.sha256(
            f"{row['eligibility']}\n{row['rules']}".encode('utf-8')
        ).hexdigest(),
        'fundingPledged': float(row.get('funding_pledged') or 0),
        'fundingReceived': float(row.get('funding_received') or 0),
        'participants': int(row.get('participants') or 0),
        'entered': bool(row.get('entered')),
        'raceAttempts': int(row.get('race_attempts') or 0),
        'raceCompletions': int(row.get('race_completions') or 0),
        'prizes': [
            {
                'place': int(prize['place']),
                'description': prize['prize_description'],
                'value': float(prize['prize_value'] or 0),
                'status': prize['status'],
                'winnerUsername': prize.get('winner_username'),
                'winnerUserId': int(prize['winner_user_id']) if prize.get('winner_user_id') else None,
                'adminNote': prize.get('admin_note') or '',
            }
            for prize in prizes
        ],
    }


def _event_row(cur, event_id: int, *, lock: bool = False) -> Optional[Dict[str, Any]]:
    query = '''
        SELECT t.id AS tournament_id, t.name, t.description, t.image,
               se.sponsor_name, se.sponsor_logo_url, se.powered_by,
               se.sponsor_message, se.sponsor_link, se.starts_at, se.ends_at,
               se.eligibility, se.rules, se.funding_pledged, se.funding_received,
               (SELECT COUNT(*) FROM sponsored_event_entries ee WHERE ee.tournament_id=t.id) AS participants,
               (SELECT COUNT(*) FROM sponsored_event_attempts ea WHERE ea.tournament_id=t.id) AS race_attempts,
               (SELECT COUNT(*) FROM sponsored_event_attempts ea WHERE ea.tournament_id=t.id AND ea.status='completed') AS race_completions
        FROM tournaments t
        JOIN sponsored_events se ON se.tournament_id=t.id
        WHERE t.id=%s
    '''
    if lock:
        query += ' FOR UPDATE'
    cur.execute(query, (event_id,))
    return cur.fetchone()


def _event_prizes(cur, event_id: int) -> list[Dict[str, Any]]:
    cur.execute(
        '''
        SELECT p.*, u.username AS winner_username
        FROM sponsored_event_prizes p
        LEFT JOIN users u ON u.id=p.winner_user_id
        WHERE p.tournament_id=%s
        ORDER BY p.place
        ''',
        (event_id,),
    )
    return cur.fetchall()


def _serialize_with_prizes(cur, row: Dict[str, Any]) -> Dict[str, Any]:
    return _serialize_event(row, _event_prizes(cur, int(row['tournament_id'])))


def record_sponsored_event_attempt(cur, *, user_id: int, race_token: str) -> None:
    if not race_token:
        return
    token_hash = hashlib.sha256(race_token.encode('utf-8')).hexdigest()
    cur.execute(
        '''
        SELECT se.tournament_id
        FROM sponsored_events se
        JOIN sponsored_event_entries ee ON ee.tournament_id=se.tournament_id
        WHERE ee.user_id=%s AND UTC_TIMESTAMP()>=se.starts_at AND UTC_TIMESTAMP()<se.ends_at
        ''',
        (user_id,),
    )
    for row in cur.fetchall():
        cur.execute(
            '''
            INSERT IGNORE INTO sponsored_event_attempts
                (tournament_id, user_id, token_hash, started_at)
            VALUES (%s, %s, %s, UTC_TIMESTAMP())
            ''',
            (row['tournament_id'], user_id, token_hash),
        )


def complete_sponsored_event_attempt(
    cur,
    *,
    user_id: int,
    race_token: str,
    race_code: str,
    wpm: float,
    verified: bool,
) -> None:
    if not race_token:
        return
    token_hash = hashlib.sha256(race_token.encode('utf-8')).hexdigest()
    cur.execute(
        '''
        SELECT a.tournament_id, se.ends_at
        FROM sponsored_event_attempts a
        JOIN sponsored_events se ON se.tournament_id=a.tournament_id
        WHERE a.user_id=%s AND a.token_hash=%s AND a.status='started'
        FOR UPDATE
        ''',
        (user_id, token_hash),
    )
    for row in cur.fetchall():
        if verified and datetime.utcnow() < row['ends_at']:
            cur.execute(
                '''
                UPDATE sponsored_event_attempts
                SET status='completed', race_code=%s, wpm=%s, completed_at=UTC_TIMESTAMP()
                WHERE tournament_id=%s AND user_id=%s AND token_hash=%s AND status='started'
                ''',
                (race_code, round(wpm, 2), row['tournament_id'], user_id, token_hash),
            )
        else:
            cur.execute(
                '''
                UPDATE sponsored_event_attempts
                SET status='rejected', completed_at=UTC_TIMESTAMP()
                WHERE tournament_id=%s AND user_id=%s AND token_hash=%s AND status='started'
                ''',
                (row['tournament_id'], user_id, token_hash),
            )


def _rankings(cur, event_id: int, limit: Optional[int] = None) -> list[Dict[str, Any]]:
    query = '''
        SELECT a.user_id, u.username,
               ROUND(SUM(a.wpm), 2) AS points,
               COUNT(*) AS race_count,
               MIN(a.completed_at) AS first_qualifying_at
        FROM sponsored_event_attempts a
        JOIN users u ON u.id=a.user_id
        WHERE a.tournament_id=%s AND a.status='completed'
        GROUP BY a.user_id, u.username
        ORDER BY points DESC, first_qualifying_at ASC, a.user_id ASC
    '''
    params: tuple[Any, ...] = (event_id,)
    if limit is not None:
        query += ' LIMIT %s'
        params = (event_id, limit)
    cur.execute(query, params)
    return cur.fetchall()


def register_sponsored_event_routes(
    app: Flask,
    *,
    get_connection: Callable[[], Any],
    return_connection: Callable[[Any], None],
    get_user: Callable[[Any], Optional[Dict[str, Any]]],
    is_admin_email: Callable[[str], bool],
) -> Callable[..., None]:
    schema_ready = False
    schema_lock = Lock()

    def ensure_schema(cur) -> None:
        nonlocal schema_ready
        if schema_ready:
            return
        with schema_lock:
            if not schema_ready:
                ensure_sponsored_event_schema(cur)
                schema_ready = True

    def require_admin(conn):
        user = get_user(conn)
        if not user or not is_admin_email(str(user.get('email') or '')):
            return None
        return user

    @app.get('/api/sponsored-events')
    def list_sponsored_events():
        conn = get_connection()
        try:
            user = get_user(conn)
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute(
                    '''
                    SELECT t.id AS tournament_id, t.name, t.description, t.image,
                           se.sponsor_name, se.sponsor_logo_url, se.powered_by,
                           se.sponsor_message, se.sponsor_link, se.starts_at, se.ends_at,
                           se.eligibility, se.rules, se.funding_pledged, se.funding_received,
                           (SELECT COUNT(*) FROM sponsored_event_entries ee WHERE ee.tournament_id=t.id) AS participants,
                           (SELECT COUNT(*) FROM sponsored_event_attempts ea WHERE ea.tournament_id=t.id) AS race_attempts,
                           (SELECT COUNT(*) FROM sponsored_event_attempts ea WHERE ea.tournament_id=t.id AND ea.status='completed') AS race_completions
                    FROM tournaments t JOIN sponsored_events se ON se.tournament_id=t.id
                    ORDER BY se.starts_at DESC
                    '''
                )
                rows = cur.fetchall()
                if user:
                    for row in rows:
                        cur.execute(
                            'SELECT 1 FROM sponsored_event_entries WHERE tournament_id=%s AND user_id=%s',
                            (row['tournament_id'], user['id']),
                        )
                        row['entered'] = bool(cur.fetchone())
                events = [_serialize_with_prizes(cur, row) for row in rows]
            conn.commit()
            return jsonify(events)
        finally:
            return_connection(conn)

    @app.post('/api/sponsored-events/<int:event_id>/metrics')
    def record_sponsored_event_metric(event_id: int):
        payload = request.get_json(silent=True) or {}
        metric = str(payload.get('metric') or '').strip()
        if metric not in EVENT_METRICS:
            return jsonify({'message': 'Metric must be event_page_view, results_view, or sponsor_impression.'}), 400
        conn = get_connection()
        try:
            user = get_user(conn)
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute('SELECT tournament_id FROM sponsored_events WHERE tournament_id=%s', (event_id,))
                if not cur.fetchone():
                    return jsonify({'message': 'Sponsored event not found.'}), 404
                cur.execute(
                    'INSERT INTO sponsored_event_metrics (tournament_id, metric_type, user_id) VALUES (%s, %s, %s)',
                    (event_id, metric, user.get('id') if user else None),
                )
            conn.commit()
            return jsonify({'success': True}), 201
        finally:
            return_connection(conn)

    @app.post('/api/sponsored-events/<int:event_id>/join')
    def join_sponsored_event(event_id: int):
        payload = request.get_json(silent=True) or {}
        terms_hash = str(payload.get('termsHash') or '')
        if (
            payload.get('termsAccepted') is not True
            or len(terms_hash) != 64
            or any(char not in '0123456789abcdef' for char in terms_hash)
        ):
            return jsonify({'message': 'Accept the event eligibility and rules before joining.'}), 400
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to join this free-entry event.'}), 401
            with conn.cursor() as cur:
                ensure_schema(cur)
                event = _event_row(cur, event_id, lock=True)
                if not event:
                    return jsonify({'message': 'Sponsored event not found.'}), 404
                expected_terms_hash = hashlib.sha256(
                    f"{event['eligibility']}\n{event['rules']}".encode('utf-8')
                ).hexdigest()
                if not hmac.compare_digest(terms_hash, expected_terms_hash):
                    return jsonify({'message': 'The event rules changed. Review and accept the current rules before joining.'}), 409
                now = datetime.utcnow()
                if now >= event['ends_at']:
                    return jsonify({'message': 'This event has already ended.'}), 400
                cur.execute(
                    '''
                    INSERT IGNORE INTO sponsored_event_entries
                        (tournament_id, user_id, terms_accepted_at, terms_hash)
                    VALUES (%s, %s, UTC_TIMESTAMP(), %s)
                    ''',
                    (event_id, user['id'], terms_hash),
                )
                cur.execute(
                    'SELECT terms_accepted_at FROM sponsored_event_entries WHERE tournament_id=%s AND user_id=%s',
                    (event_id, user['id']),
                )
                entry = cur.fetchone()
            conn.commit()
            return jsonify({
                'success': True,
                'message': 'You are entered. Verified races started and completed before the event closes add their WPM to your points.',
                'termsAcceptedAt': entry['terms_accepted_at'].isoformat() + 'Z',
            }), 201
        finally:
            return_connection(conn)

    @app.get('/api/sponsored-events/<int:event_id>/standings')
    def sponsored_event_standings(event_id: int):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_schema(cur)
                event = _event_row(cur, event_id)
                if not event:
                    return jsonify({'message': 'Sponsored event not found.'}), 404
                rows = _rankings(cur, event_id, 100)
            conn.commit()
            return jsonify({
                'eventId': event_id,
                'standings': [
                    {
                        'place': index,
                        'username': row['username'],
                        'points': float(row['points'] or 0),
                        'races': int(row['race_count'] or 0),
                        'firstQualifyingAt': row['first_qualifying_at'].isoformat() + 'Z',
                    }
                    for index, row in enumerate(rows, 1)
                ],
            })
        finally:
            return_connection(conn)

    @app.post('/api/sponsored-events/<int:event_id>/disputes')
    def submit_sponsored_event_dispute(event_id: int):
        payload = request.get_json(silent=True) or {}
        message = str(payload.get('message') or '').strip()
        if not message or len(message) > 2000:
            return jsonify({'message': 'Describe the result issue in 1–2000 characters.'}), 400
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to dispute your event result.'}), 401
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute(
                    'SELECT ends_at FROM sponsored_events WHERE tournament_id=%s',
                    (event_id,),
                )
                event = cur.fetchone()
                if not event:
                    return jsonify({'message': 'Sponsored event not found.'}), 404
                if datetime.utcnow() < event['ends_at'] or datetime.utcnow() > event['ends_at'] + timedelta(days=7):
                    return jsonify({'message': 'Result disputes are available for seven days after the event closes.'}), 400
                cur.execute(
                    '''
                    SELECT id FROM sponsored_event_entries
                    WHERE tournament_id=%s AND user_id=%s
                    ''',
                    (event_id, user['id']),
                )
                if not cur.fetchone():
                    return jsonify({'message': 'Only event participants can dispute a result.'}), 403
                cur.execute(
                    '''
                    SELECT id FROM sponsored_event_disputes
                    WHERE tournament_id=%s AND user_id=%s AND status='open'
                    LIMIT 1
                    ''',
                    (event_id, user['id']),
                )
                if cur.fetchone():
                    return jsonify({'message': 'You already have an open dispute for this event.'}), 409
                cur.execute(
                    '''
                    INSERT INTO sponsored_event_disputes (tournament_id, user_id, message)
                    VALUES (%s, %s, %s)
                    ''',
                    (event_id, user['id'], message),
                )
                dispute_id = cur.lastrowid
            conn.commit()
            return jsonify({'message': 'Your result dispute was submitted for admin review.', 'disputeId': dispute_id}), 201
        finally:
            return_connection(conn)

    @app.get('/api/admin/sponsored-events')
    def admin_list_sponsored_events():
        conn = get_connection()
        try:
            if not require_admin(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute(
                    '''
                    SELECT t.id AS tournament_id, t.name, t.description, t.image,
                           se.sponsor_name, se.sponsor_logo_url, se.powered_by,
                           se.sponsor_message, se.sponsor_link, se.starts_at, se.ends_at,
                           se.eligibility, se.rules, se.funding_pledged, se.funding_received,
                           (SELECT COUNT(*) FROM sponsored_event_entries ee WHERE ee.tournament_id=t.id) AS participants,
                           (SELECT COUNT(*) FROM sponsored_event_attempts ea WHERE ea.tournament_id=t.id) AS race_attempts,
                           (SELECT COUNT(*) FROM sponsored_event_attempts ea WHERE ea.tournament_id=t.id AND ea.status='completed') AS race_completions
                    FROM tournaments t JOIN sponsored_events se ON se.tournament_id=t.id
                    ORDER BY se.starts_at DESC
                    '''
                )
                events = [_serialize_with_prizes(cur, row) for row in cur.fetchall()]
            conn.commit()
            return jsonify({'events': events})
        finally:
            return_connection(conn)

    @app.post('/api/admin/sponsored-events')
    def admin_create_sponsored_event():
        conn = get_connection()
        try:
            if not require_admin(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            try:
                event = validate_event_payload(request.get_json(silent=True) or {})
            except ValueError as exc:
                return jsonify({'message': str(exc)}), 400
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute(
                    '''
                    INSERT INTO tournaments
                        (name, description, entry_fee, prize_pool, participants, max_participants,
                         status, start_time, duration, image, match_duration_mins)
                    VALUES (%s, %s, 0, %s, 0, 0, 'upcoming', %s, 'sponsored', %s, 1)
                    ''',
                    (
                        event['name'], event['description'],
                        sum(prize['value'] for prize in event['prizes']),
                        event['startsAt'], event['image'],
                    ),
                )
                event_id = cur.lastrowid
                cur.execute(
                    '''
                    INSERT INTO sponsored_events
                        (tournament_id, sponsor_name, sponsor_logo_url, powered_by, sponsor_message,
                         sponsor_link, starts_at, ends_at, eligibility, rules,
                         funding_pledged, funding_received)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ''',
                    (
                        event_id, event['sponsorName'], event['sponsorLogoUrl'], event['poweredBy'],
                        event['sponsorMessage'], event['sponsorLink'], event['startsAt'],
                        event['endsAt'], event['eligibility'], event['rules'],
                        event['fundingPledged'], event['fundingReceived'],
                    ),
                )
                for prize in event['prizes']:
                    cur.execute(
                        '''
                        INSERT INTO sponsored_event_prizes
                            (tournament_id, place, prize_description, prize_value)
                        VALUES (%s, %s, %s, %s)
                        ''',
                        (event_id, prize['place'], prize['description'], prize['value']),
                    )
                saved = _event_row(cur, event_id)
                serialized = _serialize_with_prizes(cur, saved)
            conn.commit()
            return jsonify({'message': 'Free-entry sponsored tournament created.', 'event': serialized}), 201
        finally:
            return_connection(conn)

    @app.put('/api/admin/sponsored-events/<int:event_id>')
    def admin_update_sponsored_event(event_id: int):
        conn = get_connection()
        try:
            if not require_admin(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            try:
                event = validate_event_payload(request.get_json(silent=True) or {})
            except ValueError as exc:
                return jsonify({'message': str(exc)}), 400
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute(
                    '''
                    SELECT se.eligibility, se.rules, se.starts_at, se.ends_at,
                           (SELECT COUNT(*) FROM sponsored_event_entries ee
                            WHERE ee.tournament_id=se.tournament_id) AS participants
                    FROM sponsored_events se
                    WHERE se.tournament_id=%s
                    FOR UPDATE
                    ''',
                    (event_id,),
                )
                existing = cur.fetchone()
                if not existing:
                    return jsonify({'message': 'Sponsored event not found.'}), 404
                if int(existing['participants'] or 0):
                    cur.execute(
                        '''
                        SELECT place, prize_description, prize_value
                        FROM sponsored_event_prizes
                        WHERE tournament_id=%s
                        ORDER BY place
                        ''',
                        (event_id,),
                    )
                    existing_prizes = cur.fetchall()
                    terms_changed = (
                        existing['eligibility'] != event['eligibility']
                        or existing['rules'] != event['rules']
                        or existing['starts_at'] != event['startsAt']
                        or existing['ends_at'] != event['endsAt']
                    )
                    prizes_changed = len(existing_prizes) != len(event['prizes']) or any(
                        int(old['place']) != new['place']
                        or old['prize_description'] != new['description']
                        or float(old['prize_value']) != new['value']
                        for old, new in zip(existing_prizes, event['prizes'])
                    )
                    if terms_changed or prizes_changed:
                        return jsonify({
                            'message': 'Eligibility, rules, schedule, and prizes cannot change after players have entered.'
                        }), 409
                cur.execute(
                    '''
                    UPDATE tournaments
                    SET name=%s, description=%s, entry_fee=0, prize_pool=%s, start_time=%s, image=%s
                    WHERE id=%s
                    ''',
                    (
                        event['name'], event['description'],
                        sum(prize['value'] for prize in event['prizes']),
                        event['startsAt'], event['image'], event_id,
                    ),
                )
                cur.execute(
                    '''
                    UPDATE sponsored_events
                    SET sponsor_name=%s, sponsor_logo_url=%s, powered_by=%s, sponsor_message=%s,
                        sponsor_link=%s, starts_at=%s, ends_at=%s, eligibility=%s, rules=%s,
                        funding_pledged=%s, funding_received=%s
                    WHERE tournament_id=%s
                    ''',
                    (
                        event['sponsorName'], event['sponsorLogoUrl'], event['poweredBy'],
                        event['sponsorMessage'], event['sponsorLink'], event['startsAt'],
                        event['endsAt'], event['eligibility'], event['rules'],
                        event['fundingPledged'], event['fundingReceived'], event_id,
                    ),
                )
                for prize in event['prizes']:
                    cur.execute(
                        '''
                        UPDATE sponsored_event_prizes
                        SET prize_description=%s, prize_value=%s
                        WHERE tournament_id=%s AND place=%s
                        ''',
                        (prize['description'], prize['value'], event_id, prize['place']),
                    )
                saved = _event_row(cur, event_id)
                serialized = _serialize_with_prizes(cur, saved)
            conn.commit()
            return jsonify({'message': 'Sponsored tournament updated.', 'event': serialized})
        finally:
            return_connection(conn)

    @app.get('/api/admin/sponsored-events/<int:event_id>/report')
    def admin_sponsored_event_report(event_id: int):
        conn = get_connection()
        try:
            if not require_admin(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute('SELECT tournament_id FROM sponsored_events WHERE tournament_id=%s', (event_id,))
                if not cur.fetchone():
                    return jsonify({'message': 'Sponsored event not found.'}), 404
                cur.execute(
                    '''
                    SELECT
                        (SELECT COUNT(*) FROM sponsored_event_entries WHERE tournament_id=%s) AS unique_participants,
                        (SELECT COUNT(*) FROM sponsored_event_attempts WHERE tournament_id=%s) AS race_attempts,
                        (SELECT COUNT(*) FROM sponsored_event_attempts WHERE tournament_id=%s AND status='completed') AS completed_races,
                        (SELECT COUNT(*) FROM sponsored_event_metrics WHERE tournament_id=%s AND metric_type='event_page_view') AS event_page_views,
                        (SELECT COUNT(*) FROM sponsored_event_metrics WHERE tournament_id=%s AND metric_type='results_view') AS results_views,
                        (SELECT COUNT(*) FROM sponsored_event_metrics WHERE tournament_id=%s AND metric_type='sponsor_impression') AS sponsor_impressions
                    ''',
                    (event_id, event_id, event_id, event_id, event_id, event_id),
                )
                report = cur.fetchone() or {}
                attempts = int(report.get('race_attempts') or 0)
                report = {
                    'uniqueParticipants': int(report.get('unique_participants') or 0),
                    'raceAttempts': attempts,
                    'completedRaces': int(report.get('completed_races') or 0),
                    'eventPageViews': int(report.get('event_page_views') or 0),
                    'resultsViews': int(report.get('results_views') or 0),
                    'sponsorImpressions': int(report.get('sponsor_impressions') or 0),
                    'averageRacesPerParticipant': round(
                        attempts / max(1, int(report.get('unique_participants') or 0)), 2
                    ),
                }
            conn.commit()
            return jsonify({'report': report})
        finally:
            return_connection(conn)

    @app.post('/api/admin/sponsored-events/<int:event_id>/standings/refresh')
    def admin_refresh_sponsored_standings(event_id: int):
        conn = get_connection()
        try:
            if not require_admin(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                ensure_schema(cur)
                event = _event_row(cur, event_id, lock=True)
                if not event:
                    return jsonify({'message': 'Sponsored event not found.'}), 404
                if datetime.utcnow() < event['ends_at']:
                    return jsonify({'message': 'Standings can only be finalized after the event closes.'}), 409
                cur.execute(
                    "SELECT id FROM sponsored_event_prizes WHERE tournament_id=%s AND status='paid' LIMIT 1",
                    (event_id,),
                )
                if cur.fetchone():
                    return jsonify({'message': 'Standings cannot be refreshed after a prize is marked paid.'}), 409
                rankings = _rankings(cur, event_id, 3)
                for place in range(1, 4):
                    winner_id = rankings[place - 1]['user_id'] if len(rankings) >= place else None
                    cur.execute(
                        '''
                        UPDATE sponsored_event_prizes
                        SET winner_user_id=%s,
                            status=CASE WHEN status IN ('pending','disputed') THEN 'under_review' ELSE status END
                        WHERE tournament_id=%s AND place=%s
                        ''',
                        (winner_id, event_id, place),
                    )
                prizes = _event_prizes(cur, event_id)
                serialized = [
                    {
                        'place': int(prize['place']),
                        'winnerUsername': prize.get('winner_username'),
                        'points': float(rankings[int(prize['place']) - 1]['points'] or 0)
                        if len(rankings) >= int(prize['place']) else 0,
                        'raceCount': int(rankings[int(prize['place']) - 1]['race_count'] or 0)
                        if len(rankings) >= int(prize['place']) else 0,
                        'prizeDescription': prize['prize_description'],
                        'prizeValue': float(prize['prize_value'] or 0),
                        'status': prize['status'],
                    }
                    for prize in prizes
                ]
            conn.commit()
            return jsonify({'message': 'Podium refreshed for admin review; no prizes were paid automatically.', 'prizes': serialized})
        finally:
            return_connection(conn)

    @app.put('/api/admin/sponsored-events/<int:event_id>/prizes/<int:place>')
    def admin_update_sponsored_prize(event_id: int, place: int):
        payload = request.get_json(silent=True) or {}
        new_status = str(payload.get('status') or '').strip()
        note = str(payload.get('adminNote') or '').strip()
        if place not in {1, 2, 3} or new_status not in PRIZE_STATUSES:
            return jsonify({'message': 'Use a valid place and prize status.'}), 400
        conn = get_connection()
        try:
            if not require_admin(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute(
                    'SELECT status FROM sponsored_event_prizes WHERE tournament_id=%s AND place=%s FOR UPDATE',
                    (event_id, place),
                )
                prize = cur.fetchone()
                if not prize:
                    return jsonify({'message': 'Prize record not found.'}), 404
                if new_status not in PRIZE_TRANSITIONS[prize['status']]:
                    return jsonify({'message': f"Cannot change prize status from {prize['status']} to {new_status}."}), 409
                cur.execute(
                    '''
                    UPDATE sponsored_event_prizes
                    SET status=%s, admin_note=%s,
                        paid_at=CASE WHEN %s='paid' THEN UTC_TIMESTAMP() ELSE NULL END
                    WHERE tournament_id=%s AND place=%s
                    ''',
                    (new_status, note or None, new_status, event_id, place),
                )
            conn.commit()
            return jsonify({'message': f'Prize status updated to {new_status}.'})
        finally:
            return_connection(conn)

    @app.get('/api/admin/sponsored-events/<int:event_id>/disputes')
    def admin_list_sponsored_event_disputes(event_id: int):
        conn = get_connection()
        try:
            if not require_admin(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute(
                    '''
                    SELECT d.id, d.user_id, u.username, d.message, d.status,
                           d.admin_response, d.created_at, d.resolved_at
                    FROM sponsored_event_disputes d
                    JOIN users u ON u.id=d.user_id
                    WHERE d.tournament_id=%s
                    ORDER BY d.created_at DESC
                    ''',
                    (event_id,),
                )
                disputes = [
                    {
                        'id': int(row['id']),
                        'username': row['username'],
                        'message': row['message'],
                        'status': row['status'],
                        'adminResponse': row.get('admin_response') or '',
                        'createdAt': row['created_at'].isoformat() + 'Z',
                    }
                    for row in cur.fetchall()
                ]
            conn.commit()
            return jsonify({'disputes': disputes})
        finally:
            return_connection(conn)

    @app.put('/api/admin/sponsored-events/<int:event_id>/disputes/<int:dispute_id>')
    def admin_resolve_sponsored_event_dispute(event_id: int, dispute_id: int):
        payload = request.get_json(silent=True) or {}
        status = str(payload.get('status') or '').strip()
        response = str(payload.get('adminResponse') or '').strip()
        if status not in {'resolved', 'rejected'} or len(response) > 2000:
            return jsonify({'message': 'Select resolved/rejected and enter an optional response under 2000 characters.'}), 400
        conn = get_connection()
        try:
            if not require_admin(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                ensure_schema(cur)
                cur.execute(
                    '''
                    UPDATE sponsored_event_disputes
                    SET status=%s, admin_response=%s, resolved_at=UTC_TIMESTAMP()
                    WHERE id=%s AND tournament_id=%s AND status='open'
                    ''',
                    (status, response or None, dispute_id, event_id),
                )
                if cur.rowcount == 0:
                    return jsonify({'message': 'Open dispute not found.'}), 404
            conn.commit()
            return jsonify({'message': f'Dispute marked {status}.'})
        finally:
            return_connection(conn)

    return ensure_schema
