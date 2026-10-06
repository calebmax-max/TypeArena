"""Organisation, classroom, assignment, and school-safe race APIs."""

from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import re
import secrets
from datetime import datetime

from flask import jsonify, request, Response


MAX_ASSIGNMENT_PASSAGE_LENGTH = 20_000


def _normalize_assignment_passage(value):
    passage = str(value or '').strip()
    if not passage:
        raise ValueError('A typing passage is required for the assignment.')
    if len(passage) > MAX_ASSIGNMENT_PASSAGE_LENGTH:
        raise ValueError(
            f'Assignment passages cannot exceed {MAX_ASSIGNMENT_PASSAGE_LENGTH} characters.'
        )
    return passage


def register_school_routes(app, *, get_connection, return_connection, get_user, now_db, now_iso, is_admin_email, admin_email):
    """Register the first TypeArena school-product slice on the main Flask app."""

    def ensure_tables(cur):
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS organizations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(160) NOT NULL,
                slug VARCHAR(180) NOT NULL UNIQUE,
                created_by INT NOT NULL,
                created_at DATETIME NOT NULL,
                active TINYINT(1) NOT NULL DEFAULT 1,
                INDEX idx_org_created_by (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS organization_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                organization_id INT NOT NULL,
                user_id INT NOT NULL,
                role ENUM('org_admin','teacher','learner') NOT NULL DEFAULT 'learner',
                status ENUM('active','pending','removed') NOT NULL DEFAULT 'active',
                joined_at DATETIME NOT NULL,
                UNIQUE KEY uniq_org_member (organization_id, user_id),
                INDEX idx_org_member_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS classes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                organization_id INT NOT NULL,
                teacher_id INT NOT NULL,
                name VARCHAR(160) NOT NULL,
                join_code VARCHAR(16) NOT NULL UNIQUE,
                active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL,
                INDEX idx_class_org (organization_id),
                INDEX idx_class_teacher (teacher_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS class_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                class_id INT NOT NULL,
                user_id INT NOT NULL,
                status ENUM('active','suspended','removed') NOT NULL DEFAULT 'active',
                joined_at DATETIME NOT NULL,
                UNIQUE KEY uniq_class_member (class_id, user_id),
                INDEX idx_class_member_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                class_id INT NOT NULL,
                created_by INT NOT NULL,
                title VARCHAR(180) NOT NULL,
                instructions TEXT NULL,
                passage MEDIUMTEXT NULL,
                target_wpm DECIMAL(6,2) NOT NULL DEFAULT 0,
                target_accuracy DECIMAL(6,2) NOT NULL DEFAULT 0,
                mode VARCHAR(40) NOT NULL DEFAULT 'practice',
                due_at DATETIME NULL,
                created_at DATETIME NOT NULL,
                INDEX idx_assignment_class (class_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS assignment_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id INT NOT NULL,
                user_id INT NOT NULL,
                race_id VARCHAR(120) NULL,
                wpm DECIMAL(7,2) NOT NULL DEFAULT 0,
                accuracy DECIMAL(6,2) NOT NULL DEFAULT 0,
                passed TINYINT(1) NOT NULL DEFAULT 0,
                status ENUM('passed','failed','under_review') NOT NULL DEFAULT 'failed',
                verification_method VARCHAR(24) NOT NULL DEFAULT 'legacy',
                submitted_at DATETIME NOT NULL,
                UNIQUE KEY uniq_assignment_submission (assignment_id, user_id),
                INDEX idx_submission_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS assignment_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id INT NOT NULL,
                user_id INT NOT NULL,
                race_id VARCHAR(120) NULL,
                wpm DECIMAL(7,2) NOT NULL DEFAULT 0,
                accuracy DECIMAL(6,2) NOT NULL DEFAULT 0,
                verification_method VARCHAR(24) NOT NULL DEFAULT 'legacy',
                submitted_at DATETIME NOT NULL,
                INDEX idx_assignment_attempts_user (assignment_id,user_id,submitted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS school_invitations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                organization_id INT NOT NULL,
                class_id INT NULL,
                email VARCHAR(254) NOT NULL,
                role ENUM('teacher','learner') NOT NULL DEFAULT 'learner',
                token VARCHAR(80) NOT NULL UNIQUE,
                status ENUM('pending','accepted','cancelled') NOT NULL DEFAULT 'pending',
                invited_by INT NOT NULL,
                created_at DATETIME NOT NULL,
                expires_at DATETIME NULL,
                INDEX idx_school_invite_email (email),
                INDEX idx_school_invite_org (organization_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS school_live_rooms (
                room_id VARCHAR(120) PRIMARY KEY,
                class_id INT NOT NULL,
                created_by INT NOT NULL,
                created_at DATETIME NOT NULL,
                INDEX idx_school_live_class (class_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        for statement in (
            "ALTER TABLE organizations ADD COLUMN settings_json TEXT NULL",
            "ALTER TABLE organizations ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1",
            "ALTER TABLE assignments ADD COLUMN status ENUM('draft','published','archived') NOT NULL DEFAULT 'published'",
            "ALTER TABLE class_members MODIFY status ENUM('active','pending','suspended','removed') NOT NULL DEFAULT 'active'",
        ):
            try:
                cur.execute(statement)
            except Exception:
                pass
        cur.execute("SHOW COLUMNS FROM assignments LIKE 'passage'")
        if not cur.fetchone():
            cur.execute('ALTER TABLE assignments ADD COLUMN passage MEDIUMTEXT NULL AFTER instructions')
        for statement in (
            "ALTER TABLE assignment_attempts ADD COLUMN verification_method VARCHAR(24) NOT NULL DEFAULT 'legacy' AFTER accuracy",
            "ALTER TABLE assignment_submissions ADD COLUMN passed TINYINT(1) NOT NULL DEFAULT 0 AFTER accuracy",
            "ALTER TABLE assignment_submissions ADD COLUMN status ENUM('passed','failed','under_review') NOT NULL DEFAULT 'failed' AFTER passed",
            "ALTER TABLE assignment_submissions ADD COLUMN verification_method VARCHAR(24) NOT NULL DEFAULT 'legacy' AFTER status",
        ):
            try:
                cur.execute(statement)
            except Exception:
                pass

    def current_user(conn):
        return get_user(conn)

    def auth(conn):
        user = current_user(conn)
        return user

    def role_for(cur, user_id, organization_id):
        cur.execute(
            "SELECT role FROM organization_members WHERE organization_id=%s AND user_id=%s AND status='active' LIMIT 1",
            (organization_id, user_id),
        )
        row = cur.fetchone()
        return row['role'] if row else None

    def can_manage(role):
        return role in ('org_admin', 'teacher')

    def org_payload(row, role=None):
        try:
            settings = json.loads(row.get('settings_json') or '{}')
        except (TypeError, ValueError):
            settings = {}
        return {
            'id': int(row['id']), 'name': row['name'], 'slug': row['slug'],
            'role': role or row.get('role'), 'createdAt': row.get('created_at').isoformat() if row.get('created_at') else None,
            'settings': settings,
        }

    def class_payload(row):
        return {
            'id': int(row['id']), 'organizationId': int(row['organization_id']),
            'teacherId': int(row['teacher_id']), 'name': row['name'],
            'joinCode': row['join_code'], 'active': bool(row.get('active', 1)),
            'createdAt': row.get('created_at').isoformat() if row.get('created_at') else None,
            'learnerCount': int(row.get('learner_count') or 0),
        }

    def require_org(cur, user, organization_id, manage=False):
        role = 'org_admin' if admin_email and is_admin_email(user.get('email') or '') else role_for(cur, user['id'], organization_id)
        if not role or (manage and not can_manage(role)):
            return None, ('You do not have access to this organisation.', 403)
        cur.execute('SELECT * FROM organizations WHERE id=%s', (organization_id,))
        org = cur.fetchone()
        if not org or not org.get('active', 1):
            return None, ('Organisation not found.', 404)
        return role, None

    def require_class(cur, user, class_id, manage=False):
        cur.execute('SELECT * FROM classes WHERE id=%s AND active=1', (class_id,))
        cls = cur.fetchone()
        if not cls:
            return None, ('Class not found.', 404)
        role, error = require_org(cur, user, cls['organization_id'], manage=manage)
        if error:
            return None, error
        return (cls, role), None

    @app.get('/api/school/overview')
    def school_overview():
        conn = get_connection()
        try:
            user = auth(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute(
                    """SELECT o.*, m.role FROM organizations o JOIN organization_members m
                       ON m.organization_id=o.id WHERE m.user_id=%s AND m.status='active'
                       AND o.active=1 ORDER BY o.name""",
                    (user['id'],),
                )
                orgs = [org_payload(row) for row in cur.fetchall()]
                cur.execute(
                    """SELECT c.*, COUNT(DISTINCT CASE WHEN cm.status='active' AND learner_members.role='learner'
                           AND learner_members.status='active' THEN cm.id END) learner_count
                       FROM classes c
                       JOIN organization_members om ON om.organization_id=c.organization_id AND om.user_id=%s AND om.status='active'
                       JOIN organizations o ON o.id=c.organization_id AND o.active=1
                       LEFT JOIN class_members cm ON cm.class_id=c.id
                       LEFT JOIN organization_members learner_members ON learner_members.organization_id=c.organization_id
                           AND learner_members.user_id=cm.user_id
                       WHERE c.active=1 GROUP BY c.id ORDER BY c.created_at DESC""",
                    (user['id'],),
                )
                classes = [class_payload(row) for row in cur.fetchall()]
            return jsonify({'user': {'id': user['id'], 'username': user.get('username'), 'email': user.get('email')}, 'organizations': orgs, 'classes': classes})
        finally:
            return_connection(conn)

    @app.post('/api/school/organizations')
    def create_organization():
        payload = request.get_json(silent=True) or {}
        name = str(payload.get('name') or '').strip()
        if len(name) < 2 or len(name) > 160:
            return jsonify({'message': 'Organisation name must be between 2 and 160 characters.'}), 400
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or 'organisation'
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                base, suffix = slug, 1
                while True:
                    cur.execute('SELECT id FROM organizations WHERE slug=%s', (slug,))
                    if not cur.fetchone(): break
                    suffix += 1; slug = f'{base}-{suffix}'
                cur.execute('INSERT INTO organizations (name, slug, created_by, created_at) VALUES (%s,%s,%s,%s)', (name, slug, user['id'], now_db()))
                org_id = cur.lastrowid
                cur.execute("INSERT INTO organization_members (organization_id,user_id,role,status,joined_at) VALUES (%s,%s,'org_admin','active',%s)", (org_id, user['id'], now_db()))
            conn.commit()
            return jsonify({'organization': {'id': org_id, 'name': name, 'slug': slug, 'role': 'org_admin'}}), 201
        finally: return_connection(conn)

    @app.post('/api/school/organizations/<int:organization_id>/classes')
    def create_class(organization_id):
        payload = request.get_json(silent=True) or {}
        name = str(payload.get('name') or '').strip()
        if not name: return jsonify({'message': 'Class name is required.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                role, error = require_org(cur, user, organization_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                code = secrets.token_hex(3).upper()
                cur.execute('INSERT INTO classes (organization_id,teacher_id,name,join_code,created_at) VALUES (%s,%s,%s,%s,%s)', (organization_id, user['id'], name, code, now_db()))
                class_id = cur.lastrowid
            conn.commit()
            return jsonify({'class': {'id': class_id, 'organizationId': organization_id, 'teacherId': user['id'], 'name': name, 'joinCode': code, 'active': True, 'learnerCount': 0}}), 201
        finally: return_connection(conn)

    @app.post('/api/school/classes/join')
    def join_class():
        payload = request.get_json(silent=True) or {}
        code = str(payload.get('joinCode') or '').strip().upper()
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT * FROM classes WHERE join_code=%s AND active=1', (code,)); cls = cur.fetchone()
                if not cls: return jsonify({'message': 'That join code is invalid or expired.'}), 404
                cur.execute('SELECT settings_json FROM organizations WHERE id=%s AND active=1', (cls['organization_id'],))
                org = cur.fetchone()
                if not org: return jsonify({'message': 'Organisation is unavailable.'}), 404
                try:
                    settings = json.loads(org.get('settings_json') or '{}')
                except (TypeError, ValueError):
                    settings = {}
                member_status = 'pending' if settings.get('requireLearnerApproval') else 'active'
                cur.execute("INSERT INTO organization_members (organization_id,user_id,role,status,joined_at) VALUES (%s,%s,'learner','active',%s) ON DUPLICATE KEY UPDATE status='active'", (cls['organization_id'], user['id'], now_db()))
                cur.execute("INSERT INTO class_members (class_id,user_id,status,joined_at) VALUES (%s,%s,%s,%s) ON DUPLICATE KEY UPDATE status=IF(status='active','active',VALUES(status))", (cls['id'], user['id'], member_status, now_db()))
            conn.commit(); return jsonify({'message': 'You joined the class.' if member_status == 'active' else 'Request sent. A teacher must approve your class membership.', 'status': member_status, 'class': class_payload(cls)})
        finally: return_connection(conn)

    @app.get('/api/school/classes/<int:class_id>')
    def get_class(class_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT * FROM classes WHERE id=%s AND active=1', (class_id,)); cls = cur.fetchone()
                if not cls: return jsonify({'message': 'Class not found.'}), 404
                role, error = require_org(cur, user, cls['organization_id'])
                if error: return jsonify({'message': error[0]}), error[1]
                if role == 'learner':
                    cur.execute("SELECT id FROM class_members WHERE class_id=%s AND user_id=%s AND status='active'", (class_id, user['id']))
                    if not cur.fetchone(): return jsonify({'message': 'Your class membership is awaiting approval or is inactive.'}), 403
                cur.execute("""SELECT u.id,u.username,u.email,u.wpm,u.accuracy,cm.joined_at,cm.status
                    FROM class_members cm JOIN users u ON u.id=cm.user_id
                    JOIN organization_members om ON om.organization_id=%s AND om.user_id=cm.user_id
                    WHERE cm.class_id=%s AND om.role='learner' AND om.status='active'
                      AND cm.status IN ('active','pending','suspended')
                    ORDER BY FIELD(cm.status,'pending','active','suspended'),u.username""", (cls['organization_id'], class_id))
                learners = [{'id': r['id'], 'username': r['username'], 'email': r['email'], 'wpm': float(r.get('wpm') or 0), 'accuracy': float(r.get('accuracy') or 0), 'status': r['status'], 'joinedAt': r['joined_at'].isoformat() if r.get('joined_at') else None} for r in cur.fetchall()]
                cur.execute('SELECT * FROM assignments WHERE class_id=%s ORDER BY created_at DESC', (class_id,))
                assignments = []
                for r in cur.fetchall():
                    submission_filter = '' if role in ('org_admin', 'teacher') else ' AND s.user_id=%s'
                    submission_params = (r['id'],) if not submission_filter else (r['id'], user['id'])
                    cur.execute(f"SELECT s.user_id,s.wpm,s.accuracy,s.passed,s.status,s.verification_method,s.race_id,s.submitted_at,u.username FROM assignment_submissions s JOIN users u ON u.id=s.user_id WHERE s.assignment_id=%s{submission_filter} ORDER BY s.submitted_at DESC", submission_params)
                    submissions = [{'userId': x['user_id'], 'username': x['username'], 'wpm': float(x['wpm'] or 0), 'accuracy': float(x['accuracy'] or 0), 'passed': bool(x.get('passed')), 'status': x.get('status') or 'failed', 'verificationMethod': x.get('verification_method') or 'legacy', 'raceId': x.get('race_id'), 'submittedAt': x['submitted_at'].isoformat() if x.get('submitted_at') else None} for x in cur.fetchall()]
                    assignments.append({'id': r['id'], 'title': r['title'], 'instructions': r.get('instructions') or '', 'passage': r.get('passage') or '', 'targetWpm': float(r['target_wpm'] or 0), 'targetAccuracy': float(r['target_accuracy'] or 0), 'mode': r['mode'], 'status': r.get('status') or 'published', 'dueAt': r['due_at'].isoformat() if r.get('due_at') else None, 'submissions': submissions if role in ('org_admin', 'teacher') else [], 'mySubmission': submissions[0] if role not in ('org_admin', 'teacher') and submissions else None, 'completionCount': len(submissions) if role in ('org_admin', 'teacher') else int(bool(submissions))})
            active_learners = [learner for learner in learners if learner['status'] == 'active']
            return jsonify({
                'class': class_payload(cls),
                'role': role,
                'learners': learners,
                'assignments': assignments,
                'analytics': {
                    'learnerCount': len(active_learners),
                    'pendingCount': sum(learner['status'] == 'pending' for learner in learners),
                    'averageWpm': round(sum(learner['wpm'] for learner in active_learners) / len(active_learners), 1) if active_learners else 0,
                    'assignmentCount': len(assignments),
                    'completionCount': sum(item['completionCount'] for item in assignments) if role in ('org_admin', 'teacher') else sum(bool(item['mySubmission']) for item in assignments),
                },
            })
        finally: return_connection(conn)

    @app.post('/api/school/classes/<int:class_id>/assignments')
    def create_assignment(class_id):
        payload = request.get_json(silent=True) or {}
        title = str(payload.get('title') or '').strip()
        if not title: return jsonify({'message': 'Assignment title is required.'}), 400
        try:
            passage = _normalize_assignment_passage(payload.get('passage'))
        except ValueError as exc:
            return jsonify({'message': str(exc)}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT organization_id FROM classes WHERE id=%s', (class_id,)); cls = cur.fetchone()
                if not cls: return jsonify({'message': 'Class not found.'}), 404
                _, error = require_org(cur, user, cls['organization_id'], manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                cur.execute('INSERT INTO assignments (class_id,created_by,title,instructions,passage,target_wpm,target_accuracy,mode,due_at,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)', (class_id, user['id'], title, str(payload.get('instructions') or ''), passage, float(payload.get('targetWpm') or 0), float(payload.get('targetAccuracy') or 0), str(payload.get('mode') or 'practice'), payload.get('dueAt') or None, now_db()))
                assignment_id = cur.lastrowid
            conn.commit(); return jsonify({'id': assignment_id, 'message': 'Assignment created.'}), 201
        finally: return_connection(conn)

    @app.get('/api/school/assignments/<int:assignment_id>')
    def get_school_assignment(assignment_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute(
                    '''
                    SELECT a.*, c.organization_id, c.name AS class_name
                    FROM assignments a
                    JOIN classes c ON c.id=a.class_id
                    WHERE a.id=%s AND c.active=1
                      AND COALESCE(a.status,'published') <> 'archived'
                    ''',
                    (assignment_id,),
                )
                assignment = cur.fetchone()
                if not assignment:
                    return jsonify({'message': 'Assignment not found.'}), 404
                role, error = require_org(cur, user, assignment['organization_id'])
                if error:
                    return jsonify({'message': error[0]}), error[1]
                if role == 'learner':
                    cur.execute(
                        '''
                        SELECT id FROM class_members
                        WHERE class_id=%s AND user_id=%s AND status='active'
                        ''',
                        (assignment['class_id'], user['id']),
                    )
                    if not cur.fetchone():
                        return jsonify({'message': 'Your class membership is awaiting approval or is inactive.'}), 403
                result = {
                    'id': int(assignment['id']),
                    'classId': int(assignment['class_id']),
                    'className': assignment['class_name'],
                    'title': assignment['title'],
                    'instructions': assignment.get('instructions') or '',
                    'passage': assignment.get('passage') or '',
                    'targetWpm': float(assignment['target_wpm'] or 0),
                    'targetAccuracy': float(assignment['target_accuracy'] or 0),
                    'dueAt': assignment['due_at'].isoformat() if assignment.get('due_at') else None,
                }
            return jsonify({'assignment': result})
        finally:
            return_connection(conn)

    @app.post('/api/school/assignments/<int:assignment_id>/submit')
    def submit_assignment(assignment_id):
        payload = request.get_json(silent=True) or {}; conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT a.*,c.organization_id FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.id=%s', (assignment_id,)); assignment = cur.fetchone()
                if not assignment: return jsonify({'message': 'Assignment not found.'}), 404
                role, error = require_org(cur, user, assignment['organization_id'])
                if error: return jsonify({'message': error[0]}), error[1]
                cur.execute("SELECT id FROM class_members WHERE class_id=%s AND user_id=%s AND status='active'", (assignment['class_id'], user['id']))
                if not cur.fetchone(): return jsonify({'message': 'Join the class before submitting.'}), 403
                race_id = str(payload.get('raceId') or '').strip()[:120]
                if not race_id:
                    return jsonify({'message': 'A server-verified race is required for this assignment.'}), 400
                cur.execute('''SELECT wpm,accuracy,verification_method,anti_cheat_flags,passage_hash
                    FROM race_history
                    WHERE user_id=%s AND (race_code=%s OR race_code=%s)
                    LIMIT 1''', (user['id'], race_id, f'live_{race_id}_{user["id"]}'))
                race = cur.fetchone()
                if not race:
                    return jsonify({'message': 'The referenced race result could not be found.'}), 409
                if str(race.get('verification_method') or '') != 'server_verified':
                    return jsonify({'message': 'This race result is not eligible for a verified school submission.'}), 409
                try:
                    race_flags = json.loads(race.get('anti_cheat_flags') or '[]')
                except (TypeError, ValueError):
                    race_flags = ['unreadable_anti_cheat_flags']
                if race_flags:
                    return jsonify({'message': 'This race is under review and cannot be submitted yet.'}), 409
                expected_passage_hash = hashlib.sha256(str(assignment.get('passage') or '').strip().encode('utf-8')).hexdigest()
                if not race.get('passage_hash') or not hmac.compare_digest(str(race.get('passage_hash')), expected_passage_hash):
                    return jsonify({'message': 'This race was not completed with the assigned passage. Start the assignment again.'}), 409
                cur.execute('SELECT id FROM assignment_attempts WHERE assignment_id=%s AND user_id=%s AND race_id=%s LIMIT 1', (assignment_id, user['id'], race_id))
                if cur.fetchone():
                    return jsonify({'message': 'This race has already been submitted for the assignment.'}), 409
                wpm = float(race.get('wpm') or 0)
                accuracy = float(race.get('accuracy') or 0)
                passed = int(wpm >= float(assignment.get('target_wpm') or 0) and accuracy >= float(assignment.get('target_accuracy') or 0))
                status = 'passed' if passed else 'failed'
                submission_values = (assignment_id, user['id'], race_id, wpm, accuracy, passed, status, 'server_verified', now_db())
                cur.execute('''INSERT INTO assignment_attempts
                    (assignment_id,user_id,race_id,wpm,accuracy,verification_method,submitted_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                    (assignment_id, user['id'], race_id, wpm, accuracy, 'server_verified', now_db()))
                cur.execute('''INSERT INTO assignment_submissions
                    (assignment_id,user_id,race_id,wpm,accuracy,passed,status,verification_method,submitted_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE race_id=VALUES(race_id),wpm=VALUES(wpm),accuracy=VALUES(accuracy),passed=VALUES(passed),status=VALUES(status),verification_method=VALUES(verification_method),submitted_at=VALUES(submitted_at)''', submission_values)
            conn.commit(); return jsonify({'message': 'Assignment submitted.', 'wpm': wpm, 'accuracy': accuracy, 'passed': bool(passed), 'status': status, 'verificationMethod': 'server_verified'})
        finally: return_connection(conn)

    @app.post('/api/school/classes/<int:class_id>/invitations')
    def invite_class_members(class_id):
        payload = request.get_json(silent=True) or {}
        raw_emails = payload.get('emails') or []
        if isinstance(raw_emails, str):
            raw_emails = re.split(r'[,;\s]+', raw_emails)
        emails = sorted({str(email).strip().lower() for email in raw_emails if '@' in str(email)})
        if not emails:
            return jsonify({'message': 'Add at least one valid email address.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                result, error = require_class(cur, user, class_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                cls, role = result
                created = []
                for email in emails[:200]:
                    token = secrets.token_urlsafe(28)
                    cur.execute('INSERT INTO school_invitations (organization_id,class_id,email,role,token,invited_by,created_at,expires_at) VALUES (%s,%s,%s,%s,%s,%s,%s,DATE_ADD(%s, INTERVAL 14 DAY))', (cls['organization_id'], class_id, email, str(payload.get('role') or 'learner'), token, user['id'], now_db(), now_db()))
                    created.append({'email': email, 'token': token})
            conn.commit()
            return jsonify({'message': f'Created {len(created)} invitation(s).', 'invitations': created}), 201
        finally: return_connection(conn)

    @app.get('/api/school/classes/<int:class_id>/invitations')
    def list_class_invitations(class_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                result, error = require_class(cur, user, class_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                cur.execute("SELECT email,role,status,created_at,expires_at FROM school_invitations WHERE class_id=%s ORDER BY created_at DESC", (class_id,))
                invitations = [{'email': row['email'], 'role': row['role'], 'status': row['status'], 'createdAt': row['created_at'].isoformat() if row.get('created_at') else None, 'expiresAt': row['expires_at'].isoformat() if row.get('expires_at') else None} for row in cur.fetchall()]
            return jsonify({'invitations': invitations})
        finally: return_connection(conn)

    @app.patch('/api/school/organizations/<int:organization_id>/members/<int:member_id>')
    def update_org_member(organization_id, member_id):
        payload = request.get_json(silent=True) or {}
        role = str(payload.get('role') or '').strip()
        if role not in ('org_admin', 'teacher', 'learner'):
            return jsonify({'message': 'Role must be org_admin, teacher, or learner.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); acting_role, error = require_org(cur, user, organization_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                if acting_role != 'org_admin': return jsonify({'message': 'Only organisation admins can change roles.'}), 403
                cur.execute("SELECT COUNT(*) AS admins FROM organization_members WHERE organization_id=%s AND role='org_admin' AND status='active'", (organization_id,))
                admin_count = int((cur.fetchone() or {}).get('admins') or 0)
                cur.execute("SELECT role FROM organization_members WHERE organization_id=%s AND user_id=%s AND status='active'", (organization_id, member_id))
                target = cur.fetchone()
                if not target: return jsonify({'message': 'Member not found.'}), 404
                if target['role'] == 'org_admin' and role != 'org_admin' and admin_count <= 1:
                    return jsonify({'message': 'An organisation must retain at least one admin.'}), 409
                cur.execute("UPDATE organization_members SET role=%s WHERE organization_id=%s AND user_id=%s AND status='active'", (role, organization_id, member_id))
            conn.commit(); return jsonify({'message': 'Member role updated.'})
        finally: return_connection(conn)

    @app.get('/api/school/organizations/<int:organization_id>/members')
    def list_org_members(organization_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                role, error = require_org(cur, user, organization_id)
                if error: return jsonify({'message': error[0]}), error[1]
                if role not in ('org_admin', 'teacher'):
                    return jsonify({'message': 'Only organisation staff can view members.'}), 403
                cur.execute("""SELECT u.id,u.username,u.email,om.role,om.status,om.joined_at
                    FROM organization_members om JOIN users u ON u.id=om.user_id
                    WHERE om.organization_id=%s AND om.status IN ('active','pending')
                    ORDER BY FIELD(om.role,'org_admin','teacher','learner'),u.username""", (organization_id,))
                members = [{
                    'id': row['id'], 'username': row['username'], 'email': row['email'],
                    'role': row['role'], 'status': row['status'],
                    'joinedAt': row['joined_at'].isoformat() if row.get('joined_at') else None,
                } for row in cur.fetchall()]
            return jsonify({'members': members})
        finally: return_connection(conn)

    @app.delete('/api/school/organizations/<int:organization_id>/members/<int:member_id>')
    def remove_org_member(organization_id, member_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                acting_role, error = require_org(cur, user, organization_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                if acting_role != 'org_admin':
                    return jsonify({'message': 'Only organisation admins can remove organisation members.'}), 403
                if int(user['id']) == int(member_id):
                    return jsonify({'message': 'You cannot remove yourself from the organisation.'}), 409
                cur.execute("SELECT role FROM organization_members WHERE organization_id=%s AND user_id=%s AND status='active'", (organization_id, member_id))
                target = cur.fetchone()
                if not target: return jsonify({'message': 'Member not found.'}), 404
                if target['role'] == 'org_admin':
                    cur.execute("SELECT COUNT(*) AS admins FROM organization_members WHERE organization_id=%s AND role='org_admin' AND status='active'", (organization_id,))
                    if int((cur.fetchone() or {}).get('admins') or 0) <= 1:
                        return jsonify({'message': 'An organisation must retain at least one admin.'}), 409
                cur.execute("UPDATE organization_members SET status='removed' WHERE organization_id=%s AND user_id=%s", (organization_id, member_id))
                cur.execute("UPDATE class_members cm JOIN classes c ON c.id=cm.class_id SET cm.status='removed' WHERE c.organization_id=%s AND cm.user_id=%s", (organization_id, member_id))
            conn.commit()
            return jsonify({'message': 'Member removed from the organisation.'})
        finally: return_connection(conn)

    @app.delete('/api/school/classes/<int:class_id>/members/<int:member_id>')
    def remove_class_member(class_id, member_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); result, error = require_class(cur, user, class_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                cur.execute("UPDATE class_members SET status='removed' WHERE class_id=%s AND user_id=%s AND status='active'", (class_id, member_id))
                if cur.rowcount == 0: return jsonify({'message': 'Learner is not in this class.'}), 404
            conn.commit(); return jsonify({'message': 'Learner removed from the class.'})
        finally: return_connection(conn)

    @app.get('/api/school/assignments')
    def learner_assignments():
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute("""SELECT a.*,c.name class_name,o.name organization_name,s.wpm submitted_wpm,s.accuracy submitted_accuracy,s.passed submitted_passed,s.status submitted_status,s.verification_method submitted_verification_method,s.race_id,s.submitted_at
                    FROM assignments a JOIN classes c ON c.id=a.class_id JOIN organizations o ON o.id=c.organization_id
                    JOIN class_members cm ON cm.class_id=c.id AND cm.user_id=%s AND cm.status='active'
                    LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.user_id=%s
                    WHERE COALESCE(a.status,'published') <> 'archived' ORDER BY a.due_at IS NULL,a.due_at,a.created_at DESC""", (user['id'], user['id']))
                items = []
                for r in cur.fetchall():
                    cur.execute("""SELECT wpm,accuracy,verification_method,race_id,submitted_at FROM assignment_attempts
                        WHERE assignment_id=%s AND user_id=%s ORDER BY submitted_at DESC""", (r['id'], user['id']))
                    history = [{
                        'wpm': float(attempt['wpm'] or 0),
                        'accuracy': float(attempt['accuracy'] or 0),
                        'verificationMethod': attempt.get('verification_method') or 'legacy',
                        'raceId': attempt.get('race_id'),
                        'submittedAt': attempt['submitted_at'].isoformat() if attempt.get('submitted_at') else None,
                    } for attempt in cur.fetchall()]
                    submitted_status = r.get('submitted_status')
                    learner_status = 'passed' if submitted_status == 'passed' else ('submitted' if r.get('submitted_at') else 'pending')
                    items.append({'id': r['id'], 'classId': r['class_id'], 'title': r['title'], 'instructions': r.get('instructions') or '', 'className': r['class_name'], 'organizationName': r['organization_name'], 'targetWpm': float(r['target_wpm'] or 0), 'targetAccuracy': float(r['target_accuracy'] or 0), 'dueAt': r['due_at'].isoformat() if r.get('due_at') else None, 'status': learner_status, 'passed': bool(r.get('submitted_passed')), 'verificationMethod': r.get('submitted_verification_method') or 'legacy', 'wpm': float(r['submitted_wpm'] or 0) if r.get('submitted_at') else None, 'accuracy': float(r['submitted_accuracy'] or 0) if r.get('submitted_at') else None, 'raceId': r.get('race_id'), 'submittedAt': r['submitted_at'].isoformat() if r.get('submitted_at') else None, 'history': history})
            return jsonify({'assignments': items})
        finally: return_connection(conn)

    @app.post('/api/school/classes/<int:class_id>/members/<int:user_id>/<action>')
    def manage_class_member(class_id, user_id, action):
        if action not in ('approve', 'suspend', 'remove', 'restore'):
            return jsonify({'message': 'Unsupported member action.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur)
                result, error = require_class(cur, user, class_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                cls, _ = result
                status = 'active' if action in ('approve','restore') else ('suspended' if action == 'suspend' else 'removed')
                cur.execute('UPDATE class_members SET status=%s WHERE class_id=%s AND user_id=%s', (status, class_id, user_id))
                if cur.rowcount == 0: return jsonify({'message': 'Learner is not in this class.'}), 404
            conn.commit(); return jsonify({'message': f'Learner {action}d.', 'status': status})
        finally: return_connection(conn)

    @app.post('/api/school/organizations/<int:organization_id>/teachers/invite')
    def invite_teacher(organization_id):
        payload = request.get_json(silent=True) or {}; email = str(payload.get('email') or '').strip().lower()
        if not email or '@' not in email: return jsonify({'message': 'A valid teacher email is required.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); role, error = require_org(cur, user, organization_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                if role != 'org_admin': return jsonify({'message': 'Only organisation admins can invite teachers.'}), 403
                token = secrets.token_urlsafe(30)
                cur.execute("INSERT INTO school_invitations (organization_id,email,role,token,invited_by,created_at,expires_at) VALUES (%s,%s,'teacher',%s,%s,%s,DATE_ADD(%s, INTERVAL 14 DAY))", (organization_id,email,token,user['id'],now_db(),now_db()))
            conn.commit(); return jsonify({'message': 'Teacher invitation created.', 'invitation': {'email': email, 'token': token}}), 201
        finally: return_connection(conn)

    @app.get('/api/school/invitations')
    def list_my_school_invitations():
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            email = str(user.get('email') or '').strip().lower()
            if not email: return jsonify({'invitations': []})
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute("""SELECT i.token,i.email,i.role,i.class_id,o.id organization_id,o.name organization_name,
                    c.name class_name,i.created_at,i.expires_at
                    FROM school_invitations i JOIN organizations o ON o.id=i.organization_id AND o.active=1
                    LEFT JOIN classes c ON c.id=i.class_id
                    WHERE LOWER(i.email)=LOWER(%s) AND i.status='pending'
                      AND (i.expires_at IS NULL OR i.expires_at>%s)
                    ORDER BY i.created_at DESC""", (email, now_db()))
                invitations = [{
                    'token': row['token'], 'email': row['email'], 'role': row['role'],
                    'organizationId': row['organization_id'], 'organizationName': row['organization_name'],
                    'classId': row['class_id'], 'className': row.get('class_name'),
                    'createdAt': row['created_at'].isoformat() if row.get('created_at') else None,
                } for row in cur.fetchall()]
            return jsonify({'invitations': invitations})
        finally: return_connection(conn)

    @app.post('/api/school/invitations/accept')
    def accept_school_invitation():
        payload = request.get_json(silent=True) or {}
        token = str(payload.get('token') or '').strip()
        if not token: return jsonify({'message': 'Invitation token is required.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            email = str(user.get('email') or '').strip().lower()
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute("""SELECT * FROM school_invitations WHERE token=%s AND status='pending'
                    AND LOWER(email)=LOWER(%s) AND (expires_at IS NULL OR expires_at>%s) FOR UPDATE""",
                    (token, email, now_db()))
                invitation = cur.fetchone()
                if not invitation:
                    return jsonify({'message': 'Invitation is invalid, expired, or belongs to another account.'}), 404
                cur.execute('SELECT active FROM organizations WHERE id=%s', (invitation['organization_id'],))
                org = cur.fetchone()
                if not org or not org.get('active'):
                    return jsonify({'message': 'This organisation is unavailable.'}), 404
                invited_role = invitation['role']
                member_role = 'teacher' if invited_role == 'teacher' else 'learner'
                cur.execute("""INSERT INTO organization_members (organization_id,user_id,role,status,joined_at)
                    VALUES (%s,%s,%s,'active',%s)
                    ON DUPLICATE KEY UPDATE role=IF(status='active',role,VALUES(role)),status='active'""",
                    (invitation['organization_id'], user['id'], member_role, now_db()))
                if invitation.get('class_id') and member_role == 'learner':
                    cur.execute('SELECT settings_json FROM organizations WHERE id=%s', (invitation['organization_id'],))
                    settings_row = cur.fetchone() or {}
                    try:
                        settings = json.loads(settings_row.get('settings_json') or '{}')
                    except (TypeError, ValueError):
                        settings = {}
                    status = 'pending' if settings.get('requireLearnerApproval') else 'active'
                    cur.execute("""INSERT INTO class_members (class_id,user_id,status,joined_at)
                        VALUES (%s,%s,%s,%s) ON DUPLICATE KEY UPDATE status=VALUES(status)""",
                        (invitation['class_id'], user['id'], status, now_db()))
                cur.execute("UPDATE school_invitations SET status='accepted' WHERE id=%s", (invitation['id'],))
            conn.commit()
            return jsonify({'message': 'Invitation accepted.', 'role': member_role})
        finally: return_connection(conn)

    @app.post('/api/school/organizations/<int:organization_id>/settings')
    def update_org_settings(organization_id):
        payload = request.get_json(silent=True) or {}
        settings = payload.get('settings')
        if not isinstance(settings, dict):
            return jsonify({'message': 'Settings must be an object.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); role, error = require_org(cur, user, organization_id, manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                if role != 'org_admin': return jsonify({'message': 'Only organisation admins can change settings.'}), 403
                cur.execute('UPDATE organizations SET settings_json=%s WHERE id=%s', (json.dumps(settings), organization_id))
            conn.commit(); return jsonify({'message': 'Organisation settings saved.'})
        finally: return_connection(conn)

    @app.post('/api/school/classes/<int:class_id>/regenerate-code')
    def regenerate_class_code(class_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT * FROM classes WHERE id=%s', (class_id,)); cls = cur.fetchone()
                if not cls: return jsonify({'message': 'Class not found.'}), 404
                _, error = require_org(cur, user, cls['organization_id'], manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                for _ in range(10):
                    code = secrets.token_hex(3).upper()
                    cur.execute('SELECT id FROM classes WHERE join_code=%s AND id<>%s', (code, class_id))
                    if not cur.fetchone(): break
                else:
                    return jsonify({'message': 'Could not generate a unique join code. Please try again.'}), 503
                cur.execute('UPDATE classes SET join_code=%s WHERE id=%s', (code,class_id))
            conn.commit(); return jsonify({'joinCode': code})
        finally: return_connection(conn)

    @app.get('/api/admin/school/organizations')
    def admin_school_organizations():
        conn = get_connection()
        try:
            user = auth(conn)
            if not (user and admin_email and is_admin_email(user.get('email') or '')): return jsonify({'message': 'Forbidden'}), 403
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute("""SELECT o.id,o.name,o.slug,o.created_at,o.active,COUNT(DISTINCT CASE WHEN om.status='active' THEN om.user_id END) members,COUNT(DISTINCT CASE WHEN c.active=1 THEN c.id END) classes FROM organizations o LEFT JOIN organization_members om ON om.organization_id=o.id LEFT JOIN classes c ON c.organization_id=o.id GROUP BY o.id ORDER BY o.name""")
                return jsonify({'organizations': [{'id': r['id'], 'name': r['name'], 'slug': r['slug'], 'members': int(r['members'] or 0), 'classes': int(r['classes'] or 0), 'active': bool(r.get('active', 1)), 'createdAt': r['created_at'].isoformat() if r.get('created_at') else None} for r in cur.fetchall()]})
        finally: return_connection(conn)

    @app.get('/api/admin/school/organizations/<int:organization_id>')
    def admin_school_organization_details(organization_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not (user and admin_email and is_admin_email(user.get('email') or '')): return jsonify({'message': 'Forbidden'}), 403
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT id,name,active FROM organizations WHERE id=%s', (organization_id,))
                org = cur.fetchone()
                if not org: return jsonify({'message': 'Organisation not found.'}), 404
                cur.execute("""SELECT c.id,c.name,c.active,c.join_code,COUNT(DISTINCT CASE WHEN cm.status='active'
                    AND om.role='learner' AND om.status='active' THEN cm.user_id END) learner_count
                    FROM classes c LEFT JOIN class_members cm ON cm.class_id=c.id
                    LEFT JOIN organization_members om ON om.organization_id=c.organization_id AND om.user_id=cm.user_id
                    WHERE c.organization_id=%s GROUP BY c.id ORDER BY c.name""", (organization_id,))
                classes = [{'id': row['id'], 'name': row['name'], 'active': bool(row.get('active', 1)), 'joinCode': row['join_code'], 'learnerCount': int(row.get('learner_count') or 0)} for row in cur.fetchall()]
                cur.execute("""SELECT u.id,u.username,u.email,om.role,om.status FROM organization_members om
                    JOIN users u ON u.id=om.user_id WHERE om.organization_id=%s ORDER BY u.username""", (organization_id,))
                members = [{'id': row['id'], 'username': row['username'], 'email': row['email'], 'role': row['role'], 'status': row['status']} for row in cur.fetchall()]
            return jsonify({'organization': {'id': org['id'], 'name': org['name'], 'active': bool(org['active'])}, 'classes': classes, 'members': members})
        finally: return_connection(conn)

    @app.patch('/api/admin/school/organizations/<int:organization_id>')
    def admin_update_school_organization(organization_id):
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload.get('active'), bool):
            return jsonify({'message': 'Active must be a boolean.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not (user and admin_email and is_admin_email(user.get('email') or '')): return jsonify({'message': 'Forbidden'}), 403
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT id FROM organizations WHERE id=%s', (organization_id,))
                if not cur.fetchone(): return jsonify({'message': 'Organisation not found.'}), 404
                cur.execute('UPDATE organizations SET active=%s WHERE id=%s', (int(payload['active']), organization_id))
                if not payload['active']:
                    cur.execute('UPDATE classes SET active=0 WHERE organization_id=%s', (organization_id,))
            conn.commit()
            return jsonify({'message': 'Organisation updated.'})
        finally: return_connection(conn)

    @app.patch('/api/admin/school/classes/<int:class_id>')
    def admin_update_school_class(class_id):
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload.get('active'), bool):
            return jsonify({'message': 'Active must be a boolean.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not (user and admin_email and is_admin_email(user.get('email') or '')): return jsonify({'message': 'Forbidden'}), 403
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT id FROM classes WHERE id=%s', (class_id,))
                if not cur.fetchone(): return jsonify({'message': 'Class not found.'}), 404
                cur.execute('UPDATE classes SET active=%s WHERE id=%s', (int(payload['active']), class_id))
            conn.commit()
            return jsonify({'message': 'Class updated.'})
        finally: return_connection(conn)

    @app.post('/api/school/classes/<int:class_id>/import')
    def import_learners(class_id):
        payload = request.get_json(silent=True) or {}; raw = str(payload.get('csv') or '')
        if not raw: return jsonify({'message': 'CSV content is required.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT organization_id FROM classes WHERE id=%s', (class_id,)); cls = cur.fetchone()
                if not cls: return jsonify({'message': 'Class not found.'}), 404
                _, error = require_org(cur, user, cls['organization_id'], manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                reader = csv.DictReader(io.StringIO(raw)); imported, unmatched, invitations = [], [], []
                for row in reader:
                    email = str(row.get('email') or row.get('Email') or '').strip().lower()
                    if not email: continue
                    cur.execute('SELECT id,username FROM users WHERE LOWER(email)=LOWER(%s) LIMIT 1', (email,)); learner = cur.fetchone()
                    if not learner:
                        token = secrets.token_urlsafe(30)
                        cur.execute("INSERT INTO school_invitations (organization_id,class_id,email,role,token,invited_by,created_at) VALUES (%s,%s,%s,'learner',%s,%s,%s)", (cls['organization_id'], class_id, email, token, user['id'], now_db()))
                        unmatched.append(email); invitations.append({'email': email, 'token': token}); continue
                    cur.execute("INSERT INTO organization_members (organization_id,user_id,role,status,joined_at) VALUES (%s,%s,'learner','active',%s) ON DUPLICATE KEY UPDATE status='active'", (cls['organization_id'], learner['id'], now_db()))
                    cur.execute("INSERT INTO class_members (class_id,user_id,status,joined_at) VALUES (%s,%s,'active',%s) ON DUPLICATE KEY UPDATE status='active'", (class_id, learner['id'], now_db()))
                    imported.append({'email': email, 'username': learner['username']})
            conn.commit(); return jsonify({'imported': imported, 'unmatched': unmatched, 'invitations': invitations, 'message': f'Imported {len(imported)} learner(s) and created {len(invitations)} invitation(s).'})
        finally: return_connection(conn)

    @app.get('/api/school/classes/<int:class_id>/export')
    def export_class(class_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT organization_id,name FROM classes WHERE id=%s', (class_id,)); cls = cur.fetchone()
                if not cls: return jsonify({'message': 'Class not found.'}), 404
                _, error = require_org(cur, user, cls['organization_id'], manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                cur.execute("SELECT u.username,u.email,u.wpm,u.accuracy,COUNT(rh.id) races FROM class_members cm JOIN users u ON u.id=cm.user_id LEFT JOIN race_history rh ON rh.user_id=u.id WHERE cm.class_id=%s AND cm.status='active' GROUP BY u.id ORDER BY u.username", (class_id,))
                output = io.StringIO(); writer = csv.writer(output); writer.writerow(['username','email','wpm','accuracy','races']); writer.writerows([[r['username'],r['email'],float(r.get('wpm') or 0),float(r.get('accuracy') or 0),int(r.get('races') or 0)] for r in cur.fetchall()])
            return Response(output.getvalue(), mimetype='text/csv', headers={'Content-Disposition': f'attachment; filename="typearena-class-{class_id}.csv"'})
        finally: return_connection(conn)

    @app.get('/api/school/config')
    def school_config():
        return jsonify({'moneyFeaturesEnabled': False, 'practiceEnabled': True, 'privateRoomsEnabled': True, 'schoolModeEnabled': True})

    return ensure_tables
