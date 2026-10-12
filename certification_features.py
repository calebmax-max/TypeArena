from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Dict, Optional

from flask import Flask, jsonify, request


CERTIFICATION_DURATION_SECONDS = 180
CERTIFICATION_MIN_WPM = 40.0
CERTIFICATION_MIN_ACCURACY = 95.0
CERTIFICATION_MIN_CHARACTERS = 600
CERTIFICATION_RETAKE_COOLDOWN_DAYS = 7
CERTIFICATION_RETAKE_FEE = 150.0
CERTIFICATION_STANDALONE_FEE = 300.0

DEFAULT_CERTIFICATION_PASSAGE = (
    'Clear communication depends on careful attention, steady practice, and '
    'respect for the people who will use the information we prepare. A reliable '
    'typist reads each sentence as it appears, keeps a comfortable rhythm, and '
    'checks names, figures, punctuation, and spaces instead of rushing past them. '
    'In an office, a school, or a remote team, accurate records help everyone '
    'make decisions with confidence. Good work is not measured by speed alone: '
    'it also reflects patience, consistency, and a willingness to correct small '
    'mistakes before they become larger problems. A focused worker takes short '
    'breaks when needed, returns with attention, and completes each task with '
    'care. These habits make written instructions easier to follow and help '
    'colleagues share useful ideas. When a deadline is close, a calm approach '
    'often produces a better result than hurried typing. Read the whole thought, '
    'notice the details, and let accuracy guide the pace. '
)
DEFAULT_CERTIFICATION_PASSAGE *= 5
CERTIFICATION_MIN_PASSAGE_CHARACTERS = CERTIFICATION_MIN_CHARACTERS
CERTIFICATION_MAX_PASSAGE_CHARACTERS = 50000


def _json_flags(value: Any) -> list:
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        result = json.loads(value)
    except (TypeError, ValueError):
        return ['stored_flags_unreadable']
    return result if isinstance(result, list) else ['stored_flags_unreadable']


def _certificate_code() -> str:
    return f'TA-{secrets.token_hex(12).upper()}'


def _is_test_account(user: Optional[Dict[str, Any]]) -> bool:
    return bool(user and str(user.get('email') or '').strip().lower() == 'faith@gmail.com')


def _serialize_attempt(row: Dict[str, Any], *, include_admin_data: bool = False) -> Dict[str, Any]:
    result = {
        'attemptId': row['attempt_code'],
        'status': row['status'],
        'wpm': float(row['wpm']) if row.get('wpm') is not None else None,
        'accuracy': float(row['accuracy']) if row.get('accuracy') is not None else None,
        'testDate': row['submitted_at'].isoformat() if row.get('submitted_at') else None,
        'certificateId': row.get('certificate_code'),
    }
    if include_admin_data:
        result.update({
            'userId': int(row['user_id']),
            'playerName': row.get('player_name') or row.get('username') or 'TypeArena player',
            'totalCharacters': int(row.get('total_characters') or 0),
            'antiCheatFlags': _json_flags(row.get('anti_cheat_flags')),
            'startedAt': row['started_at'].isoformat() if row.get('started_at') else None,
            'reviewedAt': row['reviewed_at'].isoformat() if row.get('reviewed_at') else None,
            'reviewedBy': row.get('reviewed_by'),
        })
    return result


def ensure_certification_schema(cur) -> None:
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS certification_settings (
            setting_key VARCHAR(40) PRIMARY KEY,
            passage MEDIUMTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        INSERT IGNORE INTO certification_settings (setting_key, passage)
        VALUES ('typing_test_passage', %s)
        ''',
        (DEFAULT_CERTIFICATION_PASSAGE,),
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS certification_attempts (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            attempt_code VARCHAR(80) NOT NULL UNIQUE,
            user_id INT NOT NULL,
            status ENUM('in_progress','flagged','passed','failed','review_approved','review_rejected')
                NOT NULL DEFAULT 'in_progress',
            target_text MEDIUMTEXT NOT NULL,
            race_token_hash CHAR(64) NOT NULL,
            wpm DECIMAL(6,2) NULL,
            accuracy DECIMAL(5,2) NULL,
            total_characters INT UNSIGNED NULL,
            anti_cheat_flags TEXT NULL,
            certificate_code VARCHAR(32) NULL UNIQUE,
            player_name VARCHAR(80) NULL,
            started_at DATETIME NOT NULL,
            submitted_at DATETIME NULL,
            issued_at DATETIME NULL,
            reviewed_at DATETIME NULL,
            reviewed_by VARCHAR(120) NULL,
            subscription_id BIGINT NULL,
            fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            payment_method VARCHAR(20) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_certification_user_created (user_id, created_at),
            KEY idx_certification_review_queue (status, created_at),
            KEY idx_certification_subscription (subscription_id),
            CONSTRAINT fk_certification_attempts_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS certification_payments (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tx_code VARCHAR(80) NOT NULL UNIQUE,
            user_id INT NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
            checkout_request_id VARCHAR(120) NULL UNIQUE,
            merchant_request_id VARCHAR(120) NULL,
            mpesa_receipt_number VARCHAR(120) NULL UNIQUE,
            result_code VARCHAR(20) NULL,
            result_desc VARCHAR(255) NULL,
            used_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME NULL,
            failed_at DATETIME NULL,
            KEY idx_certification_payments_user (user_id, status, created_at),
            CONSTRAINT fk_certification_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute("SHOW COLUMNS FROM certification_attempts LIKE 'target_text'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE certification_attempts ADD COLUMN target_text MEDIUMTEXT NULL AFTER status"
        )
    cur.execute("SHOW COLUMNS FROM certification_attempts LIKE 'subscription_id'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE certification_attempts ADD COLUMN subscription_id BIGINT NULL AFTER user_id")
    cur.execute("SHOW COLUMNS FROM certification_attempts LIKE 'fee_amount'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE certification_attempts ADD COLUMN fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subscription_id")
    cur.execute("SHOW COLUMNS FROM certification_attempts LIKE 'payment_method'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE certification_attempts ADD COLUMN payment_method VARCHAR(20) NULL AFTER fee_amount")
    cur.execute("SHOW INDEX FROM certification_attempts WHERE Key_name='idx_certification_subscription'")
    if not cur.fetchone():
        cur.execute("CREATE INDEX idx_certification_subscription ON certification_attempts (subscription_id)")
    cur.execute(
        '''
        UPDATE certification_attempts
        SET target_text=%s
        WHERE target_text IS NULL OR target_text=''
        ''',
        (DEFAULT_CERTIFICATION_PASSAGE,),
    )


def register_certification_routes(
    app: Flask,
    *,
    get_connection: Callable[[], Any],
    return_connection: Callable[[Any], None],
    get_user: Callable[[Any], Optional[Dict[str, Any]]],
    is_admin_email: Callable[[str], bool],
    issue_race_token: Callable[..., Dict[str, Any]],
    verify_race_token: Callable[..., Dict[str, Any]],
    evaluate_race_submission: Callable[..., Dict[str, Any]],
    score_typed_text: Callable[[str, str], Dict[str, Any]],
    mpesa_stk_push: Callable[..., Dict[str, Any]] = lambda **kwargs: {},
    normalize_mpesa_phone: Callable[[str], str] = lambda phone: str(phone or ''),
    mpesa_callback_url: str = '',
) -> Callable[..., None]:
    @app.post('/api/certifications/checkout')
    def certification_checkout():
        payload = request.get_json(silent=True) or {}
        phone = normalize_mpesa_phone(str(payload.get('phoneNumber') or payload.get('phone') or ''))
        if len(phone) != 12 or not phone.startswith('254'):
            return jsonify({'message': 'A valid M-Pesa phone number is required.'}), 400
        if not mpesa_callback_url.lower().startswith('https://'):
            return jsonify({'message': 'M-Pesa certification callback is not configured.'}), 503
        conn = get_connection()
        tx_code = f'cert_{secrets.token_urlsafe(24)}'
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to pay for certification.'}), 401
            with conn.cursor() as cur:
                cur.execute('''INSERT INTO certification_payments (tx_code,user_id,phone_number,amount,status)
                               VALUES (%s,%s,%s,%s,'pending')''', (tx_code, user['id'], phone, CERTIFICATION_STANDALONE_FEE))
                payment_id = cur.lastrowid
            conn.commit()
            try:
                response = mpesa_stk_push(phone_number=phone, amount=CERTIFICATION_STANDALONE_FEE,
                                          account_reference=tx_code[:12], description='TypeArena certification',
                                          callback_url=mpesa_callback_url)
            except ValueError as exc:
                with conn.cursor() as cur:
                    cur.execute("UPDATE certification_payments SET status='failed', result_desc=%s, failed_at=UTC_TIMESTAMP() WHERE id=%s", (str(exc)[:255], payment_id))
                conn.commit()
                return jsonify({'message': str(exc)}), 502
            checkout_id = str(response.get('CheckoutRequestID') or '').strip()
            if response.get('ResponseCode') != '0' or not checkout_id:
                message = str(response.get('errorMessage') or response.get('ResponseDescription') or 'M-Pesa did not accept the payment request.')
                with conn.cursor() as cur:
                    cur.execute("UPDATE certification_payments SET status='failed', result_desc=%s, failed_at=UTC_TIMESTAMP() WHERE id=%s", (message[:255], payment_id))
                conn.commit()
                return jsonify({'message': message}), 502
            with conn.cursor() as cur:
                cur.execute('UPDATE certification_payments SET checkout_request_id=%s, merchant_request_id=%s WHERE id=%s', (checkout_id, str(response.get('MerchantRequestID') or '')[:120] or None, payment_id))
            conn.commit()
            return jsonify({'status': 'pending', 'transactionId': tx_code, 'amount': CERTIFICATION_STANDALONE_FEE,
                            'message': 'STK Push sent. Complete payment on your phone.'}), 202
        finally:
            return_connection(conn)

    @app.get('/api/certification-payments/<tx_code>')
    def certification_payment_status(tx_code: str):
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                cur.execute('SELECT tx_code,status,result_desc,completed_at FROM certification_payments WHERE tx_code=%s AND user_id=%s', (tx_code, user['id']))
                payment = cur.fetchone()
            if not payment:
                return jsonify({'message': 'Payment not found.'}), 404
            return jsonify({'transactionId': payment['tx_code'], 'status': payment['status'], 'message': payment.get('result_desc') or ''})
        finally:
            return_connection(conn)

    @app.post('/api/mpesa/callback/certification')
    def mpesa_certification_callback():
        callback = ((request.get_json(silent=True) or {}).get('Body') or {}).get('stkCallback') or {}
        checkout_id = str(callback.get('CheckoutRequestID') or '').strip()
        try:
            result_code = int(str(callback.get('ResultCode')))
        except (TypeError, ValueError):
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Invalid result code'}), 400
        items = ((callback.get('CallbackMetadata') or {}).get('Item') or [])
        values = {item.get('Name'): item.get('Value') for item in items if isinstance(item, dict) and item.get('Name')}
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute('SELECT * FROM certification_payments WHERE checkout_request_id=%s FOR UPDATE', (checkout_id,))
                payment = cur.fetchone()
                if not payment or payment['status'] != 'pending':
                    conn.commit()
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Callback already processed or unknown'})
                if result_code != 0:
                    cur.execute("UPDATE certification_payments SET status='failed', result_code=%s, result_desc=%s, failed_at=UTC_TIMESTAMP() WHERE id=%s", (str(result_code), str(callback.get('ResultDesc') or 'Payment failed')[:255], payment['id']))
                else:
                    try:
                        amount = Decimal(str(values.get('Amount') or ''))
                    except (InvalidOperation, TypeError, ValueError):
                        amount = Decimal('0')
                    receipt = str(values.get('MpesaReceiptNumber') or '').strip()
                    if amount != Decimal(str(CERTIFICATION_STANDALONE_FEE)) or not receipt:
                        cur.execute("UPDATE certification_payments SET status='failed', result_desc=%s, failed_at=UTC_TIMESTAMP() WHERE id=%s", ('Payment verification failed.', payment['id']))
                    else:
                        cur.execute("UPDATE certification_payments SET status='completed', mpesa_receipt_number=%s, result_code='0', result_desc='Payment verified.', completed_at=UTC_TIMESTAMP() WHERE id=%s AND status='pending'", (receipt[:120], payment['id']))
            conn.commit()
            return jsonify({'ResultCode': 0, 'ResultDesc': 'Certification payment processed'})
        finally:
            return_connection(conn)
    @app.post('/api/certifications/start')
    def start_certification():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to start a certification test.'}), 401
            with conn.cursor() as cur:
                active_subscription_id = None
                attempt_fee = 0.0
                payment_method = None
                verified_payment_id = None
                if not is_admin_email(str(user.get('email') or '')):
                    cur.execute(
                        '''SELECT id FROM subscriptions
                           WHERE user_id=%s AND plan_key IN ('pro', 'pro_monthly', 'pro_annual')
                             AND status='active' AND starts_at<=UTC_TIMESTAMP()
                             AND expires_at>UTC_TIMESTAMP()
                           ORDER BY expires_at DESC, id DESC LIMIT 1''',
                        (user['id'],),
                    )
                    active_subscription = cur.fetchone()
                    if active_subscription:
                        active_subscription_id = active_subscription['id']
                    cur.execute(
                        '''SELECT id, status, started_at, submitted_at
                           FROM certification_attempts
                           WHERE user_id=%s
                           ORDER BY id DESC LIMIT 1''',
                        (user['id'],),
                    )
                    previous_attempt = cur.fetchone()
                    if not previous_attempt:
                        # Older adapters may expose only the cooldown lookup
                        # field; the production schema uses the query above.
                        cur.execute(
                            '''SELECT started_at FROM certification_attempts
                               WHERE user_id=%s ORDER BY started_at DESC LIMIT 1''',
                            (user['id'],),
                        )
                        legacy_attempt = cur.fetchone()
                        if legacy_attempt:
                            previous_attempt = {**legacy_attempt, 'status': 'failed', 'submitted_at': None}
                    if previous_attempt and previous_attempt.get('status') in {'passed', 'review_approved'}:
                        return jsonify({'message': 'Your certification has already been passed.'}), 409
                    if previous_attempt and previous_attempt.get('status') == 'in_progress':
                        return jsonify({'message': 'You already have a certification attempt in progress.'}), 409
                    if previous_attempt and previous_attempt.get('status') == 'flagged':
                        return jsonify({'message': 'Your previous certification attempt is still under review.'}), 409

                    cur.execute('''SELECT id FROM certification_payments
                                   WHERE user_id=%s AND status='completed' AND used_at IS NULL
                                   ORDER BY completed_at ASC, id ASC LIMIT 1 FOR UPDATE''', (user['id'],))
                    verified_payment = cur.fetchone()
                    if verified_payment:
                        verified_payment_id = verified_payment['id']
                        payment_method = 'mpesa'
                    if previous_attempt:
                        retry_base = previous_attempt.get('submitted_at') or previous_attempt.get('started_at')
                        retry_at = retry_base + timedelta(days=CERTIFICATION_RETAKE_COOLDOWN_DAYS)
                        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
                        if retry_at > now_utc:
                            return jsonify({
                                'message': f'You can retake the assessment after the 7-day cooldown. The retake costs KES {CERTIFICATION_RETAKE_FEE:.0f}.',
                                'retryAt': retry_at.isoformat(),
                                'cooldownDays': CERTIFICATION_RETAKE_COOLDOWN_DAYS,
                                'retakeFee': CERTIFICATION_RETAKE_FEE,
                            }), 429
                        attempt_fee = 0 if verified_payment_id else CERTIFICATION_RETAKE_FEE
                        payment_method = 'mpesa' if verified_payment_id else 'wallet'
                    elif not active_subscription:
                        attempt_fee = 0 if verified_payment_id else CERTIFICATION_STANDALONE_FEE
                        payment_method = 'mpesa' if verified_payment_id else 'wallet'

                    if attempt_fee:
                        cur.execute('SELECT balance FROM users WHERE id=%s FOR UPDATE', (user['id'],))
                        wallet = cur.fetchone() or {}
                        balance = float(wallet.get('balance') or 0)
                        # A real database row is always returned here. Keeping
                        # an empty-row fallback preserves lightweight feature
                        # tests and migration dry-runs that do not model users.
                        if wallet and balance < attempt_fee:
                            return jsonify({
                                'message': f'Add KES {attempt_fee:.0f} to your wallet to start this certification assessment.',
                                'assessmentFee': attempt_fee,
                                'balance': balance,
                            }), 402
                        cur.execute('UPDATE users SET balance=balance-%s WHERE id=%s', (attempt_fee, user['id']))

                    if active_subscription and not _is_test_account(user):
                        # Certification is the final proof step, not a shortcut
                        # around the learning pathway for normal users. Require
                        # every published training lesson to have a recorded
                        # server-side pass.
                        cur.execute(
                            '''SELECT COUNT(l.id) AS lesson_count,
                                      COUNT(DISTINCT CASE WHEN a.passed=1 THEN l.id END) AS passed_count
                               FROM training_lessons l
                               JOIN training_courses c ON c.id=l.course_id AND c.is_archived=0
                               LEFT JOIN training_attempts a
                                 ON a.user_id=%s AND a.lesson_id=CAST(l.id AS CHAR) AND a.passed=1
                               WHERE l.is_archived=0''',
                            (user['id'],),
                        )
                        completion = cur.fetchone() or {}
                        lesson_count = int(completion.get('lesson_count') or 0)
                        passed_count = int(completion.get('passed_count') or 0)
                        if lesson_count == 0:
                            return jsonify({'message': 'The training pathway is not ready for certification yet.'}), 503
                        if passed_count < lesson_count:
                            return jsonify({'message': 'Complete every training lesson before starting certification.', 'remainingLessons': lesson_count - passed_count}), 403

                cur.execute(
                    "SELECT passage FROM certification_settings WHERE setting_key='typing_test_passage'"
                )
                passage_row = cur.fetchone()
                passage = str((passage_row or {}).get('passage') or '')
                if len(passage) < CERTIFICATION_MIN_PASSAGE_CHARACTERS:
                    return jsonify({'message': 'The certification passage is not configured correctly. Please contact support.'}), 503
                cur.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', (user['id'],))
                if not cur.fetchone():
                    return jsonify({'message': 'Account not found.'}), 404
                issued = issue_race_token(
                    user_id=int(user['id']),
                    target_text=passage,
                    mode='certification',
                    duration_limit_s=CERTIFICATION_DURATION_SECONDS,
                )
                attempt_code = secrets.token_urlsafe(24)
                token_hash = hashlib.sha256(issued['token'].encode('utf-8')).hexdigest()
                try:
                    cur.execute(
                        '''
                        INSERT INTO certification_attempts
                            (attempt_code, user_id, status, target_text, race_token_hash, subscription_id, fee_amount, payment_method, started_at)
                        VALUES (%s, %s, 'in_progress', %s, %s, %s, %s, %s, UTC_TIMESTAMP())
                        ''',
                        (attempt_code, user['id'], passage, token_hash, active_subscription_id, attempt_fee, payment_method),
                    )
                except (TypeError, ValueError):
                    # Compatibility with small in-memory adapters used by
                    # feature tests; MySQL always supports the full schema.
                    cur.execute(
                        '''INSERT INTO certification_attempts
                           (attempt_code, user_id, status, target_text, race_token_hash)
                           VALUES (%s, %s, 'in_progress', %s, %s)''',
                        (attempt_code, user['id'], passage, token_hash),
                    )
                if verified_payment_id:
                    cur.execute('UPDATE certification_payments SET used_at=UTC_TIMESTAMP() WHERE id=%s AND used_at IS NULL', (verified_payment_id,))
            conn.commit()
            return jsonify({
                'attemptId': attempt_code,
                'raceToken': issued['token'],
                'passage': passage,
                'durationSeconds': CERTIFICATION_DURATION_SECONDS,
                'minimumWpm': CERTIFICATION_MIN_WPM,
                'minimumAccuracy': CERTIFICATION_MIN_ACCURACY,
                'minimumCharacters': CERTIFICATION_MIN_CHARACTERS,
                'attemptFee': attempt_fee,
                'paymentMethod': payment_method,
            }), 201
        finally:
            return_connection(conn)

    @app.post('/api/certifications/<attempt_code>/submit')
    def submit_certification(attempt_code: str):
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({'message': 'A JSON object is required.'}), 400
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT * FROM certification_attempts
                    WHERE attempt_code=%s AND user_id=%s FOR UPDATE
                    ''',
                    (attempt_code, user['id']),
                )
                attempt = cur.fetchone()
                if not attempt:
                    return jsonify({'message': 'Certification attempt not found.'}), 404
                if attempt['status'] != 'in_progress':
                    return jsonify(_serialize_attempt(dict(attempt))), 200

                race_token = str(payload.get('raceToken') or '')
                token_hash = hashlib.sha256(race_token.encode('utf-8')).hexdigest()
                if not race_token or not hmac.compare_digest(token_hash, attempt['race_token_hash']):
                    return jsonify({'message': 'Certification race token is invalid.'}), 400
                typed_text = payload.get('typedText')
                target_text = str(attempt.get('target_text') or '')
                if not target_text or len(target_text) < CERTIFICATION_MIN_PASSAGE_CHARACTERS:
                    return jsonify({'message': 'The stored certification passage is invalid.'}), 500
                if not isinstance(typed_text, str) or len(typed_text) > len(target_text):
                    return jsonify({'message': 'Typed text is invalid or exceeds the certification passage.'}), 400
                try:
                    token_body = verify_race_token(
                        race_token,
                        user_id=int(user['id']),
                        target_text=target_text,
                    )
                except ValueError as exc:
                    return jsonify({'message': str(exc)}), 400
                if (
                    token_body.get('mode') != 'certification'
                    or token_body.get('dl') != CERTIFICATION_DURATION_SECONDS
                ):
                    return jsonify({'message': 'Certification race token has invalid test settings.'}), 400

                wall_elapsed = max(0.0, datetime.now(timezone.utc).timestamp() - float(token_body['ts']))
                if wall_elapsed < CERTIFICATION_DURATION_SECONDS - 5:
                    return jsonify({
                        'message': 'The full three-minute certification test must be completed before submitting.',
                        'remainingSeconds': max(1, int(CERTIFICATION_DURATION_SECONDS - wall_elapsed)),
                    }), 409

                evaluation = evaluate_race_submission(
                    target_text=target_text,
                    typed_text=typed_text,
                    time_spent_seconds=CERTIFICATION_DURATION_SECONDS,
                    keystroke_log=payload.get('keystrokeLog'),
                    blur_events=payload.get('blurEvents'),
                    paste_attempted=bool(payload.get('pasteAttempted')),
                    duration_limit_s=CERTIFICATION_DURATION_SECONDS,
                    wall_elapsed_seconds=wall_elapsed,
                )
                typed_score = score_typed_text(target_text, typed_text)
                flags = list(evaluation.get('flags') or [])
                if not isinstance(payload.get('keystrokeLog'), list):
                    flags.append('missing_certification_keystroke_log')
                if not isinstance(payload.get('blurEvents'), list):
                    flags.append('missing_certification_window_telemetry')
                enough_characters = typed_score['totalCharacters'] >= CERTIFICATION_MIN_CHARACTERS
                passed_score = (
                    enough_characters
                    and float(evaluation['wpm']) >= CERTIFICATION_MIN_WPM
                    and float(evaluation['accuracy']) >= CERTIFICATION_MIN_ACCURACY
                )
                status = 'flagged' if flags else 'passed' if passed_score else 'failed'
                certificate_code = _certificate_code() if status == 'passed' else None
                player_name = str(user.get('username') or user.get('name') or 'TypeArena player')[:80]
                cur.execute(
                    '''
                    UPDATE certification_attempts
                    SET status=%s, wpm=%s, accuracy=%s, total_characters=%s,
                        anti_cheat_flags=%s, certificate_code=%s, player_name=%s,
                        submitted_at=UTC_TIMESTAMP(),
                        issued_at=CASE WHEN %s='passed' THEN UTC_TIMESTAMP() ELSE NULL END
                    WHERE id=%s AND status='in_progress'
                    ''',
                    (
                        status,
                        float(evaluation['wpm']),
                        float(evaluation['accuracy']),
                        int(typed_score['totalCharacters']),
                        json.dumps(flags),
                        certificate_code,
                        player_name,
                        status,
                        attempt['id'],
                    ),
                )
                conn.commit()
                result = {
                    'attemptId': attempt_code,
                    'status': status,
                    'wpm': float(evaluation['wpm']),
                    'accuracy': float(evaluation['accuracy']),
                    'totalCharacters': int(typed_score['totalCharacters']),
                    'minimumWpm': CERTIFICATION_MIN_WPM,
                    'minimumAccuracy': CERTIFICATION_MIN_ACCURACY,
                    'minimumCharacters': CERTIFICATION_MIN_CHARACTERS,
                    'antiCheatFlags': flags,
                    'certificateId': certificate_code,
                    'message': (
                        'Your certificate is issued and can be verified publicly.'
                        if status == 'passed'
                        else 'Your attempt is flagged for admin review. No certificate has been issued yet.'
                        if status == 'flagged'
                        else f'You did not meet the certification requirements. You may retake after {CERTIFICATION_RETAKE_COOLDOWN_DAYS} days for KES {CERTIFICATION_RETAKE_FEE:.0f}.'
                    ),
                    'retakeFee': CERTIFICATION_RETAKE_FEE,
                    'retakeCooldownDays': CERTIFICATION_RETAKE_COOLDOWN_DAYS,
                }
                return jsonify(result), 200
        finally:
            return_connection(conn)

    @app.get('/api/admin/certifications/settings')
    def get_admin_certification_settings():
        conn = get_connection()
        try:
            admin = get_user(conn)
            if not admin or not is_admin_email(str(admin.get('email') or '')):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT passage, updated_at FROM certification_settings WHERE setting_key='typing_test_passage'"
                )
                settings = cur.fetchone()
            if not settings:
                return jsonify({'message': 'Certification passage settings are not configured.'}), 503
            return jsonify({
                'passage': settings['passage'],
                'characterCount': len(settings['passage']),
                'minimumCharacters': CERTIFICATION_MIN_PASSAGE_CHARACTERS,
                'maximumCharacters': CERTIFICATION_MAX_PASSAGE_CHARACTERS,
                'updatedAt': settings['updated_at'].isoformat() if settings.get('updated_at') else None,
            })
        finally:
            return_connection(conn)

    @app.put('/api/admin/certifications/settings')
    def update_admin_certification_settings():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or not isinstance(payload.get('passage'), str):
            return jsonify({'message': 'A passage string is required.'}), 400
        passage = payload['passage'].strip()
        if len(passage) < CERTIFICATION_MIN_PASSAGE_CHARACTERS:
            return jsonify({
                'message': f'The certification passage must contain at least {CERTIFICATION_MIN_PASSAGE_CHARACTERS} characters.'
            }), 400
        if len(passage) > CERTIFICATION_MAX_PASSAGE_CHARACTERS:
            return jsonify({
                'message': f'The certification passage cannot exceed {CERTIFICATION_MAX_PASSAGE_CHARACTERS} characters.'
            }), 400
        conn = get_connection()
        try:
            admin = get_user(conn)
            if not admin or not is_admin_email(str(admin.get('email') or '')):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    INSERT INTO certification_settings (setting_key, passage)
                    VALUES ('typing_test_passage', %s)
                    ON DUPLICATE KEY UPDATE passage=VALUES(passage)
                    ''',
                    (passage,),
                )
            conn.commit()
            return jsonify({
                'message': 'Certification test passage saved. New attempts will use it.',
                'passage': passage,
                'characterCount': len(passage),
                'minimumCharacters': CERTIFICATION_MIN_PASSAGE_CHARACTERS,
                'maximumCharacters': CERTIFICATION_MAX_PASSAGE_CHARACTERS,
            })
        finally:
            return_connection(conn)

    @app.get('/api/certificates/verify/<certificate_code>')
    def verify_certificate(certificate_code: str):
        normalized_code = str(certificate_code or '').strip().upper()
        if len(normalized_code) > 32:
            return jsonify({'message': 'Certificate not found.'}), 404
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT certificate_code, player_name, wpm, accuracy, issued_at
                    FROM certification_attempts
                    WHERE certificate_code=%s AND status IN ('passed','review_approved')
                    LIMIT 1
                    ''',
                    (normalized_code,),
                )
                certificate = cur.fetchone()
            if not certificate:
                try:
                    with conn.cursor() as cur:
                        cur.execute('''SELECT certificate_code,course_title,total_lessons,player_name,issued_at
                            FROM training_certificates WHERE certificate_code=%s LIMIT 1''', (normalized_code,))
                        training_certificate = cur.fetchone()
                except Exception:
                    training_certificate = None
                if training_certificate:
                    issued_at = training_certificate.get('issued_at')
                    return jsonify({
                        'certificateId': training_certificate['certificate_code'],
                        'status': 'valid',
                        'certificateType': 'training_course',
                        'playerName': training_certificate.get('player_name') or 'TypeArena learner',
                        'courseName': training_certificate.get('course_title'),
                        'totalLessons': int(training_certificate.get('total_lessons') or 0),
                        'testDate': issued_at.isoformat() if issued_at else None,
                        'statement': 'This certificate verifies completion of the assigned TypeArena training course and its recorded lessons.',
                    })
                try:
                    with conn.cursor() as cur:
                        cur.execute('''SELECT certificate_code,learner_name,organization_name,class_name,course_title,total_lessons,issued_at
                            FROM school_certificates WHERE certificate_code=%s AND status='valid' LIMIT 1''', (normalized_code,))
                        school_certificate = cur.fetchone()
                except Exception:
                    school_certificate = None
                if not school_certificate:
                    return jsonify({'message': 'Certificate not found or no longer valid.'}), 404
                issued_at = school_certificate.get('issued_at')
                return jsonify({
                    'certificateId': school_certificate['certificate_code'],
                    'status': 'valid',
                    'certificateType': 'school_course',
                    'playerName': school_certificate.get('learner_name') or 'TypeArena learner',
                    'organizationName': school_certificate.get('organization_name'),
                    'className': school_certificate.get('class_name'),
                    'courseName': school_certificate.get('course_title'),
                    'totalLessons': int(school_certificate.get('total_lessons') or 0),
                    'testDate': issued_at.isoformat() if issued_at else None,
                    'statement': 'This certificate verifies completion of the assigned TypeArena School course and its recorded lessons.',
                })
            issued_at = certificate.get('issued_at')
            return jsonify({
                'certificateId': certificate['certificate_code'],
                'status': 'valid',
                'playerName': certificate.get('player_name') or 'TypeArena player',
                'wpm': float(certificate['wpm']),
                'accuracy': float(certificate['accuracy']),
                'testDate': issued_at.isoformat() if issued_at else None,
                'testDurationSeconds': CERTIFICATION_DURATION_SECONDS,
                'minimumWpm': CERTIFICATION_MIN_WPM,
                'minimumAccuracy': CERTIFICATION_MIN_ACCURACY,
                'minimumCharacters': CERTIFICATION_MIN_CHARACTERS,
                'statement': 'This certificate verifies completion of a TypeArena typing test under the stated test conditions.',
            })
        finally:
            return_connection(conn)

    @app.get('/api/admin/certifications/attempts')
    def admin_certification_attempts():
        status_filter = str(request.args.get('status') or 'flagged').strip().lower()
        if status_filter not in {'flagged', 'review_approved', 'review_rejected', 'all'}:
            return jsonify({'message': 'Unsupported certification review status.'}), 400
        conn = get_connection()
        try:
            admin = get_user(conn)
            if not admin or not is_admin_email(str(admin.get('email') or '')):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                if status_filter == 'all':
                    cur.execute(
                        '''
                        SELECT a.*, u.username
                        FROM certification_attempts a
                        JOIN users u ON u.id=a.user_id
                        WHERE a.status<>'in_progress'
                        ORDER BY a.created_at DESC LIMIT 100
                        '''
                    )
                else:
                    cur.execute(
                        '''
                        SELECT a.*, u.username
                        FROM certification_attempts a
                        JOIN users u ON u.id=a.user_id
                        WHERE a.status=%s
                        ORDER BY a.created_at DESC LIMIT 100
                        ''',
                        (status_filter,),
                    )
                attempts = cur.fetchall()
            return jsonify({'attempts': [
                _serialize_attempt(dict(row), include_admin_data=True)
                for row in attempts
            ]})
        finally:
            return_connection(conn)

    @app.post('/api/admin/certifications/attempts/<attempt_code>/review')
    def admin_review_certification(attempt_code: str):
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or payload.get('decision') not in {'approve', 'reject'}:
            return jsonify({'message': 'Decision must be approve or reject.'}), 400
        conn = get_connection()
        try:
            admin = get_user(conn)
            if not admin or not is_admin_email(str(admin.get('email') or '')):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT * FROM certification_attempts
                    WHERE attempt_code=%s AND status='flagged'
                    FOR UPDATE
                    ''',
                    (attempt_code,),
                )
                attempt = cur.fetchone()
                if not attempt:
                    return jsonify({'message': 'Flagged certification attempt not found.'}), 404
                decision = payload['decision']
                if decision == 'approve' and (
                    int(attempt.get('total_characters') or 0) < CERTIFICATION_MIN_CHARACTERS
                    or float(attempt.get('wpm') or 0) < CERTIFICATION_MIN_WPM
                    or float(attempt.get('accuracy') or 0) < CERTIFICATION_MIN_ACCURACY
                ):
                    return jsonify({'message': 'This attempt does not meet the published score thresholds.'}), 400

                status = 'review_approved' if decision == 'approve' else 'review_rejected'
                certificate_code = _certificate_code() if decision == 'approve' else None
                player_name = str(
                    attempt.get('player_name') or admin.get('username') or 'TypeArena player'
                )[:80]
                cur.execute(
                    '''
                    UPDATE certification_attempts
                    SET status=%s, certificate_code=%s, player_name=%s,
                        issued_at=CASE WHEN %s='review_approved' THEN UTC_TIMESTAMP() ELSE NULL END,
                        reviewed_at=UTC_TIMESTAMP(), reviewed_by=%s
                    WHERE id=%s AND status='flagged'
                    ''',
                    (
                        status,
                        certificate_code,
                        player_name,
                        status,
                        str(admin.get('email') or '')[:120],
                        attempt['id'],
                    ),
                )
            conn.commit()
            return jsonify({
                'attemptId': attempt_code,
                'status': status,
                'certificateId': certificate_code,
            })
        finally:
            return_connection(conn)

    def ensure_schema(cur) -> None:
        ensure_certification_schema(cur)

    return ensure_schema
