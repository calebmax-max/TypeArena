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


def register_practical_task_routes(app, *, get_connection, return_connection, get_user):
    def ensure_tables(cur):
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

    def evaluate(task, response):
        if task['slug'] == 'phishing-awareness':
            passed = response.get('answer') == 'report'
        elif task['slug'] == 'professional-email':
            subject = str(response.get('subject') or '').strip()
            body = str(response.get('body') or '').strip().lower()
            passed = bool(subject) and len(body) >= 40 and any(word in body for word in ('hello', 'dear', 'hi ')) and any(word in body for word in ('regards', 'thank you', 'thanks', 'sincerely'))
        elif task['slug'] == 'spreadsheet-data-entry':
            body = str(response.get('text') or '').lower()
            passed = all(name in body for name in ('amina otieno', 'brian kamau', 'carol wanjiku')) and all(amount in body for amount in ('1250', '890', '2100')) and body.count('\n') >= 2
        else:
            body = str(response.get('text') or '').lower()
            passed = all(word in body for word in ('incoming', 'working', 'approved', 'archive')) and any(word in body for word in ('date', 'version', 'name'))
        return 100 if passed else 0, passed

    @app.get('/api/practical-tasks')
    def practical_tasks():
        return jsonify({'tasks': TASKS})

    @app.post('/api/practical-tasks/<slug>/submit')
    def submit_practical_task(slug):
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Sign in to save practical task evidence.'}), 401
            task = _task_by_slug(slug)
            if not task:
                return jsonify({'message': 'Practical task not found.'}), 404
            response = request.get_json(silent=True) or {}
            score, passed = evaluate(task, response)
            with conn.cursor() as cur:
                ensure_tables(cur)
                cur.execute('INSERT INTO practical_task_attempts (user_id,task_slug,response_json,score,passed) VALUES (%s,%s,%s,%s,%s)', (user['id'], slug, json.dumps(response)[:12000], score, int(passed)))
                conn.commit()
                return jsonify({'taskSlug': slug, 'score': score, 'passed': passed, 'message': 'Task evidence recorded.' if passed else 'Not quite yet. Review the task guidance and try again.'})
        finally:
            return_connection(conn)

    return ensure_tables
