import os
from typing import Iterable

import pymysql

DB_HOST = os.getenv('ALWAYSDATA_DB_HOST', '').strip()
DB_USER = os.getenv('ALWAYSDATA_DB_USER', '').strip()
DB_PASSWORD = os.getenv('ALWAYSDATA_DB_PASSWORD', '')
DB_NAME = os.getenv('ALWAYSDATA_DB_NAME', '').strip()

SCHEMA_SQL = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(80) NOT NULL,
        email VARCHAR(120) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20),
        wpm DECIMAL(6,2) NOT NULL DEFAULT 0,
        accuracy DECIMAL(6,2) NOT NULL DEFAULT 0,
        total_races INT NOT NULL DEFAULT 0,
        wins INT NOT NULL DEFAULT 0,
        balance DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    """
    CREATE TABLE IF NOT EXISTS tournaments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        entry_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
        prize_pool DECIMAL(12,2) NOT NULL DEFAULT 0,
        participants INT NOT NULL DEFAULT 0,
        max_participants INT NOT NULL DEFAULT 0,
        status ENUM('upcoming','active','completed') NOT NULL DEFAULT 'upcoming',
        start_time DATETIME NULL,
        duration VARCHAR(50),
        image VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    """
    CREATE TABLE IF NOT EXISTS tournament_joins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tournament_id INT NOT NULL,
        user_id INT NOT NULL,
        paid_amount DECIMAL(12,2) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_tournament_user (tournament_id, user_id),
        KEY idx_tournament_joins_lookup (tournament_id, paid_amount, joined_at),
        CONSTRAINT fk_tj_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
        CONSTRAINT fk_tj_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    """
    CREATE TABLE IF NOT EXISTS race_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        race_code VARCHAR(80) NOT NULL UNIQUE,
        user_id INT NOT NULL,
        username VARCHAR(80) NOT NULL,
        wpm DECIMAL(6,2) NOT NULL,
        accuracy DECIMAL(6,2) NOT NULL,
        duration VARCHAR(50),
        place_position INT,
        earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
        race_timestamp DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_race_history_user_time (user_id, race_timestamp),
        CONSTRAINT fk_rh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    """
    CREATE TABLE IF NOT EXISTS mpesa_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tx_code VARCHAR(80) NOT NULL UNIQUE,
        user_id INT NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
        mode ENUM('simulated','live') NOT NULL DEFAULT 'simulated',
        checkout_request_id VARCHAR(120) NULL,
        merchant_request_id VARCHAR(120) NULL,
        mpesa_receipt_number VARCHAR(120) NULL,
        result_code VARCHAR(20) NULL,
        result_desc VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        failed_at DATETIME NULL,
        KEY idx_mpesa_user_created (user_id, created_at),
        KEY idx_mpesa_checkout_request (checkout_request_id),
        CONSTRAINT fk_mt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    """
    CREATE TABLE IF NOT EXISTS prize_payouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payout_code VARCHAR(80) NOT NULL UNIQUE,
        user_id INT NOT NULL,
        tournament_id INT NULL,
        phone_number VARCHAR(20) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
        mode ENUM('simulated','live') NOT NULL DEFAULT 'simulated',
        conversation_id VARCHAR(120) NULL,
        originator_conversation_id VARCHAR(120) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        failed_at DATETIME NULL,
        KEY idx_prize_payouts_user_created (user_id, created_at),
        CONSTRAINT fk_pp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_pp_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
    """
    CREATE TABLE IF NOT EXISTS store_purchases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        item_id VARCHAR(80) NOT NULL,
        item_name VARCHAR(150) NOT NULL,
        price_paid DECIMAL(12,2) NOT NULL,
        purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_store_purchase (user_id, item_id),
        KEY idx_store_purchases_user_time (user_id, purchased_at),
        CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
]

EXPECTED_COLUMNS = {
    'users': {
        'username': "ALTER TABLE users ADD COLUMN username VARCHAR(80) NOT NULL AFTER id",
        'email': "ALTER TABLE users ADD COLUMN email VARCHAR(120) NOT NULL AFTER username",
        'password': "ALTER TABLE users ADD COLUMN password VARCHAR(255) NOT NULL AFTER email",
        'phone_number': "ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) NULL AFTER password",
        'wpm': "ALTER TABLE users ADD COLUMN wpm DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER phone_number",
        'accuracy': "ALTER TABLE users ADD COLUMN accuracy DECIMAL(6,2) NOT NULL DEFAULT 0 AFTER wpm",
        'total_races': "ALTER TABLE users ADD COLUMN total_races INT NOT NULL DEFAULT 0 AFTER accuracy",
        'wins': "ALTER TABLE users ADD COLUMN wins INT NOT NULL DEFAULT 0 AFTER total_races",
        'balance': "ALTER TABLE users ADD COLUMN balance DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER wins",
        'created_at': "ALTER TABLE users ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER balance",
        'updated_at': "ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at",
    },
    'tournaments': {
        'name': "ALTER TABLE tournaments ADD COLUMN name VARCHAR(150) NOT NULL AFTER id",
        'description': "ALTER TABLE tournaments ADD COLUMN description TEXT NULL AFTER name",
        'entry_fee': "ALTER TABLE tournaments ADD COLUMN entry_fee DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER description",
        'prize_pool': "ALTER TABLE tournaments ADD COLUMN prize_pool DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER entry_fee",
        'participants': "ALTER TABLE tournaments ADD COLUMN participants INT NOT NULL DEFAULT 0 AFTER prize_pool",
        'max_participants': "ALTER TABLE tournaments ADD COLUMN max_participants INT NOT NULL DEFAULT 0 AFTER participants",
        'status': "ALTER TABLE tournaments ADD COLUMN status ENUM('upcoming','active','completed') NOT NULL DEFAULT 'upcoming' AFTER max_participants",
        'start_time': "ALTER TABLE tournaments ADD COLUMN start_time DATETIME NULL AFTER status",
        'duration': "ALTER TABLE tournaments ADD COLUMN duration VARCHAR(50) NULL AFTER start_time",
        'image': "ALTER TABLE tournaments ADD COLUMN image VARCHAR(20) NULL AFTER duration",
        'created_at': "ALTER TABLE tournaments ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER image",
        'updated_at': "ALTER TABLE tournaments ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at",
    },
    'tournament_joins': {
        'tournament_id': "ALTER TABLE tournament_joins ADD COLUMN tournament_id INT NOT NULL AFTER id",
        'user_id': "ALTER TABLE tournament_joins ADD COLUMN user_id INT NOT NULL AFTER tournament_id",
        'paid_amount': "ALTER TABLE tournament_joins ADD COLUMN paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER user_id",
        'joined_at': "ALTER TABLE tournament_joins ADD COLUMN joined_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER paid_amount",
    },
    'race_history': {
        'race_code': "ALTER TABLE race_history ADD COLUMN race_code VARCHAR(80) NOT NULL AFTER id",
        'user_id': "ALTER TABLE race_history ADD COLUMN user_id INT NOT NULL AFTER race_code",
        'username': "ALTER TABLE race_history ADD COLUMN username VARCHAR(80) NOT NULL AFTER user_id",
        'wpm': "ALTER TABLE race_history ADD COLUMN wpm DECIMAL(6,2) NOT NULL AFTER username",
        'accuracy': "ALTER TABLE race_history ADD COLUMN accuracy DECIMAL(6,2) NOT NULL AFTER wpm",
        'duration': "ALTER TABLE race_history ADD COLUMN duration VARCHAR(50) NULL AFTER accuracy",
        'place_position': "ALTER TABLE race_history ADD COLUMN place_position INT NULL AFTER duration",
        'earnings': "ALTER TABLE race_history ADD COLUMN earnings DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER place_position",
        'race_timestamp': "ALTER TABLE race_history ADD COLUMN race_timestamp DATETIME NOT NULL AFTER earnings",
        'created_at': "ALTER TABLE race_history ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER race_timestamp",
    },
    'mpesa_transactions': {
        'tx_code': "ALTER TABLE mpesa_transactions ADD COLUMN tx_code VARCHAR(80) NOT NULL AFTER id",
        'user_id': "ALTER TABLE mpesa_transactions ADD COLUMN user_id INT NOT NULL AFTER tx_code",
        'phone_number': "ALTER TABLE mpesa_transactions ADD COLUMN phone_number VARCHAR(20) NOT NULL AFTER user_id",
        'amount': "ALTER TABLE mpesa_transactions ADD COLUMN amount DECIMAL(12,2) NOT NULL AFTER phone_number",
        'status': "ALTER TABLE mpesa_transactions ADD COLUMN status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending' AFTER amount",
        'mode': "ALTER TABLE mpesa_transactions ADD COLUMN mode ENUM('simulated','live') NOT NULL DEFAULT 'simulated' AFTER status",
        'checkout_request_id': "ALTER TABLE mpesa_transactions ADD COLUMN checkout_request_id VARCHAR(120) NULL AFTER mode",
        'merchant_request_id': "ALTER TABLE mpesa_transactions ADD COLUMN merchant_request_id VARCHAR(120) NULL AFTER checkout_request_id",
        'mpesa_receipt_number': "ALTER TABLE mpesa_transactions ADD COLUMN mpesa_receipt_number VARCHAR(120) NULL AFTER merchant_request_id",
        'result_code': "ALTER TABLE mpesa_transactions ADD COLUMN result_code VARCHAR(20) NULL AFTER mpesa_receipt_number",
        'result_desc': "ALTER TABLE mpesa_transactions ADD COLUMN result_desc VARCHAR(255) NULL AFTER result_code",
        'created_at': "ALTER TABLE mpesa_transactions ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER result_desc",
        'completed_at': "ALTER TABLE mpesa_transactions ADD COLUMN completed_at DATETIME NULL AFTER created_at",
        'failed_at': "ALTER TABLE mpesa_transactions ADD COLUMN failed_at DATETIME NULL AFTER completed_at",
    },
    'prize_payouts': {
        'payout_code': "ALTER TABLE prize_payouts ADD COLUMN payout_code VARCHAR(80) NOT NULL AFTER id",
        'user_id': "ALTER TABLE prize_payouts ADD COLUMN user_id INT NOT NULL AFTER payout_code",
        'tournament_id': "ALTER TABLE prize_payouts ADD COLUMN tournament_id INT NULL AFTER user_id",
        'phone_number': "ALTER TABLE prize_payouts ADD COLUMN phone_number VARCHAR(20) NOT NULL AFTER tournament_id",
        'amount': "ALTER TABLE prize_payouts ADD COLUMN amount DECIMAL(12,2) NOT NULL AFTER phone_number",
        'status': "ALTER TABLE prize_payouts ADD COLUMN status ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending' AFTER amount",
        'mode': "ALTER TABLE prize_payouts ADD COLUMN mode ENUM('simulated','live') NOT NULL DEFAULT 'simulated' AFTER status",
        'conversation_id': "ALTER TABLE prize_payouts ADD COLUMN conversation_id VARCHAR(120) NULL AFTER mode",
        'originator_conversation_id': "ALTER TABLE prize_payouts ADD COLUMN originator_conversation_id VARCHAR(120) NULL AFTER conversation_id",
        'created_at': "ALTER TABLE prize_payouts ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER originator_conversation_id",
        'completed_at': "ALTER TABLE prize_payouts ADD COLUMN completed_at DATETIME NULL AFTER created_at",
        'failed_at': "ALTER TABLE prize_payouts ADD COLUMN failed_at DATETIME NULL AFTER completed_at",
    },
    'store_purchases': {
        'user_id': "ALTER TABLE store_purchases ADD COLUMN user_id INT NOT NULL AFTER id",
        'item_id': "ALTER TABLE store_purchases ADD COLUMN item_id VARCHAR(80) NOT NULL AFTER user_id",
        'item_name': "ALTER TABLE store_purchases ADD COLUMN item_name VARCHAR(150) NOT NULL AFTER item_id",
        'price_paid': "ALTER TABLE store_purchases ADD COLUMN price_paid DECIMAL(12,2) NOT NULL AFTER item_name",
        'purchased_at': "ALTER TABLE store_purchases ADD COLUMN purchased_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER price_paid",
    },
}

EXPECTED_INDEXES = {
    'users': {
        'uq_users_email': 'CREATE UNIQUE INDEX uq_users_email ON users (email)',
    },
    'tournament_joins': {
        'uniq_tournament_user': 'CREATE UNIQUE INDEX uniq_tournament_user ON tournament_joins (tournament_id, user_id)',
        'idx_tournament_joins_lookup': 'CREATE INDEX idx_tournament_joins_lookup ON tournament_joins (tournament_id, paid_amount, joined_at)',
        'idx_tournament_joins_user': 'CREATE INDEX idx_tournament_joins_user ON tournament_joins (user_id)',
    },
    'race_history': {
        'uq_race_history_code': 'CREATE UNIQUE INDEX uq_race_history_code ON race_history (race_code)',
        'idx_race_history_user_time': 'CREATE INDEX idx_race_history_user_time ON race_history (user_id, race_timestamp)',
    },
    'mpesa_transactions': {
        'uq_mpesa_tx_code': 'CREATE UNIQUE INDEX uq_mpesa_tx_code ON mpesa_transactions (tx_code)',
        'idx_mpesa_user_created': 'CREATE INDEX idx_mpesa_user_created ON mpesa_transactions (user_id, created_at)',
        'idx_mpesa_checkout_request': 'CREATE INDEX idx_mpesa_checkout_request ON mpesa_transactions (checkout_request_id)',
    },
    'prize_payouts': {
        'uq_prize_payout_code': 'CREATE UNIQUE INDEX uq_prize_payout_code ON prize_payouts (payout_code)',
        'idx_prize_payouts_user_created': 'CREATE INDEX idx_prize_payouts_user_created ON prize_payouts (user_id, created_at)',
        'idx_prize_payouts_tournament': 'CREATE INDEX idx_prize_payouts_tournament ON prize_payouts (tournament_id)',
    },
    'store_purchases': {
        'uniq_store_purchase': 'CREATE UNIQUE INDEX uniq_store_purchase ON store_purchases (user_id, item_id)',
        'idx_store_purchases_user_time': 'CREATE INDEX idx_store_purchases_user_time ON store_purchases (user_id, purchased_at)',
    },
}

EXPECTED_FOREIGN_KEYS = {
    'tournament_joins': {
        'fk_tj_tournament': (
            'ALTER TABLE tournament_joins '
            'ADD CONSTRAINT fk_tj_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE'
        ),
        'fk_tj_user': (
            'ALTER TABLE tournament_joins '
            'ADD CONSTRAINT fk_tj_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
        ),
    },
    'race_history': {
        'fk_rh_user': (
            'ALTER TABLE race_history '
            'ADD CONSTRAINT fk_rh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
        ),
    },
    'mpesa_transactions': {
        'fk_mt_user': (
            'ALTER TABLE mpesa_transactions '
            'ADD CONSTRAINT fk_mt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
        ),
    },
    'prize_payouts': {
        'fk_pp_user': (
            'ALTER TABLE prize_payouts '
            'ADD CONSTRAINT fk_pp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
        ),
        'fk_pp_tournament': (
            'ALTER TABLE prize_payouts '
            'ADD CONSTRAINT fk_pp_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL'
        ),
    },
    'store_purchases': {
        'fk_sp_user': (
            'ALTER TABLE store_purchases '
            'ADD CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
        ),
    },
}

POST_MIGRATION_SQL = [
    "UPDATE users SET phone_number = '' WHERE phone_number IS NULL",
    "UPDATE tournaments SET description = '' WHERE description IS NULL",
    "UPDATE tournaments SET duration = '60s' WHERE duration IS NULL OR duration = ''",
    "UPDATE tournaments SET image = '??' WHERE image IS NULL OR image = ''",
    "UPDATE tournaments SET status = 'upcoming' WHERE status IS NULL OR status = ''",
]


def _fetch_single_column(cur, query: str, params: Iterable[object]) -> set[str]:
    cur.execute(query, tuple(params))
    return {str(row[0]) for row in cur.fetchall()}


def _table_exists(cur, table_name: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = %s AND table_name = %s
        LIMIT 1
        """,
        (DB_NAME, table_name),
    )
    return cur.fetchone() is not None


def _existing_columns(cur, table_name: str) -> set[str]:
    return _fetch_single_column(
        cur,
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        """,
        (DB_NAME, table_name),
    )


def _existing_indexes(cur, table_name: str) -> set[str]:
    return _fetch_single_column(
        cur,
        """
        SELECT DISTINCT index_name
        FROM information_schema.statistics
        WHERE table_schema = %s AND table_name = %s
        """,
        (DB_NAME, table_name),
    )


def _existing_foreign_keys(cur, table_name: str) -> set[str]:
    return _fetch_single_column(
        cur,
        """
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = %s AND table_name = %s AND constraint_type = 'FOREIGN KEY'
        """,
        (DB_NAME, table_name),
    )


def _ensure_columns(cur) -> None:
    for table_name, columns in EXPECTED_COLUMNS.items():
        if not _table_exists(cur, table_name):
            continue
        existing = _existing_columns(cur, table_name)
        for column_name, statement in columns.items():
            if column_name not in existing:
                cur.execute(statement)
                existing.add(column_name)


def _ensure_indexes(cur) -> None:
    for table_name, indexes in EXPECTED_INDEXES.items():
        if not _table_exists(cur, table_name):
            continue
        existing = _existing_indexes(cur, table_name)
        for index_name, statement in indexes.items():
            if index_name not in existing:
                cur.execute(statement)
                existing.add(index_name)


def _ensure_foreign_keys(cur) -> None:
    for table_name, foreign_keys in EXPECTED_FOREIGN_KEYS.items():
        if not _table_exists(cur, table_name):
            continue
        existing = _existing_foreign_keys(cur, table_name)
        for constraint_name, statement in foreign_keys.items():
            if constraint_name not in existing:
                cur.execute(statement)
                existing.add(constraint_name)


def _normalize_existing_data(cur) -> None:
    for statement in POST_MIGRATION_SQL:
        cur.execute(statement)


def main():
    if not DB_HOST or not DB_USER or not DB_NAME:
        raise RuntimeError(
            'Alwaysdata database environment variables are missing. '
            'Set ALWAYSDATA_DB_HOST, ALWAYSDATA_DB_USER, ALWAYSDATA_DB_PASSWORD, and ALWAYSDATA_DB_NAME before running the schema.'
        )

    conn = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset='utf8mb4',
        autocommit=False,
    )
    try:
        with conn.cursor() as cur:
            for stmt in SCHEMA_SQL:
                cur.execute(stmt)
            _ensure_columns(cur)
            _ensure_indexes(cur)
            _ensure_foreign_keys(cur)
            _normalize_existing_data(cur)
        conn.commit()
        print('Schema created/updated successfully.')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
