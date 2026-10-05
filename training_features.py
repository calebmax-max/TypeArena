from __future__ import annotations

from flask import jsonify, request
import json


LESSON_TARGETS = {
    'u1-l1': (10, 90), 'u1-l2': (15, 90), 'u1-l3': (18, 90), 'u1-l4': (20, 90),
    'u2-l1': (22, 90), 'u2-l2': (25, 90), 'u2-l3': (28, 90),
    'u3-l1': (30, 91), 'u3-l2': (30, 90), 'u3-l3': (32, 91),
    'u4-l1': (32, 92), 'u4-l2': (33, 92), 'u4-l3': (35, 92),
    'u5-l1': (38, 93), 'u5-l2': (42, 93), 'u5-l3': (45, 93),
    'sb1': (50, 94), 'sb2': (55, 94), 'sp3': (60, 95),
}

SEED_LESSONS = [
    ('Introduction to touch typing', 'Learn posture, finger placement, and relaxed rhythm.', 8, 90, 60),
    ('Home row: ASDF JKL;', 'asdf jkl; asdf jkl; sad lad fall ask flask', 10, 90, 90),
    ('Left-hand practice', 'sad dad fad gas was red sea', 12, 90, 90),
    ('Right-hand practice', 'jkl; kill ask all fall hall', 12, 90, 90),
    ('Combining both hands', 'a sad lad had a flag and a glass', 15, 90, 120),
    ('Common words', 'the and for you are not but can get this with', 20, 90, 150),
    ('Short sentences', 'The quick learner types with calm and steady hands.', 25, 90, 180),
]


def register_training_routes(app, *, get_connection, return_connection, get_user, is_admin=None):
    def ensure_tables(cur):
        cur.execute('''CREATE TABLE IF NOT EXISTS training_courses (
            id BIGINT AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(80) NOT NULL UNIQUE,
            title VARCHAR(160) NOT NULL, description TEXT NULL, is_pro TINYINT(1) NOT NULL DEFAULT 0,
            is_archived TINYINT(1) NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
        cur.execute("SHOW COLUMNS FROM training_courses LIKE 'prerequisite_course_id'")
        if not cur.fetchone(): cur.execute("ALTER TABLE training_courses ADD COLUMN prerequisite_course_id BIGINT NULL AFTER is_pro")
        cur.execute('''CREATE TABLE IF NOT EXISTS training_lessons (
            id BIGINT AUTO_INCREMENT PRIMARY KEY, course_id BIGINT NOT NULL, title VARCHAR(160) NOT NULL,
            content TEXT NOT NULL, target_wpm DECIMAL(7,2) NOT NULL, target_accuracy DECIMAL(6,2) NOT NULL,
            duration_seconds INT NOT NULL DEFAULT 120, order_number INT NOT NULL DEFAULT 1,
            is_archived TINYINT(1) NOT NULL DEFAULT 0, KEY idx_training_lessons_course (course_id, order_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
        cur.execute("SHOW COLUMNS FROM training_lessons LIKE 'unit_title'")
        if not cur.fetchone(): cur.execute("ALTER TABLE training_lessons ADD COLUMN unit_title VARCHAR(120) NULL AFTER course_id")
        cur.execute("SHOW COLUMNS FROM training_lessons LIKE 'lesson_type'")
        if not cur.fetchone(): cur.execute("ALTER TABLE training_lessons ADD COLUMN lesson_type VARCHAR(30) NOT NULL DEFAULT 'practice' AFTER unit_title")
        cur.execute("SELECT id FROM training_courses LIMIT 1")
        if cur.fetchone() is None:
            cur.execute("INSERT INTO training_courses (slug,title,description) VALUES ('beginner','Beginner Typing','Build touch-typing confidence from the home row to short sentences.')")
            course_id = cur.lastrowid
            for order_number, (title, content, wpm, accuracy, duration) in enumerate(SEED_LESSONS, 1):
                unit = 'Getting Started' if order_number == 1 else 'Home Row' if order_number <= 5 else 'Building Words'
                lesson_type = 'intro' if order_number == 1 else 'test' if order_number == len(SEED_LESSONS) else 'practice'
                cur.execute('INSERT INTO training_lessons (course_id,unit_title,lesson_type,title,content,target_wpm,target_accuracy,duration_seconds,order_number) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)', (course_id, unit, lesson_type, title, content, wpm, accuracy, duration, order_number))
        cur.execute("UPDATE training_lessons SET unit_title=CASE WHEN order_number=1 THEN 'Getting Started' WHEN order_number<=5 THEN 'Home Row' ELSE 'Building Words' END WHERE unit_title IS NULL")
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
                key_errors_json TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_training_attempt_event (user_id, event_id),
                KEY idx_training_attempt_user_lesson (user_id, lesson_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ''')
        cur.execute("SHOW COLUMNS FROM training_attempts LIKE 'key_errors_json'")
        if not cur.fetchone(): cur.execute("ALTER TABLE training_attempts ADD COLUMN key_errors_json TEXT NULL AFTER xp_earned")

    @app.get('/api/training/courses')
    def training_courses():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT id,slug,title,description,is_pro,prerequisite_course_id FROM training_courses WHERE is_archived=0 ORDER BY id')
                courses = cur.fetchall()
                for course in courses:
                    cur.execute('SELECT id,course_id,unit_title,lesson_type,title,content,target_wpm,target_accuracy,duration_seconds,order_number FROM training_lessons WHERE course_id=%s AND is_archived=0 ORDER BY order_number,id', (course['id'],))
                    course['lessons'] = cur.fetchall()
                    cur.execute('SELECT COUNT(*) total, SUM(CASE WHEN passed=1 THEN 1 ELSE 0 END) passed FROM training_attempts a JOIN training_lessons l ON CAST(a.lesson_id AS UNSIGNED)=l.id WHERE a.user_id=%s AND l.course_id=%s AND l.is_archived=0', (get_user(conn)['id'] if get_user(conn) else 0, course['id']))
                    stats = cur.fetchone() or {}
                    course['progress'] = {'totalLessons': int(stats.get('total') or 0), 'passedLessons': int(stats.get('passed') or 0)}
                    course['completed'] = course['progress']['totalLessons'] > 0 and course['progress']['passedLessons'] >= course['progress']['totalLessons']
                    course['isLocked'] = False
                    if course.get('prerequisite_course_id'):
                        prerequisite = next((item for item in courses if item['id'] == course['prerequisite_course_id']), None)
                        course['isLocked'] = not bool(prerequisite and prerequisite.get('completed'))
                conn.commit()
                return jsonify({'courses': courses})
        finally:
            return_connection(conn)

    @app.get('/api/training/problem-keys')
    def training_problem_keys():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user: return jsonify({'keys': []})
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT key_errors_json FROM training_attempts WHERE user_id=%s AND key_errors_json IS NOT NULL', (user['id'],))
                totals = {}
                for row in cur.fetchall():
                    try: errors = json.loads(row['key_errors_json'] or '{}')
                    except (TypeError, ValueError): errors = {}
                    for key, count in errors.items(): totals[key] = totals.get(key, 0) + int(count or 0)
                keys = [{'key': key, 'errors': count} for key, count in totals.items()]
                keys.sort(key=lambda item: item['errors'], reverse=True)
                return jsonify({'keys': keys[:8]})
        finally: return_connection(conn)

    def admin_allowed(conn):
        user = get_user(conn)
        return bool(user and (is_admin(user) if is_admin else user.get('is_admin') or user.get('isAdmin')))

    @app.get('/api/admin/training/courses')
    def admin_training_courses():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                cur.execute('SELECT id,slug,title,description,is_pro,prerequisite_course_id,is_archived FROM training_courses ORDER BY id')
                courses = cur.fetchall()
                for course in courses:
                    cur.execute('SELECT id,course_id,unit_title,lesson_type,title,content,target_wpm,target_accuracy,duration_seconds,order_number,is_archived FROM training_lessons WHERE course_id=%s ORDER BY order_number,id', (course['id'],))
                    course['lessons'] = cur.fetchall()
                return jsonify({'courses': courses})
        finally: return_connection(conn)

    @app.post('/api/admin/training/courses')
    def admin_training_course_create():
        return admin_training_course_write(None)

    @app.put('/api/admin/training/courses/<int:course_id>')
    def admin_training_course_update(course_id):
        return admin_training_course_write(course_id)

    def admin_training_course_write(course_id):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                data = request.get_json(silent=True) or {}
                title = str(data.get('title') or '').strip()
                slug = str(data.get('slug') or title.lower().replace(' ', '-')).strip()
                if not title or not slug: return jsonify({'message': 'Course title is required.'}), 400
                values = (slug, title, str(data.get('description') or '').strip(), int(bool(data.get('isPro'))), int(data.get('prerequisiteCourseId') or 0) or None, int(bool(data.get('isArchived'))))
                if course_id:
                    cur.execute('UPDATE training_courses SET slug=%s,title=%s,description=%s,is_pro=%s,prerequisite_course_id=%s,is_archived=%s WHERE id=%s', (*values, course_id))
                else:
                    cur.execute('INSERT INTO training_courses (slug,title,description,is_pro,prerequisite_course_id,is_archived) VALUES (%s,%s,%s,%s,%s,%s)', values)
                    course_id = cur.lastrowid
                conn.commit(); return jsonify({'id': course_id})
        finally: return_connection(conn)

    @app.delete('/api/admin/training/courses/<int:course_id>')
    def admin_training_course_delete(course_id):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                cur.execute('UPDATE training_courses SET is_archived=1 WHERE id=%s', (course_id,)); conn.commit(); return jsonify({'archived': True})
        finally: return_connection(conn)

    @app.post('/api/admin/training/courses/<int:course_id>/lessons')
    def admin_training_lesson_create(course_id):
        return admin_training_lesson_write(None, course_id)

    @app.put('/api/admin/training/lessons/<int:lesson_id>')
    def admin_training_lesson_update(lesson_id):
        return admin_training_lesson_write(lesson_id, None)

    def admin_training_lesson_write(lesson_id, course_id):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                data = request.get_json(silent=True) or {}
                values = (str(data.get('unitTitle') or 'Course lessons').strip(), str(data.get('lessonType') or 'practice').strip(), str(data.get('title') or '').strip(), str(data.get('content') or '').strip(), float(data.get('targetWpm') or 10), float(data.get('targetAccuracy') or 90), int(data.get('durationSeconds') or 120), int(data.get('orderNumber') or 1), int(bool(data.get('isArchived'))))
                if not values[0] or not values[1]: return jsonify({'message': 'Lesson title and content are required.'}), 400
                if lesson_id:
                    cur.execute('UPDATE training_lessons SET unit_title=%s,lesson_type=%s,title=%s,content=%s,target_wpm=%s,target_accuracy=%s,duration_seconds=%s,order_number=%s,is_archived=%s WHERE id=%s', (*values, lesson_id))
                else:
                    cur.execute('INSERT INTO training_lessons (course_id,unit_title,lesson_type,title,content,target_wpm,target_accuracy,duration_seconds,order_number,is_archived) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)', (course_id, *values))
                conn.commit(); return jsonify({'saved': True})
        finally: return_connection(conn)

    @app.delete('/api/admin/training/lessons/<int:lesson_id>')
    def admin_training_lesson_delete(lesson_id):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                cur.execute('UPDATE training_lessons SET is_archived=1 WHERE id=%s', (lesson_id,)); conn.commit(); return jsonify({'archived': True})
        finally: return_connection(conn)

    @app.get('/api/admin/training/progress')
    def admin_training_progress():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                cur.execute('SELECT lesson_id,COUNT(*) attempts,SUM(passed) passes,ROUND(AVG(wpm),1) average_wpm,ROUND(AVG(accuracy),1) average_accuracy FROM training_attempts GROUP BY lesson_id ORDER BY lesson_id')
                return jsonify({'lessons': cur.fetchall()})
        finally: return_connection(conn)

    @app.post('/api/training-events')
    def record_training_event():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to save training progress.'}), 401
            payload = request.get_json(silent=True) or {}
            lesson_id = str(payload.get('lessonId') or '').strip()
            if lesson_id in LESSON_TARGETS:
                min_wpm, min_accuracy = LESSON_TARGETS[lesson_id]
            else:
                try:
                    numeric_lesson_id = int(lesson_id)
                except ValueError:
                    return jsonify({'message': 'Unknown training lesson.'}), 400
                with conn.cursor() as lookup_cur:
                    lookup_cur.execute('SELECT target_wpm,target_accuracy FROM training_lessons WHERE id=%s AND is_archived=0', (numeric_lesson_id,))
                    lesson_target = lookup_cur.fetchone()
                if not lesson_target:
                    return jsonify({'message': 'Unknown training lesson.'}), 400
                min_wpm = float(lesson_target['target_wpm'])
                min_accuracy = float(lesson_target['target_accuracy'])
            with conn.cursor() as access_cur:
                try: numeric_lesson_id = int(lesson_id)
                except ValueError: numeric_lesson_id = None
                if numeric_lesson_id:
                    access_cur.execute('''SELECT c.prerequisite_course_id FROM training_lessons l JOIN training_courses c ON c.id=l.course_id WHERE l.id=%s''', (numeric_lesson_id,))
                    access = access_cur.fetchone() or {}
                    if access.get('prerequisite_course_id'):
                        access_cur.execute('SELECT COUNT(*) total FROM training_lessons WHERE course_id=%s AND is_archived=0', (access['prerequisite_course_id'],))
                        total = int((access_cur.fetchone() or {}).get('total') or 0)
                        access_cur.execute('''SELECT COUNT(DISTINCT a.lesson_id) passed FROM training_attempts a JOIN training_lessons l ON CAST(a.lesson_id AS UNSIGNED)=l.id WHERE a.user_id=%s AND l.course_id=%s AND a.passed=1 AND l.is_archived=0''', (user['id'], access['prerequisite_course_id']))
                        passed_count = int((access_cur.fetchone() or {}).get('passed') or 0)
                        if total == 0 or passed_count < total:
                            return jsonify({'message': 'Complete the previous course before starting this one.'}), 403
            event_id = str(payload.get('eventId') or '').strip()
            if not event_id or len(event_id) > 96:
                return jsonify({'message': 'A valid training event ID is required.'}), 400
            wpm = max(0.0, min(999.0, float(payload.get('wpm') or 0)))
            accuracy = max(0.0, min(100.0, float(payload.get('accuracy') or 0)))
            passed = int(wpm >= min_wpm and accuracy >= min_accuracy)
            unit_id = str(payload.get('unitId') or '').strip()[:40] or None
            key_errors_json = json.dumps(payload.get('keyErrors') or {}, ensure_ascii=False)[:4000]
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
                    (user_id, event_id, lesson_id, unit_id, wpm, accuracy, passed, xp_earned, key_errors_json)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                    (int(user['id']), event_id, lesson_id, unit_id, wpm, accuracy, passed, xp_earned, key_errors_json))
                conn.commit()
                return jsonify({'passed': bool(passed), 'xpEarned': xp_earned, 'duplicate': False})
        except (TypeError, ValueError):
            conn.rollback()
            return jsonify({'message': 'WPM and accuracy must be valid numbers.'}), 400
        finally:
            return_connection(conn)

    return ensure_tables
