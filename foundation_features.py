from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Dict, Optional

from flask import Flask, jsonify, request


ACCOUNT_ROLES = {'free', 'pro', 'employer', 'admin'}
ENTITLEMENTS = {'free', 'pro', 'employer'}
PRO_PLAN_KEYS = ('pro_monthly', 'pro_annual', 'pro')


def normalize_subscription_plan_key(plan_key: Optional[str]) -> str:
    value = str(plan_key or '').strip().lower().replace('-', '_')
    aliases = {
        'pro': 'pro',
        'monthly': 'pro_monthly',
        'monthly_pro': 'pro_monthly',
        'pro_monthly': 'pro_monthly',
        'annual': 'pro_annual',
        'yearly': 'pro_annual',
        'annual_pro': 'pro_annual',
        'pro_annual': 'pro_annual',
    }
    return aliases.get(value, value if value in PRO_PLAN_KEYS else 'pro_monthly')


def per_key_error_counts(target_text: str, typed_text: str) -> Dict[str, int]:
    errors: Dict[str, int] = {}
    for index, typed_char in enumerate(typed_text):
        if index >= len(target_text):
            key = typed_char.casefold()
            errors[key] = errors.get(key, 0) + 1
            continue
        expected_char = target_text[index]
        if typed_char != expected_char:
            key = expected_char.casefold()
            errors[key] = errors.get(key, 0) + 1
    return errors


def resolve_entitlements(account_role: str, has_active_pro: bool) -> Dict[str, bool]:
    role = account_role if account_role in ACCOUNT_ROLES else 'free'
    if role == 'admin':
        return {key: True for key in ENTITLEMENTS}
    return {
        'free': True,
        'pro': has_active_pro,
        'employer': role == 'employer',
    }


def has_entitlement(account_role: str, has_active_pro: bool, entitlement: str) -> bool:
    if account_role == 'admin':
        return True
    return resolve_entitlements(account_role, has_active_pro).get(entitlement, False)


def ensure_foundation_schema(cur, admin_email: str = '') -> None:
    cur.execute("SHOW COLUMNS FROM users LIKE 'account_role'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE users ADD COLUMN account_role VARCHAR(24) NOT NULL DEFAULT 'free' AFTER balance"
        )
    cur.execute("SHOW COLUMNS FROM users LIKE 'account_plan'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE users ADD COLUMN account_plan VARCHAR(40) NOT NULL DEFAULT 'free' AFTER account_role"
        )
    cur.execute("SHOW COLUMNS FROM race_history LIKE 'key_errors'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE race_history ADD COLUMN key_errors TEXT NULL AFTER race_timestamp")

    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS subscription_plans (
            plan_key VARCHAR(40) PRIMARY KEY,
            display_name VARCHAR(80) NOT NULL,
            amount DECIMAL(12,2) NULL,
            currency CHAR(3) NOT NULL DEFAULT 'KES',
            billing_period_days INT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        INSERT IGNORE INTO subscription_plans
            (plan_key, display_name, amount, billing_period_days, is_active)
        VALUES
            ('pro_monthly', 'Pro Monthly', 199.00, 30, 1),
            ('pro_annual', 'Pro Annual', 1499.00, 365, 1),
            ('pro', 'Pro', 199.00, 30, 1)
        '''
    )
    cur.execute(
        '''
        UPDATE subscription_plans
        SET amount = CASE plan_key
            WHEN 'pro_monthly' THEN 199.00
            WHEN 'pro_annual' THEN 1499.00
            WHEN 'pro' THEN 199.00
            ELSE amount
        END,
            billing_period_days = CASE plan_key
            WHEN 'pro_monthly' THEN 30
            WHEN 'pro_annual' THEN 365
            WHEN 'pro' THEN 30
            ELSE billing_period_days
        END,
            is_active = CASE plan_key
            WHEN 'pro_monthly' THEN 1
            WHEN 'pro_annual' THEN 1
            WHEN 'pro' THEN 1
            ELSE is_active
        END
        WHERE plan_key IN ('pro_monthly', 'pro_annual', 'pro')
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS subscriptions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            plan_key VARCHAR(40) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            currency CHAR(3) NOT NULL,
            billing_period_days INT NOT NULL,
            status ENUM('pending','active','expired','cancelled','failed') NOT NULL DEFAULT 'pending',
            starts_at DATETIME NULL,
            expires_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_subscriptions_user_status_expiry (user_id, status, expires_at),
            CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_key) REFERENCES subscription_plans(plan_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS subscription_payments (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tx_code VARCHAR(80) NOT NULL UNIQUE,
            subscription_id BIGINT NOT NULL,
            user_id INT NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            currency CHAR(3) NOT NULL,
            status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
            checkout_request_id VARCHAR(120) NULL UNIQUE,
            merchant_request_id VARCHAR(120) NULL,
            mpesa_receipt_number VARCHAR(120) NULL,
            result_code VARCHAR(20) NULL,
            result_desc VARCHAR(255) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME NULL,
            failed_at DATETIME NULL,
            UNIQUE KEY uq_subscription_payment_receipt (mpesa_receipt_number),
            KEY idx_subscription_payments_user_created (user_id, created_at),
            CONSTRAINT fk_subscription_payments_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
            CONSTRAINT fk_subscription_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )

    normalized_admin_email = str(admin_email or '').strip().lower()
    if normalized_admin_email:
        cur.execute(
            "UPDATE users SET account_role='free' WHERE account_role='admin' AND LOWER(email)<>%s",
            (normalized_admin_email,),
        )
        cur.execute(
            "UPDATE users SET account_role='admin', account_plan='free' WHERE LOWER(email)=%s",
            (normalized_admin_email,),
        )
    else:
        cur.execute("UPDATE users SET account_role='free' WHERE account_role='admin'")


def register_foundation_routes(
    app: Flask,
    *,
    get_connection: Callable[[], Any],
    return_connection: Callable[[Any], None],
    get_user: Callable[[Any], Optional[Dict[str, Any]]],
    mpesa_stk_push: Callable[..., Dict[str, Any]],
    normalize_mpesa_phone: Callable[[str], str],
    mpesa_callback_url: str,
    is_admin_email: Callable[[str], bool],
    admin_email: str,
) -> Callable[..., None]:
    def _admin_user(conn) -> Optional[Dict[str, Any]]:
        user = get_user(conn)
        if not user or not is_admin_email(str(user.get('email') or '')):
            return None
        return user

    def _fetch_pro_status(cur, user_id: int) -> tuple[bool, Optional[Dict[str, Any]]]:
        cur.execute(
            '''
            UPDATE subscriptions
            SET status='expired'
            WHERE user_id=%s AND plan_key IN ('pro', 'pro_monthly', 'pro_annual')
              AND status='active' AND expires_at<=UTC_TIMESTAMP()
            ''',
            (user_id,),
        )
        cur.execute(
            '''
            SELECT id, plan_key, status, starts_at, expires_at
            FROM subscriptions
            WHERE user_id=%s AND plan_key IN ('pro', 'pro_monthly', 'pro_annual') AND status='active'
              AND starts_at<=UTC_TIMESTAMP() AND expires_at>UTC_TIMESTAMP()
            ORDER BY expires_at DESC
            LIMIT 1
            ''',
            (user_id,),
        )
        active = cur.fetchone()
        cur.execute(
            '''
            SELECT id, plan_key, status, starts_at, expires_at
            FROM subscriptions
            WHERE user_id=%s AND plan_key IN ('pro', 'pro_monthly', 'pro_annual')
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            ''',
            (user_id,),
        )
        latest = cur.fetchone()
        return bool(active), active or latest

    @app.get('/api/subscription-plans')
    def subscription_plans():
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT plan_key, display_name, amount, currency, billing_period_days
                    FROM subscription_plans
                    WHERE is_active=1 AND amount IS NOT NULL AND billing_period_days IS NOT NULL
                    ORDER BY CASE plan_key
                        WHEN 'pro_monthly' THEN 0
                        WHEN 'pro_annual' THEN 1
                        WHEN 'pro' THEN 2
                        ELSE 3
                    END, plan_key
                    '''
                )
                plans = cur.fetchall()
            return jsonify([
                {
                    'plan': row['plan_key'],
                    'name': row['display_name'],
                    'amount': float(row['amount']),
                    'currency': row['currency'],
                    'billingPeriodDays': int(row['billing_period_days']),
                }
                for row in plans
            ])
        finally:
            return_connection(conn)

    @app.get('/api/entitlements')
    def account_entitlements():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                active_pro, subscription = _fetch_pro_status(cur, int(user['id']))
                stored_role = str(user.get('account_role') or 'free')
                if is_admin_email(str(user.get('email') or '')):
                    role = 'admin'
                elif stored_role == 'employer':
                    role = 'employer'
                else:
                    role = 'pro' if active_pro else 'free'
                cur.execute(
                    'UPDATE users SET account_role=%s, account_plan=%s WHERE id=%s',
                    (role, 'pro' if active_pro else 'free', user['id']),
                )
                entitlements = resolve_entitlements(role, active_pro)
            conn.commit()
            return jsonify({
                'accountRole': role if role in ACCOUNT_ROLES else 'free',
                'plan': 'pro' if active_pro else 'free',
                'entitlements': entitlements,
                'subscription': _serialize_subscription(subscription),
            })
        finally:
            return_connection(conn)

    @app.get('/api/subscriptions/current')
    def current_subscription():
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                _, subscription = _fetch_pro_status(cur, int(user['id']))
            conn.commit()
            return jsonify({'subscription': _serialize_subscription(subscription)})
        finally:
            return_connection(conn)

    @app.get('/api/subscription-payments/<tx_code>')
    def subscription_payment_status(tx_code: str):
        conn = get_connection()
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT tx_code, status, amount, currency, result_desc, created_at, completed_at
                    FROM subscription_payments
                    WHERE tx_code=%s AND user_id=%s
                    ''',
                    (tx_code, user['id']),
                )
                payment = cur.fetchone()
            if not payment:
                return jsonify({'message': 'Payment not found.'}), 404
            return jsonify({
                'transactionId': payment['tx_code'],
                'status': payment['status'],
                'amount': float(payment['amount']),
                'currency': payment['currency'],
                'message': payment.get('result_desc') or '',
                'createdAt': _iso(payment.get('created_at')),
                'completedAt': _iso(payment.get('completed_at')),
            })
        finally:
            return_connection(conn)

    @app.post('/api/subscriptions/pro/checkout')
    def start_pro_checkout():
        payload = request.get_json(silent=True) or {}
        raw_plan = payload.get('planKey')
        if raw_plan is None:
            raw_plan = payload.get('plan')
        if raw_plan is None:
            raw_plan = payload.get('plan_key')
        requested_plan = normalize_subscription_plan_key(raw_plan if raw_plan is not None else 'pro_monthly')
        raw_phone = str(payload.get('phoneNumber') or payload.get('phone') or '')
        phone_number = normalize_mpesa_phone(raw_phone)
        if len(phone_number) != 12 or not phone_number.startswith('254'):
            return jsonify({'message': 'A valid M-Pesa phone number is required.'}), 400
        if not mpesa_callback_url.lower().startswith('https://'):
            return jsonify({'message': 'M-Pesa subscription callback is not configured.'}), 503

        conn = get_connection()
        payment_id = None
        tx_code = f'pro_{secrets.token_urlsafe(24)}'
        try:
            user = get_user(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                candidates = [requested_plan, 'pro_monthly', 'pro_annual', 'pro']
                unique_candidates = []
                seen = set()
                for candidate in candidates:
                    if candidate not in seen:
                        unique_candidates.append(candidate)
                        seen.add(candidate)
                placeholders = ', '.join(['%s'] * len(unique_candidates))
                cur.execute(
                    f'''
                    SELECT plan_key, display_name, amount, currency, billing_period_days
                    FROM subscription_plans
                    WHERE plan_key IN ({placeholders}) AND is_active=1
                    ORDER BY CASE plan_key
                        WHEN 'pro_monthly' THEN 0
                        WHEN 'pro_annual' THEN 1
                        WHEN 'pro' THEN 2
                        ELSE 3
                    END, plan_key
                    LIMIT 1
                    ''',
                    tuple(unique_candidates),
                )
                plan = cur.fetchone()
                if not plan or plan.get('amount') is None or not plan.get('billing_period_days'):
                    return jsonify({'message': 'The selected Pro plan is not configured for checkout.'}), 503
                amount = Decimal(str(plan['amount']))
                period_days = int(plan['billing_period_days'])
                if (
                    amount <= 0
                    or amount > Decimal('9999999999')
                    or amount != amount.to_integral_value()
                    or period_days < 1
                    or period_days > 3650
                ):
                    app.logger.error('Invalid active Pro subscription configuration: %r', plan)
                    return jsonify({'message': 'The selected Pro plan has invalid billing configuration.'}), 503
                cur.execute(
                    '''
                    INSERT INTO subscriptions
                        (user_id, plan_key, amount, currency, billing_period_days, status)
                    VALUES (%s, %s, %s, %s, %s, 'pending')
                    ''',
                    (user['id'], plan['plan_key'], amount, plan['currency'], period_days),
                )
                subscription_id = cur.lastrowid
                cur.execute(
                    '''
                    INSERT INTO subscription_payments
                        (tx_code, subscription_id, user_id, phone_number, amount, currency, status)
                    VALUES (%s, %s, %s, %s, %s, %s, 'pending')
                    ''',
                    (tx_code, subscription_id, user['id'], phone_number, amount, plan['currency']),
                )
                payment_id = cur.lastrowid
            conn.commit()

            try:
                stk_response = mpesa_stk_push(
                    phone_number=phone_number,
                    amount=float(amount),
                    account_reference=tx_code[:12],
                    description=f"TypeArena {plan['display_name']} subscription",
                    callback_url=mpesa_callback_url,
                )
            except ValueError as exc:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE subscription_payments SET result_desc=%s WHERE id=%s AND status='pending'",
                        (str(exc)[:255], payment_id),
                    )
                conn.commit()
                return jsonify({'message': str(exc), 'transactionId': tx_code}), 502

            checkout_id = str(stk_response.get('CheckoutRequestID') or '').strip()
            if stk_response.get('ResponseCode') != '0' or not checkout_id:
                message = str(
                    stk_response.get('errorMessage')
                    or stk_response.get('ResponseDescription')
                    or 'M-Pesa did not accept the subscription payment request.'
                )
                with conn.cursor() as cur:
                    cur.execute(
                        '''
                        UPDATE subscription_payments
                        SET status='failed', result_desc=%s, failed_at=UTC_TIMESTAMP()
                        WHERE id=%s AND status='pending'
                        ''',
                        (message[:255], payment_id),
                    )
                    cur.execute(
                        "UPDATE subscriptions SET status='failed' WHERE id=%s AND status='pending'",
                        (subscription_id,),
                    )
                conn.commit()
                return jsonify({'message': message}), 502

            with conn.cursor() as cur:
                cur.execute(
                    '''
                    UPDATE subscription_payments
                    SET checkout_request_id=%s, merchant_request_id=%s
                    WHERE id=%s AND status='pending'
                    ''',
                    (
                        checkout_id,
                        str(stk_response.get('MerchantRequestID') or '')[:120] or None,
                        payment_id,
                    ),
                )
            conn.commit()
            return jsonify({
                'message': 'M-Pesa payment prompt sent. Complete the payment on your phone.',
                'status': 'pending',
                'transactionId': tx_code,
                'amount': float(amount),
                'currency': plan['currency'],
                'billingPeriodDays': period_days,
                'plan': plan['plan_key'],
            }), 202
        finally:
            return_connection(conn)

    @app.post('/api/mpesa/callback/subscription')
    def mpesa_subscription_callback():
        payload = request.get_json(silent=True) or {}
        body = payload.get('Body') if isinstance(payload, dict) else None
        callback = body.get('stkCallback') if isinstance(body, dict) else None
        if not isinstance(callback, dict):
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Invalid callback payload'}), 400
        checkout_id = str(callback.get('CheckoutRequestID') or '').strip()
        try:
            result_code = int(str(callback.get('ResultCode')))
        except (TypeError, ValueError):
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Invalid result code'}), 400
        if not checkout_id:
            return jsonify({'ResultCode': 1, 'ResultDesc': 'Missing checkout request ID'}), 400

        metadata = callback.get('CallbackMetadata')
        items = metadata.get('Item', []) if isinstance(metadata, dict) else []
        values = {
            item.get('Name'): item.get('Value')
            for item in items
            if isinstance(item, dict) and item.get('Name')
        } if isinstance(items, list) else {}
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT p.*, s.billing_period_days, s.plan_key
                    FROM subscription_payments p
                    JOIN subscriptions s ON s.id=p.subscription_id
                    WHERE p.checkout_request_id=%s
                    FOR UPDATE
                    ''',
                    (checkout_id,),
                )
                payment = cur.fetchone()
                if not payment:
                    app.logger.warning('Ignoring unknown M-Pesa subscription checkout callback: %s', checkout_id)
                    conn.rollback()
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Unknown checkout request ignored'})
                if payment['status'] != 'pending':
                    conn.commit()
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Callback already processed'})
                callback_merchant_id = str(callback.get('MerchantRequestID') or '').strip()
                expected_merchant_id = str(payment.get('merchant_request_id') or '').strip()
                if expected_merchant_id and callback_merchant_id and callback_merchant_id != expected_merchant_id:
                    _fail_payment(cur, payment, str(result_code), 'Callback merchant request ID did not match')
                    conn.commit()
                    app.logger.error('M-Pesa subscription merchant request mismatch for %s', checkout_id)
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Merchant request mismatch recorded'})

                if result_code != 0:
                    _fail_payment(cur, payment, str(result_code), str(callback.get('ResultDesc') or 'Payment failed'))
                    conn.commit()
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Payment failure recorded'})

                try:
                    callback_amount = Decimal(str(values['Amount']))
                except (KeyError, InvalidOperation, TypeError, ValueError):
                    _fail_payment(cur, payment, str(result_code), 'Successful callback omitted a valid amount')
                    conn.commit()
                    app.logger.error('M-Pesa subscription callback omitted amount for %s', checkout_id)
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Invalid payment amount recorded'})

                if callback_amount != Decimal(str(payment['amount'])):
                    _fail_payment(cur, payment, str(result_code), 'Callback amount did not match the requested amount')
                    conn.commit()
                    app.logger.error('M-Pesa subscription amount mismatch for %s', checkout_id)
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Payment amount mismatch recorded'})
                callback_phone = values.get('PhoneNumber')
                if callback_phone is not None and normalize_mpesa_phone(str(callback_phone)) != payment['phone_number']:
                    _fail_payment(cur, payment, str(result_code), 'Callback phone number did not match the requested number')
                    conn.commit()
                    app.logger.error('M-Pesa subscription phone mismatch for %s', checkout_id)
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Phone number mismatch recorded'})
                receipt_number = str(values.get('MpesaReceiptNumber') or '').strip()
                if not receipt_number:
                    _fail_payment(cur, payment, str(result_code), 'Successful callback omitted the M-Pesa receipt number')
                    conn.commit()
                    app.logger.error('M-Pesa subscription callback omitted receipt number for %s', checkout_id)
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Missing payment receipt recorded'})
                cur.execute(
                    '''
                    SELECT id
                    FROM subscription_payments
                    WHERE mpesa_receipt_number=%s AND id<>%s
                    LIMIT 1
                    ''',
                    (receipt_number, payment['id']),
                )
                if cur.fetchone():
                    _fail_payment(cur, payment, str(result_code), 'M-Pesa receipt number was already processed')
                    conn.commit()
                    app.logger.error('Duplicate M-Pesa receipt number for subscription checkout %s', checkout_id)
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Duplicate payment receipt recorded'})

                cur.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', (payment['user_id'],))
                if not cur.fetchone():
                    _fail_payment(cur, payment, str(result_code), 'Subscription account no longer exists')
                    conn.commit()
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Account not found'})
                try:
                    period_days = int(str(payment.get('billing_period_days')))
                except (TypeError, ValueError):
                    period_days = 0
                if period_days < 1:
                    _fail_payment(cur, payment, str(result_code), 'Subscription has an invalid billing period')
                    conn.commit()
                    app.logger.error('Invalid subscription billing period for checkout %s', checkout_id)
                    return jsonify({'ResultCode': 0, 'ResultDesc': 'Invalid billing period recorded'})
                now = datetime.now(timezone.utc).replace(tzinfo=None)
                cur.execute(
                    '''
                    SELECT expires_at
                    FROM subscriptions
                    WHERE user_id=%s AND plan_key IN ('pro', 'pro_monthly', 'pro_annual')
                      AND status='active' AND expires_at>%s
                    ORDER BY expires_at DESC
                    LIMIT 1 FOR UPDATE
                    ''',
                    (payment['user_id'], now),
                )
                existing = cur.fetchone()
                starts_at = existing['expires_at'] if existing and existing['expires_at'] > now else now
                expires_at = starts_at + timedelta(days=period_days)
                cur.execute(
                    '''
                    UPDATE subscriptions
                    SET status='active', starts_at=%s, expires_at=%s
                    WHERE id=%s AND status='pending'
                    ''',
                    (starts_at, expires_at, payment['subscription_id']),
                )
                cur.execute(
                    '''
                    UPDATE subscription_payments
                    SET status='completed', mpesa_receipt_number=%s, result_code=%s,
                        result_desc=%s, completed_at=UTC_TIMESTAMP()
                    WHERE id=%s AND status='pending'
                    ''',
                    (
                        receipt_number[:120],
                        str(result_code),
                        str(callback.get('ResultDesc') or 'Payment completed')[:255],
                        payment['id'],
                    ),
                )
                cur.execute(
                    '''
                    UPDATE users
                    SET account_plan=%s,
                        account_role=CASE WHEN account_role='free' THEN 'pro' ELSE account_role END
                    WHERE id=%s
                    ''',
                    (payment.get('plan_key') or 'pro', payment['user_id']),
                )
            conn.commit()
            return jsonify({'ResultCode': 0, 'ResultDesc': 'Subscription payment processed'})
        finally:
            return_connection(conn)

    @app.get('/api/admin/subscription-plans')
    def admin_get_subscription_plans():
        conn = get_connection()
        try:
            if not _admin_user(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT plan_key, display_name, amount, currency, billing_period_days, is_active
                    FROM subscription_plans ORDER BY plan_key
                    '''
                )
                plans = cur.fetchall()
            return jsonify([{
                'plan': row['plan_key'],
                'name': row['display_name'],
                'amount': float(row['amount']) if row.get('amount') is not None else None,
                'currency': row['currency'],
                'billingPeriodDays': int(row['billing_period_days']) if row.get('billing_period_days') else None,
                'active': bool(row['is_active']),
            } for row in plans])
        finally:
            return_connection(conn)

    @app.put('/api/admin/subscription-plans/<plan_key>')
    def admin_update_subscription_plan(plan_key: str):
        normalized_plan_key = normalize_subscription_plan_key(plan_key)
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return jsonify({'message': 'A JSON object is required.'}), 400
        if normalized_plan_key not in {'pro_monthly', 'pro_annual', 'pro'}:
            return jsonify({'message': 'Unsupported subscription plan.'}), 400
        try:
            amount = Decimal(str(payload.get('amount')))
            raw_period_days = payload.get('billingPeriodDays')
            if isinstance(raw_period_days, bool):
                raise ValueError('billingPeriodDays must be an integer')
            period_days = int(str(raw_period_days))
        except (InvalidOperation, TypeError, ValueError):
            return jsonify({'message': 'amount and billingPeriodDays are required.'}), 400
        active = payload.get('active')
        if (
            not amount.is_finite()
            or amount <= 0
            or amount != amount.to_integral_value()
            or period_days < 1
            or period_days > 3650
            or not isinstance(active, bool)
        ):
            return jsonify({
                'message': 'Set an integer KES amount above zero, a billing period from 1 to 3650 days, and an active boolean.'
            }), 400

        conn = get_connection()
        try:
            if not _admin_user(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    UPDATE subscription_plans
                    SET amount=%s, currency='KES', billing_period_days=%s, is_active=%s,
                        display_name=%s
                    WHERE plan_key=%s
                    ''',
                    (
                        amount,
                        period_days,
                        int(active),
                        'Pro Monthly' if normalized_plan_key == 'pro_monthly' else 'Pro Annual' if normalized_plan_key == 'pro_annual' else 'Pro',
                        normalized_plan_key,
                    ),
                )
            conn.commit()
            return jsonify({
                'plan': normalized_plan_key,
                'amount': float(amount),
                'currency': 'KES',
                'billingPeriodDays': period_days,
                'active': active,
            })
        finally:
            return_connection(conn)

    @app.put('/api/admin/users/<int:user_id>/account-role')
    def admin_update_account_role(user_id: int):
        payload = request.get_json(silent=True) or {}
        role = str(payload.get('role') or '').strip().lower()
        if role not in {'free', 'employer'}:
            return jsonify({'message': 'Only free and employer roles may be assigned here.'}), 400
        conn = get_connection()
        try:
            if not _admin_user(conn):
                return jsonify({'message': 'Unauthorized admin request'}), 401
            with conn.cursor() as cur:
                cur.execute('SELECT id, email FROM users WHERE id=%s', (user_id,))
                target = cur.fetchone()
                if not target:
                    return jsonify({'message': 'User not found.'}), 404
                if is_admin_email(str(target.get('email') or '')):
                    return jsonify({'message': 'The configured platform admin role cannot be changed here.'}), 400
                cur.execute('UPDATE users SET account_role=%s WHERE id=%s', (role, user_id))
            conn.commit()
            return jsonify({'userId': user_id, 'accountRole': role})
        finally:
            return_connection(conn)

    def _ensure_schema(cur) -> None:
        ensure_foundation_schema(cur, admin_email)

    return _ensure_schema


def _serialize_subscription(subscription: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not subscription:
        return None
    return {
        'id': int(subscription['id']),
        'plan': subscription['plan_key'],
        'status': subscription['status'],
        'startsAt': _iso(subscription.get('starts_at')),
        'expiresAt': _iso(subscription.get('expires_at')),
    }


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() + 'Z' if hasattr(value, 'isoformat') else None


def _fail_payment(cur, payment: Dict[str, Any], result_code: str, description: str) -> None:
    cur.execute(
        '''
        UPDATE subscription_payments
        SET status='failed', result_code=%s, result_desc=%s, failed_at=UTC_TIMESTAMP()
        WHERE id=%s AND status='pending'
        ''',
        (result_code[:20], description[:255], payment['id']),
    )
    cur.execute(
        "UPDATE subscriptions SET status='failed' WHERE id=%s AND status='pending'",
        (payment['subscription_id'],),
    )
