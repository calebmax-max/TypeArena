import unittest
from datetime import timedelta

from flask import Flask

from foundation_features import (
    has_entitlement,
    normalize_subscription_plan_key,
    per_key_error_counts,
    register_foundation_routes,
    resolve_entitlements,
)


class FakeCursor:
    def __init__(self, connection):
        self.connection = connection
        self.row = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def execute(self, query, parameters=()):
        normalized = ' '.join(query.split()).lower()
        if normalized.startswith('select p.*, s.billing_period_days'):
            self.row = dict(self.connection.payment)
        elif normalized.startswith('select id from subscription_payments'):
            self.row = (
                {'id': 99}
                if self.connection.receipt_number == parameters[0]
                else None
            )
        elif normalized.startswith('select id from users'):
            self.row = {'id': 7}
        elif normalized.startswith('select expires_at from subscriptions'):
            self.row = None
        elif normalized.startswith('update subscriptions'):
            self.connection.subscription_status = 'active' if "status='active'" in normalized else 'failed'
            if self.connection.subscription_status == 'active':
                self.connection.subscription_start = parameters[0]
                self.connection.subscription_expiry = parameters[1]
        elif normalized.startswith('update subscription_payments'):
            if "status='completed'" in normalized:
                self.connection.payment['status'] = 'completed'
                self.connection.receipt_number = parameters[0]
            else:
                self.connection.payment['status'] = 'failed'
        else:
            self.row = None

    def fetchone(self):
        return self.row


class FakeConnection:
    def __init__(self):
        self.payment = {
            'id': 11,
            'subscription_id': 13,
            'user_id': 7,
            'status': 'pending',
            'amount': 100,
            'billing_period_days': 30,
        }
        self.subscription_status = 'pending'
        self.subscription_start = None
        self.subscription_expiry = None
        self.receipt_number = None
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class FoundationFeatureTests(unittest.TestCase):
    def test_subscription_plan_keys_support_monthly_and_annual_pro(self):
        self.assertEqual(normalize_subscription_plan_key('monthly'), 'pro_monthly')
        self.assertEqual(normalize_subscription_plan_key('annual'), 'pro_annual')
        self.assertEqual(normalize_subscription_plan_key('pro'), 'pro')
        self.assertEqual(normalize_subscription_plan_key('pro-annual'), 'pro_annual')

    def test_per_key_errors_group_case_insensitive_expected_keys(self):
        self.assertEqual(
            per_key_error_counts('AaB', 'xbx!'),
            {'a': 2, 'b': 1, '!': 1},
        )

    def test_per_key_errors_ignore_untyped_target_characters(self):
        self.assertEqual(per_key_error_counts('abcdef', 'abc'), {})

    def test_pro_entitlement_requires_an_active_subscription(self):
        self.assertFalse(has_entitlement('pro', False, 'pro'))
        self.assertTrue(has_entitlement('free', True, 'pro'))

    def test_role_entitlements_preserve_employer_and_admin_access(self):
        self.assertTrue(has_entitlement('employer', False, 'employer'))
        self.assertFalse(has_entitlement('employer', False, 'pro'))
        self.assertTrue(has_entitlement('admin', False, 'any_feature'))
        self.assertEqual(
            resolve_entitlements('admin', False),
            {'free': True, 'pro': True, 'employer': True},
        )

    def test_successful_mpesa_callback_activates_once_and_is_idempotent(self):
        app = Flask(__name__)
        connection = FakeConnection()
        register_foundation_routes(
            app,
            get_connection=lambda: connection,
            return_connection=lambda conn: None,
            get_user=lambda conn: None,
            mpesa_stk_push=lambda **kwargs: {},
            normalize_mpesa_phone=lambda phone: phone,
            mpesa_callback_url='https://example.test/callback',
            is_admin_email=lambda email: False,
            admin_email='',
        )
        callback = {
            'Body': {
                'stkCallback': {
                    'CheckoutRequestID': 'checkout-1',
                    'ResultCode': 0,
                    'ResultDesc': 'Success',
                    'CallbackMetadata': {
                        'Item': [
                            {'Name': 'Amount', 'Value': 100},
                            {'Name': 'MpesaReceiptNumber', 'Value': 'receipt-1'},
                        ]
                    },
                }
            }
        }
        with app.test_client() as client:
            first = client.post('/api/mpesa/callback/subscription', json=callback)
            first_expiry = connection.subscription_expiry
            second = client.post('/api/mpesa/callback/subscription', json=callback)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(connection.payment['status'], 'completed')
        self.assertEqual(connection.subscription_status, 'active')
        self.assertEqual(connection.receipt_number, 'receipt-1')
        self.assertEqual(connection.subscription_expiry, first_expiry)
        self.assertEqual(
            first_expiry - connection.subscription_start,
            timedelta(days=30),
        )

    def test_mpesa_callback_amount_mismatch_does_not_activate_subscription(self):
        app = Flask(__name__)
        connection = FakeConnection()
        register_foundation_routes(
            app,
            get_connection=lambda: connection,
            return_connection=lambda conn: None,
            get_user=lambda conn: None,
            mpesa_stk_push=lambda **kwargs: {},
            normalize_mpesa_phone=lambda phone: phone,
            mpesa_callback_url='https://example.test/callback',
            is_admin_email=lambda email: False,
            admin_email='',
        )
        callback = {
            'Body': {
                'stkCallback': {
                    'CheckoutRequestID': 'checkout-1',
                    'ResultCode': 0,
                    'CallbackMetadata': {
                        'Item': [
                            {'Name': 'Amount', 'Value': 101},
                            {'Name': 'MpesaReceiptNumber', 'Value': 'receipt-1'},
                        ]
                    },
                }
            }
        }
        with app.test_client() as client:
            response = client.post('/api/mpesa/callback/subscription', json=callback)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(connection.payment['status'], 'failed')
        self.assertEqual(connection.subscription_status, 'failed')
        self.assertIsNone(connection.subscription_expiry)


if __name__ == '__main__':
    unittest.main()
