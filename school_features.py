"""Organisation, classroom, assignment, and school-safe race APIs."""

from __future__ import annotations

import csv
import io
import re
import secrets
from datetime import datetime

from flask import jsonify, request, Response


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
                status ENUM('active','removed') NOT NULL DEFAULT 'active',
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
                submitted_at DATETIME NOT NULL,
                UNIQUE KEY uniq_assignment_submission (assignment_id, user_id),
                INDEX idx_submission_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )

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
        return {
            'id': int(row['id']), 'name': row['name'], 'slug': row['slug'],
            'role': role or row.get('role'), 'createdAt': row.get('created_at').isoformat() if row.get('created_at') else None,
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
        if not org:
            return None, ('Organisation not found.', 404)
        return role, None

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
                       ON m.organization_id=o.id WHERE m.user_id=%s AND m.status='active' ORDER BY o.name""",
                    (user['id'],),
                )
                orgs = [org_payload(row) for row in cur.fetchall()]
                cur.execute(
                    """SELECT c.*, COUNT(cm.id) learner_count FROM classes c
                       JOIN class_members cm ON cm.class_id=c.id AND cm.status='active'
                       JOIN organization_members om ON om.organization_id=c.organization_id AND om.user_id=%s AND om.status='active'
                       GROUP BY c.id ORDER BY c.created_at DESC""",
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
                cur.execute("INSERT IGNORE INTO class_members (class_id,user_id,status,joined_at) VALUES (%s,%s,'active',%s)", (class_id, user['id'], now_db()))
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
                cur.execute("INSERT INTO organization_members (organization_id,user_id,role,status,joined_at) VALUES (%s,%s,'learner','active',%s) ON DUPLICATE KEY UPDATE status='active'", (cls['organization_id'], user['id'], now_db()))
                cur.execute("INSERT INTO class_members (class_id,user_id,status,joined_at) VALUES (%s,%s,'active',%s) ON DUPLICATE KEY UPDATE status='active'", (cls['id'], user['id'], now_db()))
            conn.commit(); return jsonify({'message': 'You joined the class.', 'class': class_payload(cls)})
        finally: return_connection(conn)

    @app.get('/api/school/classes/<int:class_id>')
    def get_class(class_id):
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT * FROM classes WHERE id=%s', (class_id,)); cls = cur.fetchone()
                if not cls: return jsonify({'message': 'Class not found.'}), 404
                role, error = require_org(cur, user, cls['organization_id'])
                if error: return jsonify({'message': error[0]}), error[1]
                cur.execute("SELECT u.id,u.username,u.email,u.wpm,u.accuracy,cm.joined_at FROM class_members cm JOIN users u ON u.id=cm.user_id WHERE cm.class_id=%s AND cm.status='active' ORDER BY u.username", (class_id,))
                learners = [{'id': r['id'], 'username': r['username'], 'email': r['email'], 'wpm': float(r.get('wpm') or 0), 'accuracy': float(r.get('accuracy') or 0), 'joinedAt': r['joined_at'].isoformat() if r.get('joined_at') else None} for r in cur.fetchall()]
                cur.execute('SELECT * FROM assignments WHERE class_id=%s ORDER BY created_at DESC', (class_id,))
                assignments = [{'id': r['id'], 'title': r['title'], 'instructions': r.get('instructions') or '', 'targetWpm': float(r['target_wpm'] or 0), 'targetAccuracy': float(r['target_accuracy'] or 0), 'mode': r['mode'], 'dueAt': r['due_at'].isoformat() if r.get('due_at') else None} for r in cur.fetchall()]
            return jsonify({'class': class_payload(cls), 'role': role, 'learners': learners, 'assignments': assignments})
        finally: return_connection(conn)

    @app.post('/api/school/classes/<int:class_id>/assignments')
    def create_assignment(class_id):
        payload = request.get_json(silent=True) or {}
        title = str(payload.get('title') or '').strip()
        if not title: return jsonify({'message': 'Assignment title is required.'}), 400
        conn = get_connection()
        try:
            user = auth(conn)
            if not user: return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                ensure_tables(cur); cur.execute('SELECT organization_id FROM classes WHERE id=%s', (class_id,)); cls = cur.fetchone()
                if not cls: return jsonify({'message': 'Class not found.'}), 404
                _, error = require_org(cur, user, cls['organization_id'], manage=True)
                if error: return jsonify({'message': error[0]}), error[1]
                cur.execute('INSERT INTO assignments (class_id,created_by,title,instructions,target_wpm,target_accuracy,mode,due_at,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)', (class_id, user['id'], title, str(payload.get('instructions') or ''), float(payload.get('targetWpm') or 0), float(payload.get('targetAccuracy') or 0), str(payload.get('mode') or 'practice'), payload.get('dueAt') or None, now_db()))
                assignment_id = cur.lastrowid
            conn.commit(); return jsonify({'id': assignment_id, 'message': 'Assignment created.'}), 201
        finally: return_connection(conn)

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
                cur.execute('INSERT INTO assignment_submissions (assignment_id,user_id,race_id,wpm,accuracy,submitted_at) VALUES (%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE race_id=VALUES(race_id),wpm=VALUES(wpm),accuracy=VALUES(accuracy),submitted_at=VALUES(submitted_at)', (assignment_id, user['id'], payload.get('raceId'), float(payload.get('wpm') or 0), float(payload.get('accuracy') or 0), now_db()))
            conn.commit(); return jsonify({'message': 'Assignment submitted.'})
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
                reader = csv.DictReader(io.StringIO(raw)); imported, unmatched = [], []
                for row in reader:
                    email = str(row.get('email') or row.get('Email') or '').strip().lower()
                    if not email: continue
                    cur.execute('SELECT id,username FROM users WHERE LOWER(email)=LOWER(%s) LIMIT 1', (email,)); learner = cur.fetchone()
                    if not learner: unmatched.append(email); continue
                    cur.execute("INSERT INTO organization_members (organization_id,user_id,role,status,joined_at) VALUES (%s,%s,'learner','active',%s) ON DUPLICATE KEY UPDATE status='active'", (cls['organization_id'], learner['id'], now_db()))
                    cur.execute("INSERT INTO class_members (class_id,user_id,status,joined_at) VALUES (%s,%s,'active',%s) ON DUPLICATE KEY UPDATE status='active'", (class_id, learner['id'], now_db()))
                    imported.append({'email': email, 'username': learner['username']})
            conn.commit(); return jsonify({'imported': imported, 'unmatched': unmatched, 'message': f'Imported {len(imported)} learner(s).'})
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
