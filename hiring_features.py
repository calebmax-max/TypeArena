from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from flask import Flask, jsonify, request


FREE_COMPLETED_ATTEMPTS = 5


def ensure_hiring_schema(cur) -> None:
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS hiring_tests (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            employer_id INT NOT NULL,
            public_code VARCHAR(32) NOT NULL UNIQUE,
            title VARCHAR(160) NOT NULL,
            company_name VARCHAR(160) NOT NULL,
            company_logo_url VARCHAR(500) NULL,
            category ENUM('typing', 'customer_support', 'data_entry') NOT NULL DEFAULT 'typing',
            duration_seconds INT NOT NULL DEFAULT 180,
            min_wpm DECIMAL(7,2) NOT NULL DEFAULT 0,
            min_accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
            max_attempts INT NOT NULL DEFAULT 1,
            deadline_at DATETIME NULL,
            status ENUM('active','archived') NOT NULL DEFAULT 'active',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_hiring_tests_employer (employer_id),
            CONSTRAINT fk_hiring_tests_employer FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS hiring_passages (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            test_id BIGINT NOT NULL,
            version_no INT NOT NULL DEFAULT 1,
            body TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_hiring_passage_version (test_id, version_no),
            CONSTRAINT fk_hiring_passages_test FOREIGN KEY (test_id) REFERENCES hiring_tests(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS hiring_attempts (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            test_id BIGINT NOT NULL,
            passage_id BIGINT NOT NULL,
            candidate_id INT NOT NULL,
            status ENUM('started','completed','abandoned') NOT NULL DEFAULT 'started',
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME NULL,
            elapsed_seconds INT NULL,
            wpm DECIMAL(7,2) NULL,
            accuracy DECIMAL(5,2) NULL,
            passed TINYINT(1) NULL,
            tab_switches INT NOT NULL DEFAULT 0,
            paste_attempts INT NOT NULL DEFAULT 0,
            webcam_enabled TINYINT(1) NOT NULL DEFAULT 0,
            suspicious TINYINT(1) NOT NULL DEFAULT 0,
            flagged TINYINT(1) NOT NULL DEFAULT 0,
            KEY idx_hiring_attempts_test (test_id, status),
            KEY idx_hiring_attempts_candidate (candidate_id),
            CONSTRAINT fk_hiring_attempts_test FOREIGN KEY (test_id) REFERENCES hiring_tests(id) ON DELETE CASCADE,
            CONSTRAINT fk_hiring_attempts_passage FOREIGN KEY (passage_id) REFERENCES hiring_passages(id),
            CONSTRAINT fk_hiring_attempts_candidate FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS hiring_employer_usage (
            employer_id INT PRIMARY KEY,
            completed_attempts INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_hiring_usage_employer FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )


def _clean_text(value: Any, limit: int) -> str:
    return str(value or '').strip()[:limit]


def _score(target: str, typed: str, elapsed_seconds: int) -> tuple[float, float]:
    typed = typed or ''
    correct = sum(1 for index, char in enumerate(typed) if index < len(target) and target[index] == char)
    accuracy = round((correct / len(typed)) * 100, 2) if typed else 0.0
    minutes = max(elapsed_seconds, 1) / 60
    wpm = round((correct / 5) / minutes, 2)
    return wpm, accuracy


def _test_payload(row: Dict[str, Any], *, include_passage: bool = False) -> Dict[str, Any]:
    payload = {
        'id': int(row['id']),
        'publicCode': row['public_code'],
        'title': row['title'],
        'companyName': row['company_name'],
        'companyLogoUrl': row.get('company_logo_url'),
        'category': row['category'],
        'durationSeconds': int(row['duration_seconds']),
        'minWpm': float(row['min_wpm']),
        'minAccuracy': float(row['min_accuracy']),
        'maxAttempts': int(row['max_attempts']),
        'deadlineAt': row['deadline_at'].isoformat() if row.get('deadline_at') else None,
        'status': row['status'],
        'createdAt': row['created_at'].isoformat() if row.get('created_at') else None,
    }
    if include_passage:
        payload['passage'] = row.get('passage')
        payload['attemptId'] = int(row['attempt_id'])
    return payload


def register_hiring_routes(
    app: Flask,
    *,
    get_connection: Callable[[], Any],
    return_connection: Callable[[Any], None],
    get_user: Callable[[Any], Optional[Dict[str, Any]]],
    is_admin_email: Callable[[str], bool],
) -> Callable[..., None]:
    def _auth(conn):
        user = get_user(conn)
        return user if user and (str(user.get('account_role') or '') == 'employer' or is_admin_email(str(user.get('email') or ''))) else None

    def _candidate(conn):
        return get_user(conn)

    @app.get('/api/hiring/summary')
    def hiring_summary():
        conn = get_connection()
        try:
            employer = _auth(conn)
            if not employer:
                return jsonify({'message': 'An employer account is required.'}), 403
            with conn.cursor() as cur:
                cur.execute('SELECT COUNT(*) AS total FROM hiring_tests WHERE employer_id=%s AND status="active"', (employer['id'],))
                tests = int((cur.fetchone() or {}).get('total') or 0)
                cur.execute('SELECT completed_attempts FROM hiring_employer_usage WHERE employer_id=%s', (employer['id'],))
                usage = cur.fetchone()
            completed = int((usage or {}).get('completed_attempts') or 0)
            return jsonify({'activeTests': tests, 'completedAttempts': completed, 'freeAttempts': FREE_COMPLETED_ATTEMPTS, 'freeAttemptsRemaining': max(FREE_COMPLETED_ATTEMPTS - completed, 0)})
        finally:
            return_connection(conn)

    @app.get('/api/hiring/tests')
    def hiring_tests():
        conn = get_connection()
        try:
            employer = _auth(conn)
            if not employer:
                return jsonify({'message': 'An employer account is required.'}), 403
            with conn.cursor() as cur:
                cur.execute('''SELECT t.*, (SELECT COUNT(*) FROM hiring_attempts a WHERE a.test_id=t.id AND a.status="completed") AS attempt_count FROM hiring_tests t WHERE t.employer_id=%s ORDER BY t.created_at DESC''', (employer['id'],))
                rows = cur.fetchall()
            return jsonify([{**_test_payload(row), 'attemptCount': int(row.get('attempt_count') or 0)} for row in rows])
        finally:
            return_connection(conn)

    @app.post('/api/hiring/tests')
    def create_hiring_test():
        payload = request.get_json(silent=True) or {}
        title = _clean_text(payload.get('title'), 160)
        company_name = _clean_text(payload.get('companyName'), 160)
        passage = _clean_text(payload.get('passage'), 20000)
        if not title or not company_name or len(passage) < 20:
            return jsonify({'message': 'Title, company name, and a passage of at least 20 characters are required.'}), 400
        try:
            duration = max(30, min(int(payload.get('durationSeconds', 180)), 3600))
            min_wpm = max(0, min(float(payload.get('minWpm', 0)), 300))
            min_accuracy = max(0, min(float(payload.get('minAccuracy', 0)), 100))
            max_attempts = max(1, min(int(payload.get('maxAttempts', 1)), 10))
        except (TypeError, ValueError):
            return jsonify({'message': 'Test limits must be valid numbers.'}), 400
        category = str(payload.get('category') or 'typing').strip().lower()
        if category not in {'typing', 'customer_support', 'data_entry'}:
            return jsonify({'message': 'Unsupported test category.'}), 400
        conn = get_connection()
        try:
            employer = _auth(conn)
            if not employer:
                return jsonify({'message': 'An employer account is required.'}), 403
            with conn.cursor() as cur:
                code = secrets.token_urlsafe(9).replace('-', '').replace('_', '')[:12].upper()
                cur.execute('''INSERT INTO hiring_tests (employer_id, public_code, title, company_name, company_logo_url, category, duration_seconds, min_wpm, min_accuracy, max_attempts) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''', (employer['id'], code, title, company_name, _clean_text(payload.get('companyLogoUrl'), 500) or None, category, duration, min_wpm, min_accuracy, max_attempts))
                test_id = cur.lastrowid
                cur.execute('INSERT INTO hiring_passages (test_id, version_no, body) VALUES (%s, 1, %s)', (test_id, passage))
                cur.execute('SELECT * FROM hiring_tests WHERE id=%s', (test_id,))
                row = cur.fetchone()
            conn.commit()
            return jsonify(_test_payload(row)), 201
        finally:
            return_connection(conn)

    @app.get('/api/hiring/tests/<public_code>')
    def public_hiring_test(public_code):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute('''SELECT t.* FROM hiring_tests t WHERE t.public_code=%s AND t.status="active"''', (public_code.upper(),))
                row = cur.fetchone()
            if not row:
                return jsonify({'message': 'Hiring test not found or archived.'}), 404
            return jsonify(_test_payload(row))
        finally:
            return_connection(conn)

    @app.post('/api/hiring/tests/<public_code>/start')
    def start_hiring_test(public_code):
        conn = get_connection()
        try:
            candidate = _candidate(conn)
            if not candidate:
                return jsonify({'message': 'Sign in with a TypeArena account before taking this test.'}), 401
            with conn.cursor() as cur:
                cur.execute('''SELECT t.*, p.id AS passage_id, p.body AS passage FROM hiring_tests t JOIN hiring_passages p ON p.test_id=t.id WHERE t.public_code=%s AND t.status="active" ORDER BY p.version_no DESC LIMIT 1''', (public_code.upper(),))
                row = cur.fetchone()
                if not row:
                    return jsonify({'message': 'Hiring test not found or archived.'}), 404
                cur.execute('SELECT COUNT(*) AS total FROM hiring_attempts WHERE test_id=%s AND candidate_id=%s', (row['id'], candidate['id']))
                if int((cur.fetchone() or {}).get('total') or 0) >= int(row['max_attempts']):
                    return jsonify({'message': 'You have used all attempts for this test.'}), 409
                cur.execute('INSERT INTO hiring_attempts (test_id, passage_id, candidate_id) VALUES (%s,%s,%s)', (row['id'], row['passage_id'], candidate['id']))
                attempt_id = cur.lastrowid
            conn.commit()
            row['attempt_id'] = attempt_id
            return jsonify(_test_payload(row, include_passage=True))
        finally:
            return_connection(conn)

    @app.post('/api/hiring/attempts/<int:attempt_id>/submit')
    def submit_hiring_attempt(attempt_id):
        payload = request.get_json(silent=True) or {}
        typed = str(payload.get('typedText') or '')[:30000]
        conn = get_connection()
        try:
            candidate = _candidate(conn)
            if not candidate:
                return jsonify({'message': 'Sign in to submit this attempt.'}), 401
            with conn.cursor() as cur:
                cur.execute('''SELECT a.*, t.title, t.company_name, t.duration_seconds, t.min_wpm, t.min_accuracy, p.body AS passage FROM hiring_attempts a JOIN hiring_tests t ON t.id=a.test_id JOIN hiring_passages p ON p.id=a.passage_id WHERE a.id=%s AND a.candidate_id=%s FOR UPDATE''', (attempt_id, candidate['id']))
                row = cur.fetchone()
                if not row or row['status'] != 'started':
                    return jsonify({'message': 'This attempt is no longer available.'}), 409
                elapsed = max(1, min(int(payload.get('elapsedSeconds') or row['duration_seconds']), int(row['duration_seconds'])))
                wpm, accuracy = _score(row['passage'], typed, elapsed)
                passed = wpm >= float(row['min_wpm']) and accuracy >= float(row['min_accuracy'])
                tab_switches = max(0, int(payload.get('tabSwitches') or 0))
                paste_attempts = max(0, int(payload.get('pasteAttempts') or 0))
                suspicious = tab_switches > 3 or paste_attempts > 0
                cur.execute('''UPDATE hiring_attempts SET status="completed", completed_at=UTC_TIMESTAMP(), elapsed_seconds=%s, wpm=%s, accuracy=%s, passed=%s, tab_switches=%s, paste_attempts=%s, webcam_enabled=%s, suspicious=%s WHERE id=%s''', (elapsed, wpm, accuracy, int(passed), tab_switches, paste_attempts, int(bool(payload.get('webcamEnabled'))), int(suspicious), attempt_id))
                cur.execute('''INSERT INTO hiring_employer_usage (employer_id, completed_attempts) SELECT employer_id, 1 FROM hiring_tests WHERE id=%s ON DUPLICATE KEY UPDATE completed_attempts=completed_attempts+1''', (row['test_id'],))
                cur.execute('''SELECT a.id, u.username AS candidate, u.email, a.wpm, a.accuracy, a.elapsed_seconds, a.passed, a.suspicious, a.completed_at FROM hiring_attempts a JOIN users u ON u.id=a.candidate_id WHERE a.id=%s''', (attempt_id,))
                result = cur.fetchone()
            conn.commit()
            return jsonify({'attemptId': attempt_id, 'candidate': result['candidate'], 'wpm': float(result['wpm']), 'accuracy': float(result['accuracy']), 'elapsedSeconds': int(result['elapsed_seconds']), 'passed': bool(result['passed']), 'suspicious': bool(result['suspicious']), 'verifiedUnder': 'TypeArena testing conditions'})
        finally:
            return_connection(conn)

    @app.get('/api/hiring/tests/<int:test_id>/attempts')
    def hiring_test_attempts(test_id):
        conn = get_connection()
        try:
            employer = _auth(conn)
            if not employer:
                return jsonify({'message': 'An employer account is required.'}), 403
            with conn.cursor() as cur:
                cur.execute('SELECT id FROM hiring_tests WHERE id=%s AND employer_id=%s', (test_id, employer['id']))
                if not cur.fetchone():
                    return jsonify({'message': 'Test not found.'}), 404
                cur.execute('''SELECT a.id, u.username AS candidate, u.email, a.wpm, a.accuracy, a.elapsed_seconds, a.passed, a.suspicious, a.flagged, a.completed_at FROM hiring_attempts a JOIN users u ON u.id=a.candidate_id WHERE a.test_id=%s AND a.status="completed" ORDER BY a.wpm DESC, a.accuracy DESC''', (test_id,))
                rows = cur.fetchall()
            return jsonify([{**row, 'id': int(row['id']), 'wpm': float(row['wpm'] or 0), 'accuracy': float(row['accuracy'] or 0), 'elapsedSeconds': int(row['elapsed_seconds'] or 0), 'passed': bool(row['passed']), 'suspicious': bool(row['suspicious']), 'flagged': bool(row['flagged']), 'completedAt': row['completed_at'].isoformat() if row.get('completed_at') else None} for row in rows])
        finally:
            return_connection(conn)

    def _ensure_schema(cur):
        ensure_hiring_schema(cur)

    return _ensure_schema
