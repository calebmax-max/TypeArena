from __future__ import annotations

from flask import jsonify, request


LESSON_TARGETS = {
    'u1-l1': (10, 90), 'u1-l2': (15, 90), 'u1-l3': (18, 90), 'u1-l4': (20, 90),
    'u2-l1': (22, 90), 'u2-l2': (25, 90), 'u2-l3': (28, 90),
    'u3-l1': (30, 91), 'u3-l2': (30, 90), 'u3-l3': (32, 91),
    'u4-l1': (32, 92), 'u4-l2': (33, 92), 'u4-l3': (35, 92),
    'u5-l1': (38, 93), 'u5-l2': (42, 93), 'u5-l3': (45, 93),
    'sb1': (50, 94), 'sb2': (55, 94), 'sp3': (60, 95),
}


def register_training_routes(app, *, get_connection, return_connection, get_user):
    def ensure_tables(cur):
        cur.execute('''
            CREATE TABLE IF NOT EXISTS training_attempts (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                event_id VARCHAR(96) NOT NULL,
                lesson_id VARCHAR(40) NOT NULL,
                unit_id VARCHAR(40) NULL,
                wpm DECIMAL(7,2) NOT NULL DEFAULT 0,
                accuracy DECIMAL(6,2) NOT NULL DEFAULT 0,
                passed TINYINT(1) NOT NULL DEFAULT 0,
                xp_earned INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_training_attempt_event (user_id, event_id),
                KEY idx_training_attempt_user_lesson (user_id, lesson_id),
                CONSTRAINT fk_training_attempt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ''')

    @app.post('/api/training-events')
    def record_training_event():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to save training progress.'}), 401
            payload = request.get_json(silent=True) or {}
            lesson_id = str(payload.get('lessonId') or '').strip()
            if lesson_id not in LESSON_TARGETS:
                return jsonify({'message': 'Unknown training lesson.'}), 400
            event_id = str(payload.get('eventId') or '').strip()
            if not event_id or len(event_id) > 96:
                return jsonify({'message': 'A valid training event ID is required.'}), 400
            wpm = max(0.0, min(999.0, float(payload.get('wpm') or 0)))
            accuracy = max(0.0, min(100.0, float(payload.get('accuracy') or 0)))
            min_wpm, min_accuracy = LESSON_TARGETS[lesson_id]
            passed = int(wpm >= min_wpm and accuracy >= min_accuracy)
            unit_id = str(payload.get('unitId') or '').strip()[:40] or None
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT id, passed, xp_earned FROM training_attempts WHERE user_id=%s AND event_id=%s', (int(user['id']), event_id))
                existing = cur.fetchone()
                if existing:
                    conn.commit()
                    return jsonify({'passed': bool(existing['passed']), 'xpEarned': int(existing['xp_earned'] or 0), 'duplicate': True})
                cur.execute('SELECT COUNT(*) AS count FROM training_attempts WHERE user_id=%s AND lesson_id=%s AND passed=1', (int(user['id']), lesson_id))
                prior_passes = int((cur.fetchone() or {}).get('count') or 0)
                xp_earned = 100 if passed and prior_passes == 0 else 10 if passed else 0
                cur.execute('''INSERT INTO training_attempts
                    (user_id, event_id, lesson_id, unit_id, wpm, accuracy, passed, xp_earned)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)''',
                    (int(user['id']), event_id, lesson_id, unit_id, wpm, accuracy, passed, xp_earned))
                conn.commit()
                return jsonify({'passed': bool(passed), 'xpEarned': xp_earned, 'duplicate': False})
        except (TypeError, ValueError):
            conn.rollback()
            return jsonify({'message': 'WPM and accuracy must be valid numbers.'}), 400
        finally:
            return_connection(conn)

    return ensure_tables
