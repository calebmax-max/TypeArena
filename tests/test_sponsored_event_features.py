import hashlib
import unittest
from datetime import datetime, timedelta

from sponsored_event_features import (
    complete_sponsored_event_attempt,
    record_sponsored_event_attempt,
    validate_event_payload,
)


def event_payload():
    return {
        'name': 'TypeArena Speed Challenge',
        'sponsorName': 'Example Sponsor',
        'startsAt': '2030-01-01T00:00:00Z',
        'endsAt': '2030-01-08T00:00:00Z',
        'eligibility': 'Signed-in players only.',
        'rules': 'Only verified races count.',
        'fundingPledged': 1500,
        'fundingReceived': 500,
        'prizes': [
            {'description': 'First prize', 'value': 1000},
            {'description': 'Second prize', 'value': 300},
            {'description': 'Third prize', 'value': 200},
        ],
    }


class AttemptCursor:
    def __init__(self, ends_at):
        self.ends_at = ends_at
        self.statements = []
        self.rows = []

    def execute(self, query, params):
        self.statements.append((query, params))
        if 'SELECT a.tournament_id, se.ends_at' in query:
            self.rows = [{'tournament_id': 7, 'ends_at': self.ends_at}]

    def fetchall(self):
        return self.rows


class EventStartCursor:
    def __init__(self, eligible=True):
        self.eligible = eligible
        self.statements = []

    def execute(self, query, params):
        self.statements.append((query, params))

    def fetchone(self):
        return {'tournament_id': 42} if self.eligible else None


class SponsoredEventFeatureTests(unittest.TestCase):
    def test_payload_accepts_free_entry_prize_details(self):
        event = validate_event_payload(event_payload())

        self.assertEqual(event['sponsorName'], 'Example Sponsor')
        self.assertEqual([prize['place'] for prize in event['prizes']], [1, 2, 3])
        self.assertEqual(event['fundingReceived'], 500)

    def test_payload_rejects_received_funding_above_pledge(self):
        payload = event_payload()
        payload['fundingReceived'] = 1501

        with self.assertRaisesRegex(ValueError, 'received funding cannot exceed'):
            validate_event_payload(payload)

    def test_payload_rejects_non_finite_funding_and_prize_values(self):
        payload = event_payload()
        payload['fundingPledged'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'Funding amounts'):
            validate_event_payload(payload)

        payload = event_payload()
        payload['prizes'][0]['value'] = float('inf')
        with self.assertRaisesRegex(ValueError, 'Prize values'):
            validate_event_payload(payload)

    def test_payload_rejects_non_http_sponsor_links(self):
        payload = event_payload()
        payload['sponsorLink'] = 'javascript:alert(1)'

        with self.assertRaisesRegex(ValueError, 'HTTP or HTTPS'):
            validate_event_payload(payload)

    def test_only_verified_races_completed_before_close_are_scored(self):
        active_event = AttemptCursor(datetime.utcnow() + timedelta(days=1))
        complete_sponsored_event_attempt(
            active_event,
            user_id=9,
            race_token='race-token',
            race_code='race-1',
            wpm=72.345,
            verified=True,
        )
        completed_update = active_event.statements[-1]
        self.assertIn("SET status='completed'", completed_update[0])
        self.assertEqual(completed_update[1], ('race-1', 72.34, 7, 9, hashlib.sha256(b'race-token').hexdigest()))

        closed_event = AttemptCursor(datetime.utcnow() - timedelta(seconds=1))
        complete_sponsored_event_attempt(
            closed_event,
            user_id=9,
            race_token='late-race-token',
            race_code='race-2',
            wpm=85,
            verified=True,
        )
        self.assertIn("SET status='rejected'", closed_event.statements[-1][0])

    def test_unverified_races_are_rejected(self):
        cursor = AttemptCursor(datetime.utcnow() + timedelta(days=1))

        complete_sponsored_event_attempt(
            cursor,
            user_id=9,
            race_token='flagged-token',
            race_code='race-3',
            wpm=200,
            verified=False,
        )

        self.assertIn("SET status='rejected'", cursor.statements[-1][0])

    def test_event_race_is_scoped_to_an_active_entered_event(self):
        cursor = EventStartCursor()

        record_sponsored_event_attempt(
            cursor,
            user_id=9,
            race_token='event-token',
            event_id=42,
        )

        self.assertEqual(len(cursor.statements), 2)
        self.assertIn('se.tournament_id=%s AND ee.user_id=%s', cursor.statements[0][0])
        self.assertEqual(cursor.statements[0][1], (42, 9))
        self.assertIn('INSERT IGNORE INTO sponsored_event_attempts', cursor.statements[1][0])
        self.assertEqual(cursor.statements[1][1][0:2], (42, 9))

    def test_event_race_rejects_users_who_are_not_active_entrants(self):
        cursor = EventStartCursor(eligible=False)

        with self.assertRaisesRegex(ValueError, 'Join this sponsored event'):
            record_sponsored_event_attempt(
                cursor,
                user_id=9,
                race_token='unjoined-token',
                event_id=42,
            )

        self.assertEqual(len(cursor.statements), 1)


if __name__ == '__main__':
    unittest.main()
