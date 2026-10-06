from __future__ import annotations

import secrets
from datetime import datetime, timezone

from flask import jsonify, request


def _iso(value):
    return value.isoformat() if value and hasattr(value, 'isoformat') else value


def _confidence_level(verified_assessments, course_count):
    if verified_assessments >= 2 and course_count >= 2:
        return 'Multiple verified results'
    if verified_assessments >= 1 or course_count >= 1:
        return 'Verified learning evidence'
    return 'Getting started'


def register_skills_passport_routes(app, *, get_connection, return_connection, get_user):
    def ensure_tables(cur):
        cur.execute('''CREATE TABLE IF NOT EXISTS skills_passports (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL UNIQUE,
            share_code VARCHAR(48) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            revoked_at TIMESTAMP NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')

    def current_user(conn):
        return get_user(conn)

    def passport_payload(cur, user, share_code):
        user_id = int(user['id'])
        cur.execute('''SELECT MAX(wpm) verified_wpm, MAX(accuracy) verified_accuracy,
                              MAX(created_at) last_training_assessment,
                              COUNT(*) verified_attempts
                       FROM training_attempts
                       WHERE user_id=%s AND passed=1''', (user_id,))
        training = cur.fetchone() or {}

        cur.execute('''SELECT c.id,c.title,c.stage_number,c.expected_duration,c.practical_outcome,
                              COUNT(DISTINCT l.id) total_lessons,
                              COUNT(DISTINCT CASE WHEN a.passed=1 THEN l.id END) passed_lessons,
                              MAX(a.created_at) last_activity
                       FROM training_courses c
                       JOIN training_lessons l ON l.course_id=c.id AND l.is_archived=0
                       LEFT JOIN training_attempts a ON CAST(a.lesson_id AS UNSIGNED)=l.id AND a.user_id=%s AND a.passed=1
                       WHERE c.is_archived=0
                       GROUP BY c.id,c.title,c.stage_number,c.expected_duration,c.practical_outcome
                       ORDER BY COALESCE(c.stage_number,99),c.id''', (user_id,))
        courses = []
        for row in cur.fetchall():
            passed = int(row.get('passed_lessons') or 0)
            total = int(row.get('total_lessons') or 0)
            courses.append({
                'courseId': row['id'],
                'title': row['title'],
                'stageNumber': row.get('stage_number'),
                'duration': row.get('expected_duration'),
                'practicalOutcome': row.get('practical_outcome'),
                'lessonsPassed': passed,
                'lessonsTotal': total,
                'completed': total > 0 and passed >= total,
                'lastActivity': _iso(row.get('last_activity')),
            })

        cur.execute('''SELECT attempt_code,wpm,accuracy,submitted_at,certificate_code
                       FROM certification_attempts
                       WHERE user_id=%s AND status IN ('passed','review_approved')
                       ORDER BY submitted_at DESC''', (user_id,))
        assessments = [{
            'assessmentId': row['attempt_code'],
            'wpm': float(row.get('wpm') or 0),
            'accuracy': float(row.get('accuracy') or 0),
            'assessmentDate': _iso(row.get('submitted_at')),
            'certificateId': row.get('certificate_code'),
            'verification': 'verified',
        } for row in cur.fetchall()]

        cur.execute('''SELECT certificate_code,course_title,issued_at
                       FROM school_certificates
                       WHERE user_id=%s AND status='valid'
                       ORDER BY issued_at DESC''', (user_id,))
        certificates = [{
            'certificateId': row['certificate_code'],
            'courseTitle': row.get('course_title'),
            'issuedAt': _iso(row.get('issued_at')),
            'verificationUrl': f'/verify/{row["certificate_code"]}',
        } for row in cur.fetchall()]
        certificates.extend({
            'certificateId': item['certificateId'],
            'courseTitle': 'Verified typing assessment',
            'issuedAt': item['assessmentDate'],
            'verificationUrl': f'/verify/{item["certificateId"]}',
        } for item in assessments if item.get('certificateId'))

        verified_attempts = int(training.get('verified_attempts') or 0) + len(assessments)
        return {
            'shareCode': share_code,
            'learnerName': user.get('username') or 'TypeArena learner',
            'profileStatement': 'This passport lists recorded TypeArena learning and assessment evidence. It is not a professional qualification by itself.',
            'verifiedWpm': float(training['verified_wpm']) if training.get('verified_wpm') is not None else None,
            'verifiedAccuracy': float(training['verified_accuracy']) if training.get('verified_accuracy') is not None else None,
            'lastAssessmentDate': _iso(training.get('last_training_assessment')) or (assessments[0]['assessmentDate'] if assessments else None),
            'confidenceLevel': _confidence_level(len(assessments), sum(course['completed'] for course in courses)),
            'courses': courses,
            'assessments': assessments,
            'certificates': certificates,
            'updatedAt': datetime.now(timezone.utc).isoformat(),
        }

    @app.get('/api/skills-passport')
    def get_skills_passport():
        conn = get_connection()
        try:
            user = current_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to manage your skills passport.'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT share_code FROM skills_passports WHERE user_id=%s AND revoked_at IS NULL', (user['id'],))
                row = cur.fetchone()
                return jsonify({'passport': passport_payload(cur, user, row['share_code']) if row else None})
        finally:
            return_connection(conn)

    @app.post('/api/skills-passport')
    def create_skills_passport():
        conn = get_connection()
        try:
            user = current_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to create a skills passport.'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT share_code FROM skills_passports WHERE user_id=%s AND revoked_at IS NULL', (user['id'],))
                row = cur.fetchone()
                code = row['share_code'] if row else secrets.token_urlsafe(18).replace('-', '').replace('_', '')
                if not row:
                    cur.execute('INSERT INTO skills_passports (user_id,share_code) VALUES (%s,%s)', (user['id'], code))
                    conn.commit()
                return jsonify({'passport': passport_payload(cur, user, code)})
        finally:
            return_connection(conn)

    @app.delete('/api/skills-passport')
    def revoke_skills_passport():
        conn = get_connection()
        try:
            user = current_user(conn)
            if not user:
                return jsonify({'message': 'Sign in required.'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('UPDATE skills_passports SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=%s AND revoked_at IS NULL', (user['id'],))
                conn.commit()
                return jsonify({'revoked': True})
        finally:
            return_connection(conn)

    @app.get('/api/skills-passport/<share_code>')
    def public_skills_passport(share_code):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('''SELECT sp.share_code,u.id,u.username
                               FROM skills_passports sp JOIN users u ON u.id=sp.user_id
                               WHERE sp.share_code=%s AND sp.revoked_at IS NULL''', (str(share_code).strip(),))
                row = cur.fetchone()
                if not row:
                    return jsonify({'message': 'Skills passport not found or revoked.'}), 404
                return jsonify({'passport': passport_payload(cur, {'id': row['id'], 'username': row['username']}, row['share_code'])})
        finally:
            return_connection(conn)

    return ensure_tables
