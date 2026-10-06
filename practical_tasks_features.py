from __future__ import annotations

import json

from flask import jsonify, request


TASKS = [
    {
        'slug': 'file-organisation',
        'title': 'Organise a project folder',
        'category': 'Computer essentials',
        'taskType': 'text',
        'objective': 'Plan a clear folder structure for a small work project.',
        'instructions': 'Describe where you would place incoming files, working documents, approved files, and an archive. Include a safe file-naming rule.',
        'hint': 'Use folders such as Incoming, Working, Approved, and Archive. Mention dates or versions in filenames.',
    },
    {
        'slug': 'professional-email',
        'title': 'Write a professional email',
        'category': 'Workplace communication',
        'taskType': 'email',
        'objective': 'Compose a concise email that a supervisor or customer can act on.',
        'instructions': 'Write an email asking a supervisor to confirm a meeting time. Include a useful subject, greeting, clear request, and professional sign-off.',
        'hint': 'Keep the request specific and include the action or reply you need.',
    },
    {
        'slug': 'spreadsheet-data-entry',
        'title': 'Enter customer data accurately',
        'category': 'Data entry',
        'taskType': 'text',
        'objective': 'Create consistent rows of customer information ready for a spreadsheet.',
        'instructions': 'Enter three rows using this format: Name | Email | Amount. Use the sample customers Amina Otieno, Brian Kamau, and Carol Wanjiku with amounts 1250, 890, and 2100.',
        'hint': 'Keep one customer per line, use valid-looking email addresses, and do not change the amounts.',
    },
    {
        'slug': 'phishing-awareness',
        'title': 'Identify a suspicious message',
        'category': 'Digital safety',
        'taskType': 'choice',
        'objective': 'Recognise common warning signs before opening a link or sharing information.',
        'instructions': 'A message says your account will close in 10 minutes and asks you to open a shortened link to confirm your password. Choose the safest action.',
        'hint': 'Urgency, password requests, and unexpected links are warning signs.',
        'options': [
            {'value': 'open', 'label': 'Open the link and confirm the password'},
            {'value': 'forward', 'label': 'Forward it to colleagues so they can check'},
            {'value': 'report', 'label': 'Do not open it; report it through an official channel'},
        ],
    },
]


def _task_by_slug(slug):
    return next((task for task in TASKS if task['slug'] == slug), None)


def _default_verification(task):
    if task['slug'] == 'phishing-awareness': return {'requiredChoice': 'report'}
    if task['slug'] == 'professional-email': return {'minLength': 40, 'requiredTerms': ['greeting', 'signoff']}
    if task['slug'] == 'spreadsheet-data-entry': return {'requiredTerms': ['amina otieno', 'brian kamau', 'carol wanjiku', '1250', '890', '2100'], 'minLines': 3}
    return {'requiredTerms': ['incoming', 'working', 'approved', 'archive'], 'anyTerms': ['date', 'version', 'name']}


def register_practical_task_routes(app, *, get_connection, return_connection, get_user, is_admin=None):
    def ensure_tables(cur):
        cur.execute('''CREATE TABLE IF NOT EXISTS practical_tasks (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            slug VARCHAR(80) NOT NULL UNIQUE,
            title VARCHAR(180) NOT NULL,
            category VARCHAR(100) NOT NULL,
            task_type VARCHAR(30) NOT NULL DEFAULT 'text',
            objective TEXT NOT NULL,
            instructions TEXT NOT NULL,
            hint TEXT NULL,
            options_json TEXT NULL,
            verification_json TEXT NULL,
            is_archived TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
        cur.execute('''CREATE TABLE IF NOT EXISTS practical_task_attempts (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            task_slug VARCHAR(80) NOT NULL,
            response_json TEXT NOT NULL,
            score DECIMAL(5,2) NOT NULL DEFAULT 0,
            passed TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_practical_task_user (user_id, task_slug, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4''')
        cur.execute('SELECT COUNT(*) count FROM practical_tasks')
        if int((cur.fetchone() or {}).get('count') or 0) == 0:
            for task in TASKS:
                cur.execute('''INSERT INTO practical_tasks
                    (slug,title,category,task_type,objective,instructions,hint,options_json,verification_json)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                    (task['slug'], task['title'], task['category'], task['taskType'], task['objective'], task['instructions'], task.get('hint', ''), json.dumps(task.get('options', [])), json.dumps(_default_verification(task))))

    def admin_allowed(conn):
        user = get_user(conn)
        return bool(user and (is_admin(user) if is_admin else user.get('is_admin') or user.get('isAdmin')))

    def row_to_task(row, include_rules=False):
        task = {
            'id': row.get('id'), 'slug': row.get('slug'), 'title': row.get('title'), 'category': row.get('category'),
            'taskType': row.get('task_type'), 'objective': row.get('objective'), 'instructions': row.get('instructions'),
            'hint': row.get('hint') or '', 'isArchived': bool(row.get('is_archived')),
        }
        try: task['options'] = json.loads(row.get('options_json') or '[]')
        except (TypeError, ValueError): task['options'] = []
        if include_rules:
            try: task['verification'] = json.loads(row.get('verification_json') or '{}')
            except (TypeError, ValueError): task['verification'] = {}
        return task

    def evaluate(task, response):
        rules = task.get('verification') or _default_verification(task)
        if task['taskType'] == 'choice':
            passed = response.get('answer') == rules.get('requiredChoice')
        elif task['slug'] == 'professional-email':
            subject = str(response.get('subject') or '').strip()
            body = str(response.get('body') or '').strip().lower()
            passed = bool(subject) and len(body) >= 40 and any(word in body for word in ('hello', 'dear', 'hi ')) and any(word in body for word in ('regards', 'thank you', 'thanks', 'sincerely'))
        elif task['slug'] == 'spreadsheet-data-entry':
            body = str(response.get('text') or '').lower()
            passed = all(name in body for name in ('amina otieno', 'brian kamau', 'carol wanjiku')) and all(amount in body for amount in ('1250', '890', '2100')) and body.count('\n') >= 2
        elif task['slug'] in {'spreadsheet-data-entry', 'file-organisation'}:
            body = str(response.get('text') or '').lower()
            required_terms = [str(word).lower() for word in rules.get('requiredTerms', [])]
            any_terms = [str(word).lower() for word in rules.get('anyTerms', [])]
            passed = all(word in body for word in required_terms) and (not any_terms or any(word in body for word in any_terms)) and body.count('\n') + 1 >= int(rules.get('minLines') or 1)
        else:
            body = str(response.get('text') or response.get('body') or '').lower()
            passed = len(body) >= int(rules.get('minLength') or 1) and all(str(word).lower() in body for word in rules.get('requiredTerms', []))
        return 100 if passed else 0, passed

    @app.get('/api/practical-tasks')
    def practical_tasks():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT * FROM practical_tasks WHERE is_archived=0 ORDER BY category,title')
                return jsonify({'tasks': [row_to_task(row) for row in cur.fetchall()]})
        finally: return_connection(conn)

    @app.post('/api/practical-tasks/<slug>/submit')
    def submit_practical_task(slug):
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to save practical task evidence.'}), 401
            response = request.get_json(silent=True) or {}
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('SELECT * FROM practical_tasks WHERE slug=%s AND is_archived=0', (slug,))
                task_row = cur.fetchone()
                if not task_row: return jsonify({'message': 'Practical task not found.'}), 404
                task = row_to_task(task_row, include_rules=True)
                score, passed = evaluate(task, response)
                cur.execute('INSERT INTO practical_task_attempts (user_id,task_slug,response_json,score,passed) VALUES (%s,%s,%s,%s,%s)', (user['id'], slug, json.dumps(response)[:12000], score, int(passed)))
                conn.commit()
                return jsonify({'taskSlug': slug, 'score': score, 'passed': passed, 'message': 'Task evidence recorded.' if passed else 'Not quite yet. Review the task guidance and try again.'})
        finally:
            return_connection(conn)

    @app.get('/api/admin/practical-tasks')
    def admin_practical_tasks():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                cur.execute('SELECT * FROM practical_tasks ORDER BY is_archived,category,title')
                return jsonify({'tasks': [row_to_task(row, include_rules=True) for row in cur.fetchall()]})
        finally: return_connection(conn)

    @app.post('/api/admin/practical-tasks')
    @app.put('/api/admin/practical-tasks/<int:task_id>')
    def admin_practical_task_write(task_id=None):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                data = request.get_json(silent=True) or {}
                values = (str(data.get('slug') or '').strip()[:80], str(data.get('title') or '').strip()[:180], str(data.get('category') or '').strip()[:100], str(data.get('taskType') or 'text').strip()[:30], str(data.get('objective') or '').strip(), str(data.get('instructions') or '').strip(), str(data.get('hint') or '').strip(), json.dumps(data.get('options') or []), json.dumps(data.get('verification') or {}), int(bool(data.get('isArchived'))))
                if not values[0] or not values[1] or not values[4] or not values[5]: return jsonify({'message': 'Slug, title, objective, and instructions are required.'}), 400
                if task_id:
                    cur.execute('''UPDATE practical_tasks SET slug=%s,title=%s,category=%s,task_type=%s,objective=%s,instructions=%s,hint=%s,options_json=%s,verification_json=%s,is_archived=%s WHERE id=%s''', (*values, task_id))
                else:
                    cur.execute('''INSERT INTO practical_tasks (slug,title,category,task_type,objective,instructions,hint,options_json,verification_json,is_archived) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''', values)
                    task_id = cur.lastrowid
                conn.commit(); return jsonify({'id': task_id})
        finally: return_connection(conn)

    @app.delete('/api/admin/practical-tasks/<int:task_id>')
    def admin_practical_task_archive(task_id):
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                ensure_tables(cur)
                if not admin_allowed(conn): return jsonify({'message': 'Admin access required.'}), 403
                cur.execute('UPDATE practical_tasks SET is_archived=1 WHERE id=%s', (task_id,)); conn.commit()
                return jsonify({'archived': True})
        finally: return_connection(conn)

    return ensure_tables
