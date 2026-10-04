import unittest
from datetime import date, timedelta

from flask import Flask
from progression_features import (
    PROGRESSION_REWARD_DEFAULTS,
    award_race_progress,
    level_for_xp,
    register_progression_routes,
    xp_required_for_level,
)


class ProgressionCursor:
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
        if normalized.startswith('select xp, level, current_streak'):
            self.row = dict(self.connection.user)
        elif normalized.startswith('select race_code, wpm'):
            self.row = (
                {'race_code': parameters[0], 'wpm': 50}
                if parameters[1] == 7 and parameters[0] == 'race-api'
                else None
            )
        elif normalized.startswith('select max(wpm)'):
            self.row = {'best_wpm': None}
        elif normalized.startswith('select id from xp_transactions'):
            self.row = next((
                {'id': index + 1}
                for index, txn in enumerate(self.connection.xp_transactions)
                if txn['user_id'] == parameters[0]
                and txn['reference_code'] == parameters[1]
                and txn['reason'] == 'race_completed'
            ), None)
        elif normalized.startswith('select setting_key, amount'):
            self.rows = [
                {'setting_key': key, 'amount': amount}
                for key, amount in self.connection.rewards.items()
            ]
        elif normalized.startswith('insert into xp_transactions'):
            user_id, amount, reason, reference_code = parameters
            self.connection.xp_transactions.append({
                'user_id': user_id,
                'amount': amount,
                'reason': reason,
                'reference_code': reference_code,
            })
        elif normalized.startswith('insert into streak_freeze_transactions'):
            if "'streak_protection'" in normalized:
                user_id, amount, reference_code = parameters
                reason = 'streak_protection'
            else:
                user_id, reference_code = parameters
                amount = 1
                reason = 'level_reward'
            self.connection.freeze_transactions.append({
                'user_id': user_id,
                'amount': amount,
                'reason': reason,
                'reference_code': reference_code,
            })
        elif normalized.startswith('update users'):
            (
                self.connection.user['xp'],
                self.connection.user['level'],
                self.connection.user['current_streak'],
                self.connection.user['longest_streak'],
                _,
                _,
                self.connection.user['streak_freezes'],
                _,
            ) = parameters
            self.connection.user['last_play_date'] = parameters[5]

    def fetchone(self):
        return self.row

    def fetchall(self):
        return list(self.rows)


class ProgressionConnection:
    def __init__(self, **overrides):
        self.user = {
            'xp': 0,
            'level': 1,
            'current_streak': 0,
            'longest_streak': 0,
            'last_play_date': None,
            'streak_freezes': 0,
        }
        self.user.update(overrides)
        self.rewards = dict(PROGRESSION_REWARD_DEFAULTS)
        self.xp_transactions = []
        self.freeze_transactions = []

    def cursor(self):
        return ProgressionCursor(self)

    def commit(self):
        pass


class ProgressionFeatureTests(unittest.TestCase):
    def test_race_award_endpoint_only_awards_a_users_recorded_race_once(self):
        app = Flask(__name__)
        connection = ProgressionConnection()
        register_progression_routes(
            app,
            get_connection=lambda: connection,
            return_connection=lambda conn: None,
            get_user=lambda conn: {'id': 7, 'email': 'player@example.test'},
            is_admin_email=lambda email: False,
        )
        with app.test_client() as client:
            first = client.post('/api/progression/races/race-api/award')
            second = client.post('/api/progression/races/race-api/award')
            missing = client.post('/api/progression/races/not-owned/award')

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json['xpEarned'], 75)
        self.assertEqual(second.json['xpEarned'], 0)
        self.assertEqual(missing.status_code, 404)

    def test_level_thresholds_match_the_increasing_cost_curve(self):
        self.assertEqual([xp_required_for_level(level) for level in range(1, 5)], [0, 500, 1100, 1800])
        self.assertEqual(level_for_xp(499), 1)
        self.assertEqual(level_for_xp(500), 2)
        self.assertEqual(level_for_xp(1100), 3)

    def test_race_award_includes_personal_best_and_is_idempotent(self):
        connection = ProgressionConnection()
        today = date(2026, 10, 4)

        with connection.cursor() as cursor:
            first = award_race_progress(
                cursor,
                user_id=7,
                race_code='race-1',
                personal_best=True,
                today=today,
            )
        with connection.cursor() as cursor:
            duplicate = award_race_progress(
                cursor,
                user_id=7,
                race_code='race-1',
                personal_best=True,
                today=today,
            )

        self.assertEqual(first['xp'], 75)
        self.assertEqual(first['xpEarned'], 75)
        self.assertEqual(first['currentStreak'], 1)
        self.assertEqual(first['longestStreak'], 1)
        self.assertEqual(duplicate['xp'], 75)
        self.assertEqual(duplicate['xpEarned'], 0)
        self.assertEqual(len(connection.xp_transactions), 2)

    def test_third_consecutive_play_day_awards_configured_streak_bonus(self):
        connection = ProgressionConnection(
            xp=100,
            level=1,
            current_streak=2,
            longest_streak=2,
            last_play_date=date(2026, 10, 2),
        )
        with connection.cursor() as cursor:
            result = award_race_progress(
                cursor,
                user_id=7,
                race_code='race-day-3',
                personal_best=False,
                today=date(2026, 10, 3),
            )

        self.assertEqual(result['currentStreak'], 3)
        self.assertEqual(result['xpEarned'], 100)
        self.assertEqual(result['xp'], 200)
        self.assertIn('streak_3_days', [txn['reason'] for txn in connection.xp_transactions])

    def test_freeze_preserves_streak_only_when_it_covers_full_gap(self):
        last_day = date(2026, 10, 1)
        protected = ProgressionConnection(
            current_streak=4,
            longest_streak=4,
            last_play_date=last_day,
            streak_freezes=2,
        )
        with protected.cursor() as cursor:
            result = award_race_progress(
                cursor,
                user_id=7,
                race_code='protected-gap',
                personal_best=False,
                today=last_day + timedelta(days=3),
            )
        self.assertEqual(result['currentStreak'], 7)
        self.assertEqual(result['streakFreezes'], 0)
        self.assertEqual(protected.freeze_transactions[0]['amount'], -2)

        insufficient = ProgressionConnection(
            current_streak=4,
            longest_streak=4,
            last_play_date=last_day,
            streak_freezes=1,
        )
        with insufficient.cursor() as cursor:
            reset = award_race_progress(
                cursor,
                user_id=7,
                race_code='unprotected-gap',
                personal_best=False,
                today=last_day + timedelta(days=3),
            )
        self.assertEqual(reset['currentStreak'], 1)
        self.assertEqual(reset['streakFreezes'], 1)
        self.assertEqual(insufficient.freeze_transactions, [])

    def test_every_fifth_level_grants_a_freeze_up_to_cap(self):
        connection = ProgressionConnection()
        connection.rewards['race_completed'] = 2600
        connection.rewards['personal_best'] = 0
        with connection.cursor() as cursor:
            result = award_race_progress(
                cursor,
                user_id=7,
                race_code='level-five',
                personal_best=True,
                today=date(2026, 10, 4),
            )

        self.assertEqual(result['level'], 5)
        self.assertEqual(result['streakFreezes'], 1)
        self.assertEqual(connection.freeze_transactions[0]['reason'], 'level_reward')


if __name__ == '__main__':
    unittest.main()
