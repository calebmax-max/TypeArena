import unittest
from datetime import datetime, timedelta, timezone

from flask import Flask, request

from certification_features import (
    CERTIFICATION_DURATION_SECONDS,
    CERTIFICATION_MIN_ACCURACY,
    CERTIFICATION_MIN_CHARACTERS,
    CERTIFICATION_MIN_WPM,
    DEFAULT_CERTIFICATION_PASSAGE,
    register_certification_routes,
)


class CertificationCursor:
    def __init__(self, connection):
        self.connection = connection
        self.row = None
        self.rows = []

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback):
        return False

    def execute(self, query, parameters=()):
        normalized = ' '.join(query.split()).lower()
        self.row = None
        self.rows = []
        if normalized.startswith('select id from users'):
            self.row = {'id': 7}
        elif normalized.startswith('select passage from certification_settings'):
            self.row = {'passage': self.connection.passage}
        elif normalized.startswith('select started_at from certification_attempts'):
            eligible = [
                attempt for attempt in self.connection.attempts
                if attempt['user_id'] == parameters[0]
                and attempt['started_at'] >= self.connection.now - timedelta(days=30)
            ]
            if eligible:
                self.row = {'started_at': eligible[-1]['started_at']}
        elif normalized.startswith('insert into certification_attempts'):
            attempt_code, user_id, target_text, token_hash = parameters
            self.connection.attempts.append({
                'id': len(self.connection.attempts) + 1,
                'attempt_code': attempt_code,
                'user_id': user_id,
                'status': 'in_progress',
                'target_text': target_text,
                'race_token_hash': token_hash,
                'started_at': self.connection.now,
                'submitted_at': None,
                'issued_at': None,
                'reviewed_at': None,
                'reviewed_by': None,
                'certificate_code': None,
                'player_name': None,
                'wpm': None,
                'accuracy': None,
                'total_characters': None,
                'anti_cheat_flags': None,
            })
        elif normalized.startswith('insert into certification_settings'):
            self.connection.passage = parameters[0]
        elif normalized.startswith('select passage, updated_at from certification_settings'):
            self.row = {'passage': self.connection.passage, 'updated_at': self.connection.now}
        elif normalized.startswith('select * from certification_attempts'):
            code = parameters[0]
            attempt = next(
                (item for item in self.connection.attempts if item['attempt_code'] == code),
                None,
            )
            if attempt and (
                'and user_id=%s' not in normalized or attempt['user_id'] == parameters[1]
            ) and (
                "status='flagged'" not in normalized or attempt['status'] == 'flagged'
            ):
                self.row = dict(attempt)
        elif normalized.startswith('update certification_attempts'):
            if "status='flagged'" in normalized:
                status, certificate_code, player_name, issued_status, reviewed_by, attempt_id = parameters
                attempt = self.connection.attempts[attempt_id - 1]
                if attempt['status'] == 'flagged':
                    attempt.update({
                        'status': status,
                        'certificate_code': certificate_code,
                        'player_name': player_name,
                        'issued_at': self.connection.now if issued_status == 'review_approved' else None,
                        'reviewed_at': self.connection.now,
                        'reviewed_by': reviewed_by,
                    })
            else:
                (
                    status, wpm, accuracy, total_characters, flags, certificate_code,
                    player_name, issued_status, attempt_id,
                ) = parameters
                attempt = self.connection.attempts[attempt_id - 1]
                attempt.update({
                    'status': status,
                    'wpm': wpm,
                    'accuracy': accuracy,
                    'total_characters': total_characters,
                    'anti_cheat_flags': flags,
                    'certificate_code': certificate_code,
                    'player_name': player_name,
                    'submitted_at': self.connection.now,
                    'issued_at': self.connection.now if issued_status == 'passed' else None,
                })
        elif normalized.startswith('select certificate_code, player_name'):
            certificate_code = parameters[0]
            attempt = next(
                (
                    item for item in self.connection.attempts
                    if item['certificate_code'] == certificate_code
                    and item['status'] in {'passed', 'review_approved'}
                ),
                None,
            )
            if attempt:
                self.row = {
                    'certificate_code': attempt['certificate_code'],
                    'player_name': attempt['player_name'],
                    'wpm': attempt['wpm'],
                    'accuracy': attempt['accuracy'],
                    'issued_at': attempt['issued_at'],
                }
        elif normalized.startswith('select a.*, u.username'):
            if parameters:
                self.rows = [
                    {**item, 'username': 'test-player'}
                    for item in self.connection.attempts
                    if item['status'] == parameters[0]
                ]
            else:
                self.rows = [
                    {**item, 'username': 'test-player'}
                    for item in self.connection.attempts
                    if item['status'] != 'in_progress'
                ]

    def fetchone(self):
        return self.row

    def fetchall(self):
        return list(self.rows)


class CertificationConnection:
    def __init__(self):
        self.now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.attempts = []
        self.passage = DEFAULT_CERTIFICATION_PASSAGE
        self.user = {'id': 7, 'username': 'test-player', 'email': 'player@example.test'}
        self.admin = {'id': 1, 'username': 'reviewer', 'email': 'admin@example.test'}
        self.evaluation_flags = []

    def cursor(self):
        return CertificationCursor(self)

    def commit(self):
        pass


class CertificationFeatureTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.connection = CertificationConnection()

        def get_user(_conn):
            return self.connection.admin if request.headers.get('X-Admin') else self.connection.user

        def issue_token(**kwargs):
            self.issued_passage = kwargs['target_text']
            return {
                'token': 'signed-certification-token',
                'serverStartTs': datetime.now(timezone.utc).timestamp(),
            }

        def verify_token(token, **_kwargs):
            if token != 'signed-certification-token':
                raise ValueError('Invalid race token.')
            return {
                'mode': 'certification',
                'dl': CERTIFICATION_DURATION_SECONDS,
                'ts': datetime.now(timezone.utc).timestamp() - CERTIFICATION_DURATION_SECONDS,
            }

        def evaluate(**kwargs):
            self.connection.evaluated_target = kwargs['target_text']
            return {
                'wpm': 45.0,
                'accuracy': 98.2,
                'flags': list(self.connection.evaluation_flags),
            }

        def score(target, typed):
            self.connection.scored_target = target
            return {'totalCharacters': len(typed), 'accuracy': 98.2}

        register_certification_routes(
            self.app,
            get_connection=lambda: self.connection,
            return_connection=lambda _conn: None,
            get_user=get_user,
            is_admin_email=lambda email: email == 'admin@example.test',
            issue_race_token=issue_token,
            verify_race_token=verify_token,
            evaluate_race_submission=evaluate,
            score_typed_text=score,
        )
        self.client = self.app.test_client()

    def start_attempt(self):
        response = self.client.post('/api/certifications/start')
        self.assertEqual(response.status_code, 201)
        return response.json

    def submit_attempt(self, challenge, *, typed_characters=CERTIFICATION_MIN_CHARACTERS):
        return self.client.post(
            f"/api/certifications/{challenge['attemptId']}/submit",
            json={
                'raceToken': challenge['raceToken'],
                'typedText': 'a' * typed_characters,
                'keystrokeLog': [{'t': 0, 'ch': 'a'}],
                'blurEvents': [],
                'pasteAttempted': False,
            },
        )

    def test_start_issues_fixed_three_minute_passage_and_enforces_cooldown(self):
        challenge = self.start_attempt()
        self.assertEqual(challenge['durationSeconds'], CERTIFICATION_DURATION_SECONDS)
        self.assertGreaterEqual(len(challenge['passage']), CERTIFICATION_MIN_CHARACTERS)
        self.assertEqual(challenge['minimumWpm'], CERTIFICATION_MIN_WPM)
        self.assertEqual(challenge['minimumAccuracy'], CERTIFICATION_MIN_ACCURACY)
        self.assertEqual(challenge['passage'], self.connection.passage)
        self.assertEqual(self.issued_passage, self.connection.passage)

        blocked = self.client.post('/api/certifications/start')
        self.assertEqual(blocked.status_code, 429)
        self.assertIn('retryAt', blocked.json)

    def test_passed_attempt_issues_minimal_public_certificate(self):
        challenge = self.start_attempt()
        submitted = self.submit_attempt(challenge)
        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(submitted.json['status'], 'passed')
        self.assertTrue(submitted.json['certificateId'].startswith('TA-'))

        verification = self.client.get(
            f"/api/certificates/verify/{submitted.json['certificateId'].lower()}"
        )
        self.assertEqual(verification.status_code, 200)
        self.assertEqual(verification.json['status'], 'valid')
        self.assertEqual(verification.json['playerName'], 'test-player')
        self.assertNotIn('email', verification.json)
        self.assertNotIn('userId', verification.json)

    def test_anticheat_flag_holds_certificate_for_admin_review(self):
        self.connection.evaluation_flags = ['window_blur_during_race']
        challenge = self.start_attempt()
        submitted = self.submit_attempt(challenge)
        self.assertEqual(submitted.json['status'], 'flagged')
        self.assertIsNone(submitted.json['certificateId'])

        review_queue = self.client.get('/api/admin/certifications/attempts?status=flagged', headers={'X-Admin': '1'})
        self.assertEqual(len(review_queue.json['attempts']), 1)

        review = self.client.post(
            f"/api/admin/certifications/attempts/{challenge['attemptId']}/review",
            json={'decision': 'approve'},
            headers={'X-Admin': '1'},
        )
        self.assertEqual(review.status_code, 200)
        self.assertEqual(review.json['status'], 'review_approved')
        verification = self.client.get(
            f"/api/certificates/verify/{review.json['certificateId']}"
        )
        self.assertEqual(verification.status_code, 200)

    def test_attempt_below_minimum_character_count_fails(self):
        challenge = self.start_attempt()
        submitted = self.submit_attempt(
            challenge,
            typed_characters=CERTIFICATION_MIN_CHARACTERS - 1,
        )
        self.assertEqual(submitted.json['status'], 'failed')
        self.assertIsNone(submitted.json['certificateId'])

    def test_admin_can_read_and_update_passage_used_by_new_attempts(self):
        loaded = self.client.get(
            '/api/admin/certifications/settings',
            headers={'X-Admin': '1'},
        )
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.json['passage'], DEFAULT_CERTIFICATION_PASSAGE)

        new_passage = 'Admin-authored certification text. ' * 30
        saved = self.client.put(
            '/api/admin/certifications/settings',
            json={'passage': new_passage},
            headers={'X-Admin': '1'},
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(self.connection.passage, new_passage.strip())

        challenge = self.start_attempt()
        self.assertEqual(challenge['passage'], new_passage.strip())

    def test_existing_attempt_keeps_its_passage_after_admin_edits_configuration(self):
        challenge = self.start_attempt()
        original_passage = challenge['passage']
        self.client.put(
            '/api/admin/certifications/settings',
            json={'passage': 'Updated passage for future attempts. ' * 30},
            headers={'X-Admin': '1'},
        )

        submitted = self.submit_attempt(challenge)

        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(self.connection.evaluated_target, original_passage)
        self.assertEqual(self.connection.scored_target, original_passage)

    def test_admin_passage_update_validates_length_and_access(self):
        too_short = self.client.put(
            '/api/admin/certifications/settings',
            json={'passage': 'too short'},
            headers={'X-Admin': '1'},
        )
        unauthorized = self.client.put(
            '/api/admin/certifications/settings',
            json={'passage': 'A' * CERTIFICATION_MIN_CHARACTERS},
        )
        self.assertEqual(too_short.status_code, 400)
        self.assertEqual(unauthorized.status_code, 401)


if __name__ == '__main__':
    unittest.main()
