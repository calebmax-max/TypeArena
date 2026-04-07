from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import string
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

import pymysql
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent.parent
BUILD_DIR = BASE_DIR / 'build'

DB_HOST = os.getenv('ALWAYSDATA_DB_HOST', '').strip()
DB_USER = os.getenv('ALWAYSDATA_DB_USER', '').strip()
DB_PASSWORD = os.getenv('ALWAYSDATA_DB_PASSWORD', '')
DB_NAME = os.getenv('ALWAYSDATA_DB_NAME', '').strip()

MPESA_SIMULATE = os.getenv('MPESA_SIMULATE', 'true').lower() == 'true'
MPESA_CONSUMER_KEY = os.getenv('MPESA_CONSUMER_KEY', '')
MPESA_CONSUMER_SECRET = os.getenv('MPESA_CONSUMER_SECRET', '')
MPESA_SHORTCODE = os.getenv('MPESA_SHORTCODE', '174379')
MPESA_PASSKEY = os.getenv('MPESA_PASSKEY', '')
MPESA_CALLBACK_URL = os.getenv('MPESA_CALLBACK_URL', 'http://localhost:3001/api/mpesa/callback/topup')
MPESA_B2C_SHORTCODE = os.getenv('MPESA_B2C_SHORTCODE', MPESA_SHORTCODE)
MPESA_B2C_INITIATOR_NAME = os.getenv('MPESA_B2C_INITIATOR_NAME', '')
MPESA_B2C_SECURITY_CREDENTIAL = os.getenv('MPESA_B2C_SECURITY_CREDENTIAL', '')
MPESA_B2C_RESULT_URL = os.getenv('MPESA_B2C_RESULT_URL', 'http://localhost:3001/api/mpesa/callback/b2c-result')
MPESA_B2C_TIMEOUT_URL = os.getenv('MPESA_B2C_TIMEOUT_URL', 'http://localhost:3001/api/mpesa/callback/b2c-timeout')
MPESA_BASE_URL = os.getenv('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-5.2')
OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
AI_SETTINGS: Dict[str, Any] = {
    'provider': os.getenv('AI_CONTENT_PROVIDER', 'auto').strip().lower() or 'auto',
    'model': OPENAI_MODEL,
}
PAYPAL_CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID', '')
PAYPAL_CLIENT_SECRET = os.getenv('PAYPAL_CLIENT_SECRET', '')
PAYPAL_BASE_URL = os.getenv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com')
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY', '')
STRIPE_BASE_URL = os.getenv('STRIPE_BASE_URL', 'https://api.stripe.com/v1')
STRIPE_SUCCESS_URL = os.getenv('STRIPE_SUCCESS_URL', 'http://localhost:3000/profile?checkout=success')
STRIPE_CANCEL_URL = os.getenv('STRIPE_CANCEL_URL', 'http://localhost:3000/profile?checkout=cancel')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET', '')

ADMIN_EMAIL = os.getenv('TYPEARENA_ADMIN_EMAIL', '').strip()
ADMIN_PASSWORD = os.getenv('TYPEARENA_ADMIN_PASSWORD', '')
ADMIN_TOKENS: set[str] = set()
TOURNAMENT_MATCH_SIZE = 2
TOURNAMENT_START_DELAY_SECONDS = 30
WINNER_PRIZE_SHARE = 0.60
WITHDRAWAL_FEE = 50.0
LIVE_RACE_ROOMS: dict[str, Dict[str, Any]] = {}
LIVE_RACE_TEXTS = {
    'standard': 'Speed comes from rhythm, not panic. Keep your shoulders relaxed and let accurate keystrokes build momentum every second of the race.',
    'survival': 'In survival mode every mistake costs pressure. Stay calm, stay precise, and protect your lead with clean, confident typing.',
    'speed_burst': 'Burst rounds reward explosive starts. Push early, keep your form clean, and hold the pace long enough to break your opponent.',
    'code': 'function renderLeaderboard(rankings) { return rankings.filter(player => player.wpm > 80).map(player => player.username).join(", "); }',
    'memory': 'Remember the phrase before the countdown ends, then reproduce it with focus, control, and steady breathing under pressure.',
    'quote': 'Discipline beats motivation when the work must be done every day, especially when excellence is built one correct character at a time.',
    'marathon': 'Long-form races test endurance. The fastest typists conserve motion, preserve posture, and finish with accuracy still intact.',
}
MARKETPLACE_ITEMS = [
    {
        'id': 'skin_neon_grid',
        'name': 'Neon Grid Keyboard Skin',
        'category': 'keyboardSkins',
        'price': 120,
        'rarity': 'rare',
        'description': 'A luminous grid overlay that gives your keyboard HUD a clean cyber-racing feel.',
    },
    {
        'id': 'skin_obsidian_pro',
        'name': 'Obsidian Pro Keyboard Skin',
        'category': 'keyboardSkins',
        'price': 160,
        'rarity': 'epic',
        'description': 'Dark glass keys with amber highlights built for late-night ranked sessions.',
    },
    {
        'id': 'theme_sunset',
        'name': 'Sunset Velocity Theme',
        'category': 'typingThemes',
        'price': 180,
        'rarity': 'epic',
        'description': 'Warm orange gradients and bold contrast that re-style the full race arena.',
    },
    {
        'id': 'theme_arctic_flux',
        'name': 'Arctic Flux Theme',
        'category': 'typingThemes',
        'price': 210,
        'rarity': 'rare',
        'description': 'Cool electric blues for players who want a sharper competitive dashboard.',
    },
    {
        'id': 'avatar_lion',
        'name': 'Lion Avatar',
        'category': 'avatars',
        'price': 90,
        'rarity': 'common',
        'description': 'A bold profile icon that gives your leaderboard card instant presence.',
    },
    {
        'id': 'avatar_phantom',
        'name': 'Phantom Avatar',
        'category': 'avatars',
        'price': 130,
        'rarity': 'rare',
        'description': 'A stealth-inspired avatar for players who prefer a colder, cleaner identity.',
    },
    {
        'id': 'badge_vip',
        'name': 'VIP Founder Badge',
        'category': 'premiumBadges',
        'price': 240,
        'rarity': 'legendary',
        'description': 'A high-visibility founder badge reserved for players building premium status.',
    },
    {
        'id': 'badge_streak_master',
        'name': 'Streak Master Badge',
        'category': 'premiumBadges',
        'price': 195,
        'rarity': 'epic',
        'description': 'A premium profile badge for consistent race-day performers and grinders.',
    },
    {
        'id': 'effect_comet',
        'name': 'Comet Trail Effect',
        'category': 'animatedEffects',
        'price': 150,
        'rarity': 'rare',
        'description': 'Adds a fast-moving trail effect to highlight clutch finishes and personal bests.',
    },
    {
        'id': 'effect_pulse_ring',
        'name': 'Pulse Ring Effect',
        'category': 'animatedEffects',
        'price': 175,
        'rarity': 'epic',
        'description': 'A premium win pulse that makes your results card feel more alive after victories.',
    },
    {
        'id': 'frame_gold',
        'name': 'Gold Profile Frame',
        'category': 'profileFrames',
        'price': 110,
        'rarity': 'common',
        'description': 'A polished metallic frame for your public player profile and challenge card.',
    },
    {
        'id': 'frame_crown',
        'name': 'Crown Profile Frame',
        'category': 'profileFrames',
        'price': 260,
        'rarity': 'legendary',
        'description': 'A top-tier prestige frame for players who want their card to look unmistakably elite.',
    },
]
AI_PASSAGE_BANK = {
    'coding': [
        'Sprint review 01: refactor the payments module so each function owns 1 clear job, log every retry with code #A17, and ship a safer release before 18:30. The winning patch must validate input, escape symbols like {}[]()<>, and keep notes such as total=24, failed=3, passed=21 without losing rhythm or accuracy.',
        'Debug report v2.4 says the room service should filter 128 sessions, group users by match_id, and return the fastest score in under 90 seconds. Type the snippet carefully: if score >= 87.5 and errors <= 2, mark status="verified"; otherwise push item #404 into retry_queue and notify ops@example.dev immediately.',
    ],
    'legal': [
        'This agreement confirms that each participant accepts the competition rules, payout schedule, and dispute process before joining any paid room.',
    ],
    'medical': [
        'Clinical documentation requires precise terminology, steady pacing, and careful attention so patient records remain accurate and easy to review.',
    ],
    'business': [
        'Quarterly operations memo: the arena processed 2,480 matches, KES 184,500 in entry volume, and 96 verified payouts during cycle 04. Leaders must compare retention at 62%, churn at 11%, and referral lift at +18% while checking symbols like %, +, /, and # in every line before approving the final dashboard update at 17:45.',
        'Investor summary 2026-04: revenue reached KES 215,000, repeat purchases hit 37%, and premium upgrades moved from 84 to 129 accounts in just 30 days. Please review the notes, confirm item codes A-14, C-27, and Z-09, then publish the clean paragraph with commas, quotation marks, and figures like 7.5%, 12/20, and 3:1 intact.',
    ],
    'french': [
        "Rapport de tournoi 05: les meilleurs joueurs progressent avec discipline, precision et regularite, meme quand le tableau affiche 128 participants, 3 manches finales et un prize pool de KES 75,000. Merci de verifier les symboles %, /, # et les chiffres 14, 27 et 39 avant de valider la version finale a 18:20.",
        "Note d'exploitation: pendant la session premium, l'equipe doit comparer 2 strategies, corriger 4 erreurs critiques et confirmer que le score moyen reste au-dessus de 91.5%. Tapez chaque phrase avec soin, gardez les signes () {} [] et recopiez exactement les references X-17, Q-08 et ticket #553.",
    ],
    'swahili': [
        'Ripoti ya mashindano 07 inaonyesha kuwa washindi wanahitaji kasi, umakini, na nidhamu kila siku, hasa wakati takwimu zinaonyesha mechi 240, ushindi 18, na bonasi ya KES 45,000. Hakikisha unaandika alama kama %, /, #, na namba 12, 48, 96 kwa usahihi kabla ya muda wa mwisho wa saa 17:30.',
        'Kwenye duru ya mwisho, msimamizi alitaja kuwa wachezaji 2 walikamilisha maandishi ndani ya sekunde 95, makosa yakabaki chini ya 3, na kiwango cha usahihi kikafika 94.7%. Andika sentensi yote pamoja na alama za mabano (), nukuu "", na kumbukumbu za faili kama match-21 au room#8 bila kuruka herufi.',
    ],
    'exam': [
        'Assessment packet 03 instructs candidates to review section A, B, and C in order, complete 45 items in 30 minutes, and keep the error count below 2 per page. Read every symbol carefully, including %, :, ;, and (), then confirm that line 14 references code X9-33 while line 27 records a score of 88.4 out of 100.',
    ],
    'quote': [
        'Consistency creates momentum long before the results are visible, which is why disciplined practice can look ordinary at 06:00, 12:30, and 21:15 until it suddenly delivers a 103 WPM finish. Keep the punctuation, numbers, and symbols exactly as written: "focus > panic", ratio 3:2, and checkpoint #11 all matter in this round.',
    ],
}

PASSAGE_DECORATORS = [
    'Final check: preserve every digit, symbol, and capital letter exactly as shown.',
    'Reminder: copy punctuation carefully, especially %, #, /, :, ;, quotes, and brackets.',
    'Match note: accuracy drops fast when players skip hyphens, decimals, or closing symbols.',
]


def _season_name() -> str:
    now = datetime.utcnow()
    return f'{now.strftime("%B")} {now.year}'


def _tier_for_user(user: Dict[str, Any]) -> str:
    wpm = float(user.get('wpm') or 0)
    if wpm >= 120:
        return 'Diamond'
    if wpm >= 95:
        return 'Gold'
    if wpm >= 70:
        return 'Silver'
    return 'Bronze'


def _season_points_for_user(user: Dict[str, Any]) -> int:
    return int(round((float(user.get('wpm') or 0) * 2) + (float(user.get('accuracy') or 0)) + (int(user.get('wins') or 0) * 15)))


def _referral_code_for_user(user: Dict[str, Any]) -> str:
    username = ''.join(ch for ch in str(user.get('username') or 'TYPE') if ch.isalnum()).upper()[:4] or 'TYPE'
    return f'{username}{int(user.get("id") or 0):04d}'


def _coach_tip_for_user(user: Dict[str, Any]) -> str:
    accuracy = float(user.get('accuracy') or 0)
    wpm = float(user.get('wpm') or 0)
    if accuracy < 92:
        return 'Your biggest gain is accuracy. Slow down slightly on tricky words and focus on fewer corrections.'
    if wpm < 70:
        return 'Your rhythm can improve. Practice shorter burst races and keep your hands lighter on the keyboard.'
    return 'You are performing well. Push targeted sprint sessions to turn consistency into a higher peak WPM.'


def _duration_to_seconds(duration_value: Any) -> int:
    value = str(duration_value or '').strip().lower()
    if not value:
        return 5 * 24 * 60 * 60
    if value.endswith('s'):
        try:
            return max(1, int(float(value[:-1])))
        except ValueError:
            return 5 * 24 * 60 * 60
    if value.endswith('m'):
        try:
            return max(1, int(float(value[:-1]) * 60))
        except ValueError:
            return 5 * 24 * 60 * 60
    if value.endswith('d'):
        try:
            return max(1, int(float(value[:-1]) * 24 * 60 * 60))
        except ValueError:
            return 5 * 24 * 60 * 60
    if value == 'multi-race':
        return 300
    try:
        return max(1, int(float(value)))
    except ValueError:
        return 5 * 24 * 60 * 60


def _computed_tournament_status(row: Dict[str, Any]) -> str:
    start_time = row.get('start_time')
    stored_status = str(row.get('status') or 'upcoming').strip().lower()
    if not start_time:
        return stored_status

    now_dt = datetime.utcnow()
    if start_time > now_dt:
        return 'upcoming'

    duration_seconds = _duration_to_seconds(row.get('duration'))
    end_time = start_time + timedelta(seconds=duration_seconds)
    if now_dt >= end_time:
        return 'completed'
    return 'active'


def _sync_tournament_statuses(cur) -> None:
    cur.execute('SELECT id, start_time, duration, status FROM tournaments')
    rows = cur.fetchall()
    for row in rows:
        next_status = _computed_tournament_status(row)
        if next_status != str(row.get('status') or '').lower():
            cur.execute('UPDATE tournaments SET status=%s WHERE id=%s', (next_status, row['id']))


def _ensure_store_purchase_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS store_purchases (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            item_id VARCHAR(80) NOT NULL,
            item_name VARCHAR(150) NOT NULL,
            price_paid DECIMAL(12,2) NOT NULL,
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_store_purchase (user_id, item_id),
            CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _owned_store_items_for_user(conn, user_id: int) -> list[str]:
    if user_id <= 0:
        return []
    with conn.cursor() as cur:
        _ensure_store_purchase_table(cur)
        cur.execute(
            'SELECT item_id FROM store_purchases WHERE user_id = %s ORDER BY purchased_at DESC',
            (user_id,),
        )
        rows = cur.fetchall()
    return [str(row.get('item_id') or '') for row in rows if row.get('item_id')]


def _ensure_user_equipped_columns(cur) -> None:
    cur.execute("SHOW COLUMNS FROM users LIKE 'equipped_avatar'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE users ADD COLUMN equipped_avatar VARCHAR(80) NULL AFTER balance")
    cur.execute("SHOW COLUMNS FROM users LIKE 'equipped_theme'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE users ADD COLUMN equipped_theme VARCHAR(80) NULL AFTER equipped_avatar")
    cur.execute("SHOW COLUMNS FROM users LIKE 'equipped_skin'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE users ADD COLUMN equipped_skin VARCHAR(80) NULL AFTER equipped_theme")
    cur.execute("SHOW COLUMNS FROM users LIKE 'equipped_badge'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE users ADD COLUMN equipped_badge VARCHAR(80) NULL AFTER equipped_skin")
    cur.execute("SHOW COLUMNS FROM users LIKE 'equipped_effect'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE users ADD COLUMN equipped_effect VARCHAR(80) NULL AFTER equipped_badge")
    cur.execute("SHOW COLUMNS FROM users LIKE 'equipped_frame'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE users ADD COLUMN equipped_frame VARCHAR(80) NULL AFTER equipped_effect")


def _equip_field_for_category(category: str) -> str | None:
    mapping = {
        'avatars': 'equipped_avatar',
        'typingThemes': 'equipped_theme',
        'keyboardSkins': 'equipped_skin',
        'premiumBadges': 'equipped_badge',
        'animatedEffects': 'equipped_effect',
        'profileFrames': 'equipped_frame',
    }
    return mapping.get(str(category or '').strip())


def _generate_passage(mode: str, language: str) -> Dict[str, Any]:
    normalized_mode = str(mode or 'business').strip().lower()
    normalized_language = str(language or 'english').strip().lower()
    if normalized_language == 'swahili':
        pool_key = 'swahili'
    elif normalized_language == 'french':
        pool_key = 'french'
    elif normalized_language == 'code':
        pool_key = 'coding'
    elif normalized_mode in {'code', 'coding'}:
        pool_key = 'coding'
    elif normalized_mode in {'quote', 'quote battle'}:
        pool_key = 'quote'
    elif normalized_mode in {'memory', 'exam'}:
        pool_key = 'exam'
    else:
        pool_key = normalized_mode if normalized_mode in AI_PASSAGE_BANK else 'business'

    passages = AI_PASSAGE_BANK.get(pool_key) or AI_PASSAGE_BANK['business']
    base_passage = passages[secrets.randbelow(len(passages))]
    decorator = PASSAGE_DECORATORS[secrets.randbelow(len(PASSAGE_DECORATORS))]
    checksum = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    passage = f'{base_passage} {decorator} Match code: {checksum}.'
    return {
        'mode': normalized_mode,
        'language': normalized_language,
        'passage': passage,
        'title': f'{pool_key.title()} Marathon Paragraph',
        'antiCheatHint': 'Freshly generated content reduces memorization and replay abuse.',
        'provider': 'local',
        'model': 'template-bank',
    }


def _current_ai_settings() -> Dict[str, Any]:
    provider = str(AI_SETTINGS.get('provider') or 'auto').strip().lower()
    if provider not in {'auto', 'openai', 'local'}:
        provider = 'auto'
    model = str(AI_SETTINGS.get('model') or OPENAI_MODEL).strip() or OPENAI_MODEL
    return {'provider': provider, 'model': model}


def _openai_generate_passage(mode: str, language: str) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise ValueError('OPENAI_API_KEY is not configured.')

    settings = _current_ai_settings()
    model_name = settings['model']
    normalized_mode = str(mode or 'business').strip().lower()
    normalized_language = str(language or 'english').strip().lower()

    response = _http_json(
        'POST',
        f'{OPENAI_BASE_URL}/responses',
        payload={
            'model': model_name,
            'input': [
                {
                    'role': 'system',
                    'content': 'You create fresh anti-cheat typing passages for competitive live races.',
                },
                {
                    'role': 'user',
                    'content': (
                        'Generate one fresh typing race passage. '
                        f'Mode: {normalized_mode}. Language: {normalized_language}. '
                        'Passage must be a large single paragraph between 110 and 170 words, natural, competitive, and hard to memorize. '
                        'It must include numbers and symbols such as %, #, /, :, ;, brackets, or quotes. '
                        'Include a short anti-cheat hint.'
                    ),
                },
            ],
            'text': {
                'format': {
                    'type': 'json_schema',
                    'name': 'typing_passage',
                    'strict': True,
                    'schema': {
                        'type': 'object',
                        'additionalProperties': False,
                        'properties': {
                            'title': {'type': 'string'},
                            'passage': {'type': 'string'},
                            'antiCheatHint': {'type': 'string'},
                        },
                        'required': ['title', 'passage', 'antiCheatHint'],
                    },
                }
            },
        },
        headers={'Authorization': f'Bearer {OPENAI_API_KEY}'},
    )

    output_text = str(response.get('output_text') or '').strip()
    if not output_text:
        raise ValueError('OpenAI returned no output_text.')

    try:
        parsed = json.loads(output_text)
    except json.JSONDecodeError as exc:
        raise ValueError('OpenAI response was not valid JSON.') from exc

    passage = str(parsed.get('passage') or '').strip()
    if not passage:
        raise ValueError('OpenAI response did not include a passage.')

    return {
        'mode': normalized_mode,
        'language': normalized_language,
        'title': str(parsed.get('title') or f'{normalized_mode.title()} Sprint').strip(),
        'passage': passage,
        'antiCheatHint': str(parsed.get('antiCheatHint') or 'Fresh AI-generated text reduces repetition and memorization.').strip(),
        'provider': 'openai',
        'model': model_name,
    }


def _serialize_live_room(room: Dict[str, Any], viewer_user_id: Optional[int] = None) -> Dict[str, Any]:
    players = []
    for player in room.get('players', []):
        result = room.get('results', {}).get(player['userId'], {})
        players.append(
            {
                'userId': player['userId'],
                'username': player['username'],
                'progress': int(player.get('progress') or 0),
                'currentWpm': float(player.get('currentWpm') or 0),
                'submitted': bool(result),
                'result': result or None,
            }
        )

    spectator_count = max(0, int(room.get('spectators') or 0))
    if viewer_user_id and viewer_user_id not in {player['userId'] for player in room.get('players', [])}:
        spectator_count += 1

    return {
        'id': room['id'],
        'inviteCode': room.get('inviteCode'),
        'status': room['status'],
        'mode': room['mode'],
        'language': room['language'],
        'duration': room['duration'],
        'countdown': room.get('countdown', 3),
        'text': room['text'],
        'players': players,
        'winnerUserId': room.get('winnerUserId'),
        'winnerPrize': float(room.get('winnerPrize') or 0),
        'stakeAmount': float(room.get('stakeAmount') or 0),
        'totalEscrow': float(room.get('totalEscrow') or 0),
        'winnerTakesAll': bool(room.get('winnerTakesAll')),
        'isPrivate': bool(room.get('isPrivate')),
        'hasPassword': bool(room.get('password')),
        'tournamentId': room.get('tournamentId'),
        'spectators': spectator_count,
        'createdAt': room['createdAt'],
        'startedAt': room.get('startedAt'),
        'completedAt': room.get('completedAt'),
    }


def _is_password_hashed(password_value: str) -> bool:
    value = str(password_value or '')
    return value.startswith('pbkdf2:') or value.startswith('scrypt:')


def get_connection() -> pymysql.connections.Connection:
    if not DB_HOST or not DB_USER or not DB_NAME:
        raise RuntimeError('Alwaysdata database environment variables are missing. Set ALWAYSDATA_DB_HOST, ALWAYSDATA_DB_USER, ALWAYSDATA_DB_PASSWORD, and ALWAYSDATA_DB_NAME.')
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + 'Z'


def _now_db() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _normalize_mpesa_phone(raw_phone: str) -> str:
    digits = ''.join(ch for ch in str(raw_phone or '') if ch.isdigit())
    if digits.startswith('0') and len(digits) == 10:
        return '254' + digits[1:]
    if digits.startswith('254') and len(digits) == 12:
        return digits
    if digits.startswith('7') and len(digits) == 9:
        return '254' + digits
    return digits


def _normalize_wallet_destination(method: str, raw_value: Any) -> str:
    value = str(raw_value or '').strip()
    normalized_method = str(method or '').strip().lower()
    if normalized_method == 'mpesa':
        return _normalize_mpesa_phone(value)
    return value


def _mpesa_timestamp() -> str:
    return datetime.utcnow().strftime('%Y%m%d%H%M%S')


def _mpesa_password(timestamp: str) -> str:
    raw = f'{MPESA_SHORTCODE}{MPESA_PASSKEY}{timestamp}'
    return base64.b64encode(raw.encode('utf-8')).decode('utf-8')


def _paypal_access_token() -> str:
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        raise ValueError('PayPal credentials are missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.')

    token_url = f'{PAYPAL_BASE_URL}/v1/oauth2/token'
    credentials = f'{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}'.encode('utf-8')
    auth = base64.b64encode(credentials).decode('utf-8')
    data = urlparse.urlencode({'grant_type': 'client_credentials'}).encode('utf-8')
    req = urlrequest.Request(
        token_url,
        data=data,
        headers={
            'Authorization': f'Basic {auth}',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        method='POST',
    )
    try:
        with urlrequest.urlopen(req, timeout=20) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body or '{}')
            token = parsed.get('access_token')
            if not token:
                raise ValueError('No PayPal access token returned.')
            return token
    except urlerror.HTTPError as exc:
        body = exc.read().decode('utf-8') if exc.fp else ''
        raise ValueError(f'Could not get PayPal access token: {body or exc}') from exc


def _paypal_payout(destination_email: str, amount: float, currency: str) -> Dict[str, Any]:
    token = _paypal_access_token()
    payout_url = f'{PAYPAL_BASE_URL}/v1/payments/payouts'
    sender_batch_id = f'typearena_{int(datetime.utcnow().timestamp() * 1000)}'
    payload = {
        'sender_batch_header': {
            'sender_batch_id': sender_batch_id,
            'email_subject': 'You received a payout from TypeArena',
        },
        'items': [
            {
                'recipient_type': 'EMAIL',
                'amount': {
                    'value': f'{amount:.2f}',
                    'currency': currency.upper(),
                },
                'receiver': destination_email,
                'note': 'TypeArena wallet withdrawal',
                'sender_item_id': sender_batch_id,
            }
        ],
    }
    return _http_json(
        'POST',
        payout_url,
        payload=payload,
        headers={'Authorization': f'Bearer {token}'},
    )


def _http_form(method: str, url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    request_headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    if headers:
        request_headers.update(headers)

    encoded_payload = {key: str(value) for key, value in payload.items() if value is not None}
    data = urlparse.urlencode(encoded_payload).encode('utf-8')
    req = urlrequest.Request(url, data=data, headers=request_headers, method=method)

    try:
        with urlrequest.urlopen(req, timeout=20) as response:
            body = response.read().decode('utf-8')
            return json.loads(body) if body else {}
    except urlerror.HTTPError as exc:
        body = exc.read().decode('utf-8') if exc.fp else ''
        raise ValueError(f'Request failed: {body or exc}') from exc
    except (urlerror.URLError, TimeoutError) as exc:
        raise ValueError(f'Request failed: {exc}') from exc


def _http_json(method: str, url: str, payload: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    request_headers = {'Content-Type': 'application/json'}
    if headers:
        request_headers.update(headers)

    data = json.dumps(payload or {}).encode('utf-8') if payload is not None else None
    req = urlrequest.Request(url, data=data, headers=request_headers, method=method)

    try:
        with urlrequest.urlopen(req, timeout=20) as response:
            body = response.read().decode('utf-8')
            return json.loads(body) if body else {}
    except urlerror.HTTPError as exc:
        body = exc.read().decode('utf-8') if exc.fp else ''
        message = body or str(exc)
        raise ValueError(f'M-Pesa request failed: {message}') from exc
    except (urlerror.URLError, TimeoutError) as exc:
        raise ValueError(f'M-Pesa network error: {exc}') from exc


def _stripe_success_url_with_session() -> str:
    if '{CHECKOUT_SESSION_ID}' in STRIPE_SUCCESS_URL:
        return STRIPE_SUCCESS_URL
    separator = '&' if '?' in STRIPE_SUCCESS_URL else '?'
    return f'{STRIPE_SUCCESS_URL}{separator}session_id={{CHECKOUT_SESSION_ID}}'


def _stripe_amount_minor_units(amount: float, currency: str) -> int:
    zero_decimal_currencies = {'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'}
    multiplier = 1 if currency.upper() in zero_decimal_currencies else 100
    return max(1, int(round(amount * multiplier)))


def _stripe_fetch_checkout_session(session_id: str) -> Dict[str, Any]:
    if not STRIPE_SECRET_KEY:
        raise ValueError('Stripe is not configured. Set STRIPE_SECRET_KEY first.')

    req = urlrequest.Request(
        f'{STRIPE_BASE_URL}/checkout/sessions/{urlparse.quote(session_id)}',
        headers={'Authorization': f'Bearer {STRIPE_SECRET_KEY}'},
        method='GET',
    )
    try:
        with urlrequest.urlopen(req, timeout=20) as response:
            body = response.read().decode('utf-8')
            return json.loads(body) if body else {}
    except urlerror.HTTPError as exc:
        body = exc.read().decode('utf-8') if exc.fp else ''
        raise ValueError(f'Stripe request failed: {body or exc}') from exc
    except (urlerror.URLError, TimeoutError) as exc:
        raise ValueError(f'Stripe request failed: {exc}') from exc


def _stripe_create_checkout_session(user: Dict[str, Any], amount: float, currency: str, tx_code: str) -> Dict[str, Any]:
    if not STRIPE_SECRET_KEY:
        raise ValueError('Stripe is not configured. Set STRIPE_SECRET_KEY first.')

    payload = {
        'mode': 'payment',
        'success_url': _stripe_success_url_with_session(),
        'cancel_url': STRIPE_CANCEL_URL,
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': currency.lower(),
        'line_items[0][price_data][unit_amount]': _stripe_amount_minor_units(amount, currency),
        'line_items[0][price_data][product_data][name]': 'TypeArena Wallet Top-Up',
        'line_items[0][price_data][product_data][description]': f'Wallet deposit for {user.get("username") or user.get("email") or "player"}',
        'metadata[user_id]': str(user['id']),
        'metadata[tx_code]': tx_code,
    }
    if user.get('email'):
        payload['customer_email'] = str(user['email']).strip()

    return _http_form(
        'POST',
        f'{STRIPE_BASE_URL}/checkout/sessions',
        payload=payload,
        headers={'Authorization': f'Bearer {STRIPE_SECRET_KEY}'},
    )


def _verify_stripe_webhook_signature(payload: bytes, signature_header: str) -> None:
    if not STRIPE_WEBHOOK_SECRET:
        raise ValueError('Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET first.')
    if not signature_header:
        raise ValueError('Missing Stripe-Signature header.')

    parts = {}
    for item in signature_header.split(','):
        if '=' not in item:
            continue
        key, value = item.split('=', 1)
        parts.setdefault(key.strip(), []).append(value.strip())

    timestamp_text = next(iter(parts.get('t', [])), '')
    signatures = parts.get('v1', [])
    if not timestamp_text or not signatures:
        raise ValueError('Invalid Stripe-Signature header.')

    try:
        timestamp = int(timestamp_text)
    except ValueError as exc:
        raise ValueError('Invalid Stripe signature timestamp.') from exc

    if abs(time.time() - timestamp) > 300:
        raise ValueError('Stripe signature timestamp is outside the allowed tolerance.')

    signed_payload = f'{timestamp_text}.{payload.decode("utf-8")}'.encode('utf-8')
    expected_signature = hmac.new(
        STRIPE_WEBHOOK_SECRET.encode('utf-8'),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()

    if not any(hmac.compare_digest(expected_signature, candidate) for candidate in signatures):
        raise ValueError('Stripe signature verification failed.')


def _fulfill_stripe_checkout_session(cur, stripe_session: Dict[str, Any]) -> tuple[str, Optional[Dict[str, Any]]]:
    session_id = str(stripe_session.get('id') or '').strip()
    if not session_id:
        raise ValueError('Stripe session id is missing.')

    cur.execute('SELECT * FROM mpesa_transactions WHERE checkout_request_id = %s FOR UPDATE', (session_id,))
    tx = cur.fetchone()
    if not tx:
        raise ValueError('Top-up session not found.')

    tx_status = str(tx.get('status') or '').lower()
    if tx_status == 'completed':
        cur.execute('SELECT * FROM users WHERE id = %s', (tx['user_id'],))
        return 'already_completed', cur.fetchone()

    payment_status = str(stripe_session.get('payment_status') or '').lower()
    session_status = str(stripe_session.get('status') or '').lower()

    if payment_status == 'paid':
        cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (float(tx.get('amount') or 0), tx['user_id']))
        cur.execute(
            '''
            UPDATE mpesa_transactions
            SET status='completed', completed_at=%s
            WHERE id=%s
            ''',
            (_now_db(), tx['id']),
        )
        cur.execute('SELECT * FROM users WHERE id = %s', (tx['user_id'],))
        return 'completed', cur.fetchone()

    if session_status == 'expired':
        cur.execute(
            '''
            UPDATE mpesa_transactions
            SET status='failed', failed_at=%s, result_desc=%s
            WHERE id=%s
            ''',
            (_now_db(), f'Stripe session {session_status}', tx['id']),
        )
        return 'failed', None

    return 'pending', None


def _mpesa_access_token() -> str:
    if not MPESA_CONSUMER_KEY or not MPESA_CONSUMER_SECRET:
        raise ValueError('M-Pesa credentials are missing. Set MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.')

    token_url = f'{MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials'
    credentials = f'{MPESA_CONSUMER_KEY}:{MPESA_CONSUMER_SECRET}'.encode('utf-8')
    auth = base64.b64encode(credentials).decode('utf-8')
    req = urlrequest.Request(token_url, headers={'Authorization': f'Basic {auth}'}, method='GET')

    try:
        with urlrequest.urlopen(req, timeout=20) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body or '{}')
            token = parsed.get('access_token')
            if not token:
                raise ValueError('No access token returned by M-Pesa.')
            return token
    except urlerror.HTTPError as exc:
        body = exc.read().decode('utf-8') if exc.fp else ''
        raise ValueError(f'Could not get M-Pesa access token: {body or exc}') from exc


def _mpesa_stk_push(phone_number: str, amount: float, account_reference: str, description: str) -> Dict[str, Any]:
    token = _mpesa_access_token()
    timestamp = _mpesa_timestamp()

    payload = {
        'BusinessShortCode': MPESA_SHORTCODE,
        'Password': _mpesa_password(timestamp),
        'Timestamp': timestamp,
        'TransactionType': 'CustomerPayBillOnline',
        'Amount': int(round(amount)),
        'PartyA': phone_number,
        'PartyB': MPESA_SHORTCODE,
        'PhoneNumber': phone_number,
        'CallBackURL': MPESA_CALLBACK_URL,
        'AccountReference': account_reference,
        'TransactionDesc': description,
    }

    url = f'{MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest'
    return _http_json('POST', url, payload=payload, headers={'Authorization': f'Bearer {token}'})


def _mpesa_b2c_payout(phone_number: str, amount: float, remarks: str, occasion: str) -> Dict[str, Any]:
    token = _mpesa_access_token()
    payload = {
        'InitiatorName': MPESA_B2C_INITIATOR_NAME,
        'SecurityCredential': MPESA_B2C_SECURITY_CREDENTIAL,
        'CommandID': 'BusinessPayment',
        'Amount': int(round(amount)),
        'PartyA': MPESA_B2C_SHORTCODE,
        'PartyB': phone_number,
        'Remarks': remarks,
        'QueueTimeOutURL': MPESA_B2C_TIMEOUT_URL,
        'ResultURL': MPESA_B2C_RESULT_URL,
        'Occasion': occasion,
    }

    url = f'{MPESA_BASE_URL}/mpesa/b2c/v1/paymentrequest'
    return _http_json('POST', url, payload=payload, headers={'Authorization': f'Bearer {token}'})


def _wallet_capabilities() -> Dict[str, Any]:
    stripe_ready = bool(STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET)
    mpesa_topup_ready = bool(
        not MPESA_SIMULATE
        and MPESA_CONSUMER_KEY
        and MPESA_CONSUMER_SECRET
        and MPESA_PASSKEY
        and MPESA_CALLBACK_URL
    )
    mpesa_withdraw_ready = bool(
        mpesa_topup_ready
        and MPESA_B2C_INITIATOR_NAME
        and MPESA_B2C_SECURITY_CREDENTIAL
        and MPESA_B2C_RESULT_URL
        and MPESA_B2C_TIMEOUT_URL
    )
    paypal_ready = bool(PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET)

    top_up_methods = []
    withdraw_methods = []
    if stripe_ready:
        top_up_methods.append('stripe_checkout')
    if mpesa_topup_ready:
        top_up_methods.append('mpesa')
    if paypal_ready:
        withdraw_methods.append('paypal')
    if mpesa_withdraw_ready:
        withdraw_methods.append('mpesa')

    return {
        'topUpMethods': top_up_methods,
        'withdrawMethods': withdraw_methods,
        'stripeReady': stripe_ready,
        'mpesaTopupReady': mpesa_topup_ready,
        'mpesaWithdrawReady': mpesa_withdraw_ready,
        'paypalReady': paypal_ready,
        'simulatedPaymentsEnabled': False,
    }


def _safe_user(user: Dict[str, Any], conn=None) -> Dict[str, Any]:
    total_races = int(user.get('total_races') or 0)
    wins = int(user.get('wins') or 0)
    owned_items = _owned_store_items_for_user(conn, int(user.get('id') or 0)) if conn else []
    return {
        'id': user['id'],
        'username': user['username'],
        'email': user['email'],
        'phoneNumber': user.get('phone_number') or '',
        'wpm': float(user.get('wpm') or 0),
        'accuracy': float(user.get('accuracy') or 0),
        'totalRaces': total_races,
        'wins': wins,
        'balance': float(user.get('balance') or 0),
        'tier': _tier_for_user(user),
        'season': _season_name(),
        'seasonPoints': _season_points_for_user(user),
        'premium': wins >= 10 or float(user.get('balance') or 0) >= 5000,
        'aiCoachTip': _coach_tip_for_user(user),
        'ownedStoreItems': owned_items,
        'equippedItems': {
            'avatar': user.get('equipped_avatar') or '',
            'theme': user.get('equipped_theme') or '',
            'skin': user.get('equipped_skin') or '',
            'badge': user.get('equipped_badge') or '',
            'effect': user.get('equipped_effect') or '',
            'frame': user.get('equipped_frame') or '',
        },
    }


def _serialize_tournament(row: Dict[str, Any]) -> Dict[str, Any]:
    entry_fee = float(row.get('entry_fee') or 0)
    prize_pool = float(row.get('prize_pool') or 0)
    match_size = int(row.get('match_size') or row.get('max_participants') or TOURNAMENT_MATCH_SIZE)
    total_player_stake = round(entry_fee * match_size, 2)
    winner_share = WINNER_PRIZE_SHARE
    status = _computed_tournament_status(row)
    start_time = row.get('start_time')
    end_time = start_time + timedelta(seconds=_duration_to_seconds(row.get('duration'))) if start_time else None
    return {
        'id': int(row['id']),
        'name': row['name'],
        'description': row.get('description') or '',
        'entryFee': entry_fee,
        'cost': entry_fee,
        'prizePool': prize_pool,
        'totalPlayerStake': total_player_stake,
        'winnerPrize': round(total_player_stake * winner_share, 2),
        'winnerShare': winner_share,
        'participants': int(row.get('participants') or 0),
        'maxParticipants': int(row.get('max_participants') or 0),
        'matchSize': match_size,
        'waitingPlayers': int(row.get('waiting_players') or 0),
        'status': status,
        'startTime': start_time.isoformat() + 'Z' if start_time else None,
        'endTime': end_time.isoformat() + 'Z' if end_time else None,
        'duration': row.get('duration') or '60s',
        'image': row.get('image') or '??',
    }


def _fetch_tournament_with_counts(cur, tournament_id: int, lock: bool = False) -> Optional[Dict[str, Any]]:
    query = '''
        SELECT
            t.*,
            t.max_participants AS match_size,
            (
                SELECT COUNT(*)
                FROM tournament_joins tj
                WHERE tj.tournament_id = t.id AND tj.paid_amount > 0
            ) AS participants,
            (
                SELECT COUNT(*)
                FROM tournament_joins tj
                WHERE tj.tournament_id = t.id AND tj.paid_amount = 0
            ) AS waiting_players
        FROM tournaments t
        WHERE t.id = %s
    '''
    if lock:
        query += ' FOR UPDATE'
    cur.execute(query, (tournament_id,))
    return cur.fetchone()


def _fetch_all_tournaments(cur) -> list[Dict[str, Any]]:
    cur.execute(
        '''
        SELECT
            t.*,
            t.max_participants AS match_size,
            (
                SELECT COUNT(*)
                FROM tournament_joins tj
                WHERE tj.tournament_id = t.id AND tj.paid_amount > 0
            ) AS participants,
            (
                SELECT COUNT(*)
                FROM tournament_joins tj
                WHERE tj.tournament_id = t.id AND tj.paid_amount = 0
            ) AS waiting_players
        FROM tournaments t
        ORDER BY t.id DESC
        ''',
    )
    return cur.fetchall()


def _record_prize_wallet_credit(
    cur,
    *,
    user_id: int,
    amount: float,
    tournament_id: Optional[int],
    phone_number: str = '',
    payout_code_prefix: str = 'payout',
) -> Dict[str, Any]:
    payout_code = f'{payout_code_prefix}_{int(datetime.utcnow().timestamp() * 1000)}_{secrets.token_hex(3)}'
    cur.execute(
        '''
        INSERT INTO prize_payouts
        (payout_code, user_id, tournament_id, phone_number, amount, status, mode, created_at, completed_at)
        VALUES (%s, %s, %s, %s, %s, 'completed', 'simulated', %s, %s)
        ''',
        (payout_code, user_id, tournament_id, phone_number, amount, _now_db(), _now_db()),
    )
    cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (amount, user_id))
    cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
    return cur.fetchone()


def _debit_user_balance(cur, *, user_id: int, amount: float) -> Dict[str, Any]:
    cur.execute('SELECT * FROM users WHERE id = %s FOR UPDATE', (user_id,))
    user = cur.fetchone()
    if not user:
        raise ValueError('User not found.')
    balance = float(user.get('balance') or 0)
    if balance < amount:
        raise ValueError(f'Insufficient funds. You need KES {amount:.2f} in your wallet.')
    cur.execute('UPDATE users SET balance = balance - %s WHERE id = %s', (amount, user_id))
    cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
    return cur.fetchone()


def _credit_admin_tournament_share(cur, *, tournament: Dict[str, Any]) -> float:
    if not ADMIN_EMAIL:
        return 0.0

    match_size = int(tournament.get('match_size') or tournament.get('max_participants') or TOURNAMENT_MATCH_SIZE)
    winner_share = WINNER_PRIZE_SHARE
    admin_share = round(float(tournament.get('entry_fee') or 0) * match_size * (1 - winner_share), 2)
    if admin_share <= 0:
        return 0.0

    cur.execute('SELECT * FROM users WHERE LOWER(email)=LOWER(%s)', (ADMIN_EMAIL,))
    admin_user = cur.fetchone()
    if not admin_user:
        return 0.0

    cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (admin_share, admin_user['id']))
    return admin_share


def _apply_user_performance_update(
    cur,
    *,
    user_id: int,
    username: str,
    race_code: str,
    wpm: float,
    accuracy: float,
    duration: Any,
    earnings: float,
    did_win: bool,
) -> Dict[str, Any]:
    now_dt = datetime.utcnow()
    cur.execute(
        '''
        INSERT INTO race_history
        (race_code, user_id, username, wpm, accuracy, duration, place_position, earnings, race_timestamp)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            wpm = VALUES(wpm),
            accuracy = VALUES(accuracy),
            duration = VALUES(duration),
            place_position = VALUES(place_position),
            earnings = VALUES(earnings),
            race_timestamp = VALUES(race_timestamp)
        ''',
        (race_code, user_id, username, round(wpm, 1), round(accuracy, 1), duration, 1 if did_win else 2, earnings, now_dt),
    )
    cur.execute(
        '''
        SELECT
            COUNT(*) AS total_races,
            COALESCE(SUM(CASE WHEN place_position = 1 THEN 1 ELSE 0 END), 0) AS wins,
            COALESCE(AVG(wpm), 0) AS avg_wpm,
            COALESCE(AVG(accuracy), 0) AS avg_accuracy
        FROM race_history
        WHERE user_id = %s
        ''',
        (user_id,),
    )
    stats = cur.fetchone() or {}
    cur.execute(
        '''
        UPDATE users
        SET total_races=%s, wins=%s, wpm=%s, accuracy=%s
        WHERE id=%s
        ''',
        (
            int(stats.get('total_races') or 0),
            int(stats.get('wins') or 0),
            round(float(stats.get('avg_wpm') or 0), 1),
            round(float(stats.get('avg_accuracy') or 0), 1),
            user_id,
        ),
    )
    cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
    return cur.fetchone()


def _persist_completed_live_race(room: Dict[str, Any]) -> None:
    if room.get('resultsPersisted'):
        return

    player_ids = [player['userId'] for player in room.get('players', [])]
    results = room.get('results', {})
    if not player_ids or any(player_id not in results for player_id in player_ids):
        return

    winner_user_id = room.get('winnerUserId')
    winner_prize = float(room.get('winnerPrize') or 0)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for player in room.get('players', []):
                user_id = int(player['userId'])
                result = results.get(user_id, {})
                _apply_user_performance_update(
                    cur,
                    user_id=user_id,
                    username=str(player.get('username') or result.get('username') or 'Player'),
                    race_code=f'live_{room["id"]}_{user_id}',
                    wpm=float(result.get('wpm') or 0),
                    accuracy=float(result.get('accuracy') or 0),
                    duration=room.get('duration'),
                    earnings=winner_prize if user_id == winner_user_id else 0,
                    did_win=user_id == winner_user_id,
                )
        conn.commit()
        room['resultsPersisted'] = True
    finally:
        conn.close()


def _complete_live_race_if_ready(room: Dict[str, Any]) -> None:
    player_ids = [player['userId'] for player in room.get('players', [])]
    if len(player_ids) < 2:
        return
    results = room.get('results', {})
    if any(player_id not in results for player_id in player_ids):
        return

    def result_sort_key(player_id: int):
        result = results[player_id]
        return (float(result.get('wpm') or 0), float(result.get('accuracy') or 0), -float(result.get('finishedAtTs') or 0))

    winner_user_id = max(player_ids, key=result_sort_key)
    room['winnerUserId'] = winner_user_id
    room['status'] = 'completed'
    room['completedAt'] = _now_iso()

    escrow_total = float(room.get('totalEscrow') or 0)
    winner_prize = escrow_total if room.get('isPrivate') and escrow_total > 0 else float(room.get('winnerPrize') or 0)
    if winner_prize <= 0:
        return

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM users WHERE id=%s', (winner_user_id,))
            winner = cur.fetchone()
            if not winner:
                return
            updated_winner = _record_prize_wallet_credit(
                cur,
                user_id=winner_user_id,
                amount=winner_prize,
                tournament_id=room.get('tournamentId'),
                phone_number=str(winner.get('phone_number') or ''),
                payout_code_prefix='livewin',
            )
        conn.commit()
        room['winner'] = _safe_user(updated_winner)
        room['winnerPrize'] = winner_prize
    finally:
        conn.close()

    _persist_completed_live_race(room)


def _get_recent_wallet_history(cur, user_id: int) -> Dict[str, Any]:
    cur.execute(
        '''
        SELECT tx_code AS code, amount, status, mode, created_at, completed_at, 'topup' AS kind
        FROM mpesa_transactions
        WHERE user_id=%s
        ORDER BY created_at DESC
        LIMIT 20
        ''',
        (user_id,),
    )
    topups = cur.fetchall()

    cur.execute(
        '''
        SELECT payout_code AS code, amount, status, mode, created_at, completed_at, phone_number
        FROM prize_payouts
        WHERE user_id=%s
        ORDER BY created_at DESC
        LIMIT 20
        ''',
        (user_id,),
    )
    payouts = cur.fetchall()

    history = []
    for row in topups:
        history.append(
            {
                'code': row['code'],
                'type': 'topup',
                'amount': float(row.get('amount') or 0),
                'status': row.get('status'),
                'mode': row.get('mode'),
                'createdAt': row['created_at'].isoformat() + 'Z' if row.get('created_at') else None,
                'completedAt': row['completed_at'].isoformat() + 'Z' if row.get('completed_at') else None,
            }
        )

    for row in payouts:
        payout_code = str(row.get('code') or '')
        payout_type = 'withdrawal' if payout_code.startswith('withdraw_') else 'payout'
        history.append(
            {
                'code': payout_code,
                'type': payout_type,
                'amount': float(row.get('amount') or 0),
                'status': row.get('status'),
                'mode': row.get('mode'),
                'phoneNumber': row.get('phone_number') or '',
                'createdAt': row['created_at'].isoformat() + 'Z' if row.get('created_at') else None,
                'completedAt': row['completed_at'].isoformat() + 'Z' if row.get('completed_at') else None,
            }
        )

    history.sort(key=lambda item: item.get('createdAt') or '', reverse=True)
    return {'items': history[:20]}


def _find_live_room_by_invite(invite_code: str) -> Optional[Dict[str, Any]]:
    normalized = str(invite_code or '').strip().upper()
    if not normalized:
        return None
    for room in LIVE_RACE_ROOMS.values():
        if str(room.get('inviteCode') or '').upper() == normalized:
            return room
    return None


def _get_user_from_header(conn) -> Optional[Dict[str, Any]]:
    raw_user_id = request.headers.get('X-User-Id')
    if not raw_user_id:
        return None
    try:
        user_id = int(raw_user_id)
    except ValueError:
        return None

    with conn.cursor() as cur:
        cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
        return cur.fetchone()


def _is_admin_request() -> bool:
    token = request.headers.get('X-Admin-Token', '')
    return token in ADMIN_TOKENS


@app.get('/api/health')
def health():
    return jsonify({'ok': True, 'service': 'typearena-backend', 'storage': 'mysql'})


@app.post('/api/admin/login')
def admin_login():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email', '')).strip().lower()
    password = str(payload.get('password', '')).strip()

    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        return jsonify({'message': 'Admin credentials are not configured on the server.'}), 500

    if email != ADMIN_EMAIL.lower() or password != ADMIN_PASSWORD:
        return jsonify({'message': 'Invalid admin credentials'}), 401

    token = secrets.token_urlsafe(24)
    ADMIN_TOKENS.add(token)
    return jsonify({'token': token, 'adminEmail': ADMIN_EMAIL})


@app.post('/api/admin/tournaments')
def admin_create_tournament():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name', '')).strip()
    description = str(payload.get('description', '')).strip()
    duration = str(payload.get('duration', '')).strip() or '5d'
    image = str(payload.get('image', '')).strip() or '??'
    status = str(payload.get('status', 'upcoming')).strip().lower()
    start_time_raw = str(payload.get('startTime', '')).strip()

    try:
        entry_fee = float(payload.get('entryFee', 0))
        prize_pool = float(payload.get('prizePool', 0))
        max_participants = max(TOURNAMENT_MATCH_SIZE, int(payload.get('maxParticipants', 0)))
    except (TypeError, ValueError):
        return jsonify({'message': 'entryFee, prizePool and maxParticipants must be valid numbers.'}), 400

    if not name:
        return jsonify({'message': 'Tournament name is required.'}), 400
    if entry_fee < 0 or prize_pool < 0 or max_participants <= 0:
        return jsonify({'message': 'Provide valid entry fee, prize pool, and max participants.'}), 400
    if status not in {'upcoming', 'active', 'completed'}:
        return jsonify({'message': 'Invalid status.'}), 400

    start_time = datetime.utcnow()
    if start_time_raw:
        try:
            start_time = datetime.fromisoformat(start_time_raw.replace('Z', ''))
        except ValueError:
            start_time = datetime.utcnow()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                INSERT INTO tournaments
                (name, description, entry_fee, prize_pool, participants, max_participants, status, start_time, duration, image)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''',
                (name, description, entry_fee, prize_pool, 0, max_participants, status, start_time, duration, image),
            )
            tournament_id = cur.lastrowid
            tournament = _fetch_tournament_with_counts(cur, tournament_id)
        conn.commit()
        return jsonify({'message': 'Tournament created successfully.', 'tournament': _serialize_tournament(tournament)}), 201
    finally:
        conn.close()


@app.delete('/api/admin/tournaments/<int:tournament_id>')
def admin_delete_tournament(tournament_id: int):
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            tournament = _fetch_tournament_with_counts(cur, tournament_id, lock=True)
            if not tournament:
                return jsonify({'message': 'Tournament not found.'}), 404

            participants = int(tournament.get('participants') or 0)
            if participants > 0:
                return jsonify({'message': 'This tournament already has paid participants and cannot be deleted.'}), 400

            cur.execute('DELETE FROM tournaments WHERE id = %s', (tournament_id,))
        conn.commit()
        return jsonify({'message': 'Tournament deleted successfully.'})
    finally:
        conn.close()


@app.delete('/api/admin/tournaments')
def admin_delete_all_tournaments():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT t.id
                FROM tournaments t
                WHERE EXISTS (
                    SELECT 1
                    FROM tournament_joins tj
                    WHERE tj.tournament_id = t.id AND tj.paid_amount > 0
                )
                LIMIT 1
                '''
            )
            protected_tournament = cur.fetchone()
            if protected_tournament:
                return jsonify({'message': 'Some tournaments already have paid participants and cannot be cleared in bulk.'}), 400

            cur.execute('SELECT COUNT(*) AS total FROM tournaments')
            total_row = cur.fetchone() or {}
            total_deleted = int(total_row.get('total') or 0)
            cur.execute('DELETE FROM tournaments')
        conn.commit()
        return jsonify({'message': f'Cleared {total_deleted} tournament{"s" if total_deleted != 1 else ""}.', 'deletedCount': total_deleted})
    finally:
        conn.close()


@app.get('/api/admin/analytics')
def admin_analytics():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT COALESCE(SUM(paid_amount), 0) AS revenue_today, COUNT(*) AS entries_today
                FROM tournament_joins
                WHERE paid_amount > 0 AND joined_at >= %s
                ''',
                (today_start,),
            )
            revenue = cur.fetchone() or {}

            cur.execute(
                '''
                SELECT COALESCE(SUM(amount), 0) AS payouts_total
                FROM prize_payouts
                WHERE payout_code NOT LIKE 'withdraw_%%'
                '''
            )
            payouts = cur.fetchone() or {}

            cur.execute(
                '''
                SELECT COUNT(*) AS active_players
                FROM users
                WHERE updated_at >= %s
                ''',
                (datetime.utcnow() - timedelta(days=7),),
            )
            active_players = cur.fetchone() or {}

            cur.execute(
                '''
                SELECT
                    COUNT(*) AS total_transactions,
                    COALESCE(SUM(CASE WHEN status='completed' THEN amount ELSE 0 END), 0) AS completed_volume
                FROM mpesa_transactions
                '''
            )
            transactions = cur.fetchone() or {}

            cur.execute(
                '''
                SELECT username, wpm, wins
                FROM users
                ORDER BY wpm DESC, wins DESC
                LIMIT 5
                '''
            )
            top_players = cur.fetchall()

            cur.execute('SELECT COUNT(*) AS total_users, COALESCE(SUM(balance), 0) AS wallet_float FROM users')
            user_totals = cur.fetchone() or {}

            cur.execute(
                '''
                SELECT COALESCE(AVG(participants), 0) AS avg_tournament_size
                FROM tournaments
                '''
            )
            avg_tournament = cur.fetchone() or {}

        total_users = max(1, int(user_totals.get('total_users') or 1))
        revenue_today = float(revenue.get('revenue_today') or 0)
        payouts_total = float(payouts.get('payouts_total') or 0)
        active_players_count = int(active_players.get('active_players') or 0)
        mpesa_volume = float(transactions.get('completed_volume') or 0)
        referral_conversion = min(0.62, active_players_count / total_users / 2 if total_users else 0)
        retention = min(0.88, active_players_count / total_users if total_users else 0)
        churn = max(0.0, 1 - retention)
        arpu = revenue_today / total_users if total_users else 0
        payout_ratio = payouts_total / mpesa_volume if mpesa_volume else 0
        cac = 45 + (revenue_today * 0.02)
        return jsonify(
            {
                'revenueToday': revenue_today,
                'tournamentEntries': int(revenue.get('entries_today') or 0),
                'totalPayouts': payouts_total,
                'activePlayers': active_players_count,
                'mpesaTransactions': int(transactions.get('total_transactions') or 0),
                'mpesaVolume': mpesa_volume,
                'dailyActiveUsers': active_players_count,
                'retention': round(retention, 3),
                'averageTournamentSize': round(float(avg_tournament.get('avg_tournament_size') or 0), 2),
                'arpu': round(arpu, 2),
                'payoutRatio': round(payout_ratio, 3),
                'referralConversion': round(referral_conversion, 3),
                'churn': round(churn, 3),
                'cac': round(cac, 2),
                'walletFloat': float(user_totals.get('wallet_float') or 0),
                'topPlayers': [
                    {
                        'username': row['username'],
                        'wpm': float(row.get('wpm') or 0),
                        'wins': int(row.get('wins') or 0),
                    }
                    for row in top_players
                ],
            }
        )
    finally:
        conn.close()


@app.get('/api/admin/ai-settings')
def admin_ai_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    settings = _current_ai_settings()
    settings['hasApiKey'] = bool(OPENAI_API_KEY)
    return jsonify(settings)


@app.put('/api/admin/ai-settings')
def admin_update_ai_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    provider = str(payload.get('provider') or AI_SETTINGS.get('provider') or 'auto').strip().lower()
    model = str(payload.get('model') or AI_SETTINGS.get('model') or OPENAI_MODEL).strip()

    if provider not in {'auto', 'openai', 'local'}:
        return jsonify({'message': 'Invalid AI provider. Use auto, openai, or local.'}), 400
    if not model:
        return jsonify({'message': 'Model is required.'}), 400

    AI_SETTINGS['provider'] = provider
    AI_SETTINGS['model'] = model
    settings = _current_ai_settings()
    settings['hasApiKey'] = bool(OPENAI_API_KEY)
    return jsonify({'message': 'AI content settings updated.', 'settings': settings})


@app.post('/api/auth/signup')
def auth_signup():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get('username', '')).strip()
    email = str(payload.get('email', '')).strip().lower()
    password = str(payload.get('password', '')).strip()
    phone_number = str(payload.get('phoneNumber', '')).strip()

    if not username or not email or not password:
        return jsonify({'message': 'username, email, and password are required'}), 400

    conn = get_connection()
    try:
        hashed_password = generate_password_hash(password)
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM users WHERE LOWER(email)=LOWER(%s)', (email,))
            if cur.fetchone():
                return jsonify({'message': 'An account with this email already exists'}), 409

            cur.execute(
                '''
                INSERT INTO users
                (username, email, password, phone_number, wpm, accuracy, total_races, wins, balance)
                VALUES (%s, %s, %s, %s, 0, 0, 0, 0, 0)
                ''',
                (username, email, hashed_password, phone_number),
            )
            user_id = cur.lastrowid
            cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
            user = cur.fetchone()
        conn.commit()
        return jsonify(_safe_user(user, conn)), 201
    finally:
        conn.close()


@app.post('/api/auth/login')
def auth_login():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email', '')).strip().lower()
    password = str(payload.get('password', '')).strip()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM users WHERE LOWER(email)=LOWER(%s)', (email,))
            user = cur.fetchone()

            if not user:
                return jsonify({'message': 'Invalid email or password'}), 401

            stored_password = str(user.get('password') or '')
            valid = False

            if _is_password_hashed(stored_password):
                valid = check_password_hash(stored_password, password)
            else:
                # Backward compatibility for legacy plaintext passwords.
                valid = stored_password == password
                if valid:
                    upgraded_hash = generate_password_hash(password)
                    cur.execute('UPDATE users SET password=%s WHERE id=%s', (upgraded_hash, user['id']))
                    user['password'] = upgraded_hash

        if not valid:
            return jsonify({'message': 'Invalid email or password'}), 401

        conn.commit()
        return jsonify(_safe_user(user, conn))
    finally:
        conn.close()


@app.get('/api/user/me')
def user_me():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        return jsonify(_safe_user(user, conn))
    finally:
        conn.close()


@app.get('/api/wallet/history')
def wallet_history():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        with conn.cursor() as cur:
            history = _get_recent_wallet_history(cur, user['id'])
        return jsonify(history)
    finally:
        conn.close()


@app.get('/api/wallet/config')
def wallet_config():
    return jsonify(_wallet_capabilities())


@app.post('/api/wallet/withdraw')
def wallet_withdraw():
    payload = request.get_json(silent=True) or {}
    amount = payload.get('amount')

    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid amount'}), 400

    if amount_value <= 0:
        return jsonify({'message': 'Amount must be greater than zero'}), 400

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        capabilities = _wallet_capabilities()
        payout_method = str(payload.get('payoutMethod') or payload.get('paymentMethod') or 'paypal').strip().lower()
        if payout_method not in set(capabilities['withdrawMethods']):
            return jsonify({'message': f'{payout_method.replace("_", " ").title()} withdrawals are not enabled right now.'}), 400
        currency = str(payload.get('currency') or 'USD').strip().upper()
        payout_destination = _normalize_wallet_destination(
            payout_method,
            payload.get('accountIdentifier') or payload.get('phoneNumber') or user.get('phone_number') or user.get('email'),
        )
        if not payout_destination:
            return jsonify({'message': 'A valid payout destination is required.'}), 400

        total_debit = amount_value + WITHDRAWAL_FEE
        current_balance = float(user.get('balance') or 0)
        if current_balance < total_debit:
            return jsonify({'message': f'Insufficient balance. You need KES {total_debit:.2f} including the KES {WITHDRAWAL_FEE:.2f} fee.'}), 400

        payout_status = 'pending'
        payout_mode = 'live'
        try:
            if payout_method == 'paypal':
                _paypal_payout(payout_destination, amount_value, currency)
            elif payout_method == 'mpesa':
                _mpesa_b2c_payout(
                    phone_number=_normalize_mpesa_phone(payout_destination),
                    amount=amount_value,
                    remarks='TypeArena withdrawal',
                    occasion='TypeArena payout',
                )
            else:
                return jsonify({'message': 'Unsupported withdrawal method.'}), 400
        except ValueError as exc:
            return jsonify({'message': str(exc)}), 400

        with conn.cursor() as cur:
            cur.execute('UPDATE users SET balance = balance - %s WHERE id = %s', (total_debit, user['id']))
            cur.execute(
                '''
                INSERT INTO prize_payouts
                (payout_code, user_id, tournament_id, phone_number, amount, status, mode, created_at, completed_at)
                VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s)
                ''',
                (
                    f'withdraw_{int(datetime.utcnow().timestamp() * 1000)}',
                    user['id'],
                    payout_destination,
                    amount_value,
                    payout_status,
                    payout_mode,
                    _now_db(),
                    None,
                ),
            )
            cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
            updated_user = cur.fetchone()
        conn.commit()
        return jsonify(
            {
                'message': f'Withdrawal sent via {payout_method.replace("_", " ").title()}. KES {WITHDRAWAL_FEE:.0f} fee deducted.',
                'fee': WITHDRAWAL_FEE,
                'amount': amount_value,
                'currency': currency,
                'payoutMethod': payout_method,
                'user': _safe_user(updated_user),
            }
        )
    finally:
        conn.close()


@app.post('/api/wallet/topup')
def wallet_topup():
    payload = request.get_json(silent=True) or {}
    amount = payload.get('amount')

    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid amount'}), 400

    if amount_value <= 0:
        return jsonify({'message': 'Amount must be greater than zero'}), 400

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        capabilities = _wallet_capabilities()
        payment_method = str(payload.get('paymentMethod') or 'stripe_checkout').strip().lower()
        if payment_method not in set(capabilities['topUpMethods']):
            return jsonify({'message': f'{payment_method.replace("_", " ").title()} top-up is not enabled right now.'}), 400
        currency = str(payload.get('currency') or 'USD').strip().upper()
        account_identifier = _normalize_wallet_destination(
            payment_method,
            payload.get('accountIdentifier') or payload.get('phoneNumber') or user.get('phone_number') or user.get('email'),
        )
        if not account_identifier:
            return jsonify({'message': 'A valid payment account is required.'}), 400

        tx_code = f'topup_{int(datetime.utcnow().timestamp() * 1000)}'

        if payment_method in {'stripe_checkout', 'stripe', 'card'} and STRIPE_SECRET_KEY:
            try:
                stripe_session = _stripe_create_checkout_session(user, amount_value, currency, tx_code)
            except ValueError as exc:
                return jsonify({'message': str(exc)}), 400

            with conn.cursor() as cur:
                cur.execute(
                    '''
                    INSERT INTO mpesa_transactions
                    (tx_code, user_id, phone_number, amount, status, mode, checkout_request_id, merchant_request_id, created_at)
                    VALUES (%s, %s, %s, %s, 'pending', 'live', %s, %s, %s)
                    ''',
                    (
                        tx_code,
                        user['id'],
                        account_identifier,
                        amount_value,
                        stripe_session.get('id'),
                        stripe_session.get('payment_intent'),
                        _now_db(),
                    ),
                )
            conn.commit()
            return jsonify(
                {
                    'message': 'Secure checkout created. Complete payment to add funds to your wallet.',
                    'status': 'pending',
                    'currency': currency,
                    'paymentMethod': 'stripe_checkout',
                    'checkoutUrl': stripe_session.get('url'),
                    'sessionId': stripe_session.get('id'),
                }
            )

        if payment_method != 'mpesa':
            return jsonify({'message': 'Unsupported top-up method.'}), 400

        phone_number = _normalize_mpesa_phone(account_identifier)
        if not phone_number:
            return jsonify({'message': 'A valid M-Pesa phone number is required.'}), 400

        account_reference = f'TYPEARENA_TOPUP_{user["id"]}'
        try:
            stk_response = _mpesa_stk_push(
                phone_number=phone_number,
                amount=amount_value,
                account_reference=account_reference,
                description='TypeArena wallet top-up',
            )
        except ValueError as exc:
            return jsonify({'message': str(exc)}), 400

        response_code = stk_response.get('ResponseCode')
        if response_code != '0':
            return jsonify({'message': stk_response.get('errorMessage') or stk_response.get('ResponseDescription') or 'M-Pesa top-up request failed.'}), 400

        with conn.cursor() as cur:
            cur.execute(
                '''
                INSERT INTO mpesa_transactions
                (tx_code, user_id, phone_number, amount, status, mode, checkout_request_id, merchant_request_id, created_at)
                VALUES (%s, %s, %s, %s, 'pending', 'live', %s, %s, %s)
                ''',
                (
                    tx_code,
                    user['id'],
                    phone_number,
                    amount_value,
                    stk_response.get('CheckoutRequestID'),
                    stk_response.get('MerchantRequestID'),
                    _now_db(),
                ),
            )
        conn.commit()

        return jsonify(
            {
                'message': 'M-Pesa prompt sent. Complete payment on your phone to finish top-up.',
                'status': 'pending',
                'mpesa': stk_response,
            }
        )
    finally:
        conn.close()


@app.post('/api/mpesa/callback/topup')
def mpesa_topup_callback():
    payload = request.get_json(silent=True) or {}
    callback = payload.get('Body', {}).get('stkCallback', {})
    checkout_request_id = callback.get('CheckoutRequestID')
    result_code = callback.get('ResultCode')
    callback_items = callback.get('CallbackMetadata', {}).get('Item', []) if callback.get('CallbackMetadata') else []
    callback_values = {item.get('Name'): item.get('Value') for item in callback_items if isinstance(item, dict)}

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM mpesa_transactions WHERE checkout_request_id = %s', (checkout_request_id,))
            tx = cur.fetchone()
            if not tx:
                return jsonify({'ResultCode': 0, 'ResultDesc': 'Ignored: unknown checkout request.'})

            if int(result_code or 1) == 0:
                amount_value = float(callback_values.get('Amount', tx.get('amount', 0) or 0))
                cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (amount_value, tx['user_id']))
                cur.execute(
                    '''
                    UPDATE mpesa_transactions
                    SET status='completed', mpesa_receipt_number=%s, completed_at=%s
                    WHERE id=%s
                    ''',
                    (callback_values.get('MpesaReceiptNumber'), _now_db(), tx['id']),
                )
            else:
                cur.execute(
                    '''
                    UPDATE mpesa_transactions
                    SET status='failed', result_code=%s, result_desc=%s, failed_at=%s
                    WHERE id=%s
                    ''',
                    (str(result_code), callback.get('ResultDesc'), _now_db(), tx['id']),
                )
        conn.commit()
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Callback processed successfully'})
    finally:
        conn.close()


@app.get('/api/wallet/topup/verify')
def verify_wallet_topup():
    session_id = str(request.args.get('sessionId') or '').strip()
    if not session_id:
        return jsonify({'message': 'sessionId is required.'}), 400

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        try:
            stripe_session = _stripe_fetch_checkout_session(session_id)
        except ValueError as exc:
            return jsonify({'message': str(exc)}), 400

        with conn.cursor() as cur:
            cur.execute(
                'SELECT * FROM mpesa_transactions WHERE checkout_request_id = %s AND user_id = %s FOR UPDATE',
                (session_id, user['id']),
            )
            tx = cur.fetchone()
            if not tx:
                return jsonify({'message': 'Top-up session not found for this user.'}), 404

            result, updated_user = _fulfill_stripe_checkout_session(cur, stripe_session)
            conn.commit()
            if result == 'completed':
                return jsonify(
                    {
                        'message': 'Wallet top-up verified and funds added successfully.',
                        'status': 'completed',
                        'user': _safe_user(updated_user),
                        'paymentStatus': stripe_session.get('payment_status'),
                    }
                )
            if result == 'already_completed':
                return jsonify(
                    {
                        'message': 'Wallet top-up already verified.',
                        'status': 'completed',
                        'user': _safe_user(updated_user),
                        'paymentStatus': stripe_session.get('payment_status'),
                    }
                )
            if result == 'failed':
                return jsonify(
                    {
                        'message': 'This checkout session expired before payment was completed.',
                        'status': 'failed',
                        'paymentStatus': stripe_session.get('payment_status') or stripe_session.get('status') or 'failed',
                    }
                )
            return jsonify(
                {
                    'message': 'Payment is not completed yet. Finish checkout and try again.',
                    'status': 'pending',
                    'paymentStatus': stripe_session.get('payment_status') or stripe_session.get('status') or 'pending',
                }
            )
    finally:
        conn.close()


@app.post('/api/stripe/webhook')
def stripe_webhook():
    raw_payload = request.get_data(cache=False, as_text=False) or b''
    signature_header = request.headers.get('Stripe-Signature', '')

    try:
        _verify_stripe_webhook_signature(raw_payload, signature_header)
        event = json.loads(raw_payload.decode('utf-8') or '{}')
    except (ValueError, json.JSONDecodeError) as exc:
        return jsonify({'message': str(exc)}), 400

    event_type = str(event.get('type') or '').strip()
    session = event.get('data', {}).get('object', {}) if isinstance(event.get('data', {}), dict) else {}
    session_id = str(session.get('id') or '').strip()

    if event_type not in {'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'}:
        return jsonify({'received': True, 'ignored': True, 'eventType': event_type})

    if not session_id:
        return jsonify({'message': 'Stripe webhook session id is missing.'}), 400

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            try:
                result, updated_user = _fulfill_stripe_checkout_session(cur, session)
            except ValueError as exc:
                conn.rollback()
                return jsonify({'message': str(exc)}), 404
        conn.commit()
        return jsonify(
            {
                'received': True,
                'eventType': event_type,
                'status': result,
                'userId': updated_user.get('id') if updated_user else None,
            }
        )
    finally:
        conn.close()


@app.post('/api/prizes/payout')
def payout_prize_to_winner():
    payload = request.get_json(silent=True) or {}
    user_id = payload.get('userId')
    tournament_id = payload.get('tournamentId')

    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        return jsonify({'message': 'Valid userId is required.'}), 400

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM users WHERE id = %s', (user_id_int,))
            user = cur.fetchone()
            if not user:
                return jsonify({'message': 'Winner user not found.'}), 404

            tournament = None
            if tournament_id is not None:
                cur.execute('SELECT * FROM tournaments WHERE id = %s', (tournament_id,))
                tournament = cur.fetchone()
                if not tournament:
                    return jsonify({'message': 'Tournament not found.'}), 404

            payout_code = f'payout_{int(datetime.utcnow().timestamp() * 1000)}'
            admin_share = 0.0
            if tournament:
                match_size = int(tournament.get('max_participants') or TOURNAMENT_MATCH_SIZE)
                winner_share = WINNER_PRIZE_SHARE
                amount_value = round(float(tournament.get('entry_fee') or 0) * match_size * winner_share, 2)
            else:
                try:
                    amount_value = float(payload.get('amount'))
                except (TypeError, ValueError):
                    return jsonify({'message': 'Provide a tournamentId or a valid amount.'}), 400

            if amount_value <= 0:
                return jsonify({'message': 'Amount must be greater than zero.'}), 400

            cur.execute(
                '''
                INSERT INTO prize_payouts
                (payout_code, user_id, tournament_id, phone_number, amount, status, mode, created_at, completed_at)
                VALUES (%s, %s, %s, %s, %s, 'completed', 'simulated', %s, %s)
                ''',
                (
                    payout_code,
                    user_id_int,
                    tournament_id,
                    str(user.get('phone_number') or ''),
                    amount_value,
                    _now_db(),
                    _now_db(),
                ),
            )
            cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (amount_value, user_id_int))
            if tournament:
                admin_share = _credit_admin_tournament_share(cur, tournament=tournament)
            cur.execute('SELECT * FROM users WHERE id = %s', (user_id_int,))
            updated_user = cur.fetchone()
            conn.commit()
            return jsonify(
                {
                    'message': 'Winner prize sent automatically to the wallet.',
                    'amount': amount_value,
                    'adminShare': admin_share,
                    'user': _safe_user(updated_user),
                }
            )
    finally:
        conn.close()


@app.post('/api/mpesa/callback/b2c-result')
def mpesa_b2c_result_callback():
    return jsonify({'ResultCode': 0, 'ResultDesc': 'B2C result callback received'})


@app.post('/api/mpesa/callback/b2c-timeout')
def mpesa_b2c_timeout_callback():
    return jsonify({'ResultCode': 0, 'ResultDesc': 'B2C timeout callback received'})


@app.get('/api/live-races')
def list_live_races():
    user_id_raw = request.headers.get('X-User-Id')
    viewer_user_id = int(user_id_raw) if user_id_raw and user_id_raw.isdigit() else None
    rooms = sorted(
        (_serialize_live_room(room, viewer_user_id=viewer_user_id) for room in LIVE_RACE_ROOMS.values()),
        key=lambda item: item.get('createdAt') or '',
        reverse=True,
    )
    return jsonify(rooms[:20])


@app.post('/api/live-races/queue')
def queue_live_race():
    payload = request.get_json(silent=True) or {}
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        with conn.cursor() as cur:
            mode = str(payload.get('mode') or 'standard').strip().lower()
            language = str(payload.get('language') or 'english').strip().lower()
            duration = int(payload.get('duration') or 60)
            tournament_id = payload.get('tournamentId')
            is_private = bool(payload.get('isPrivate'))
            invite_code = str(payload.get('inviteCode') or '').strip().upper()
            room_password = str(payload.get('password') or '').strip()
            winner_prize = float(payload.get('winnerPrize') or 0)
            stake_amount = 0.0
            winner_takes_all = False

            text = _generate_passage(mode, language).get('passage') or LIVE_RACE_TEXTS.get(mode, LIVE_RACE_TEXTS['standard'])
            player_snapshot = {'userId': user['id'], 'username': user['username'], 'progress': 0, 'currentWpm': 0}

            if invite_code:
                room = _find_live_room_by_invite(invite_code)
                if not room:
                    return jsonify({'message': 'Friend battle room not found.'}), 404
                if room.get('password') and room.get('password') != room_password:
                    return jsonify({'message': 'Private room password is incorrect.'}), 403
                if all(existing['userId'] != user['id'] for existing in room['players']) and len(room['players']) >= TOURNAMENT_MATCH_SIZE:
                    return jsonify({'message': 'This private room is already full.'}), 400
                if all(existing['userId'] != user['id'] for existing in room['players']):
                    room['players'].append(player_snapshot)
                room['status'] = 'countdown' if len(room['players']) >= TOURNAMENT_MATCH_SIZE else 'waiting'
                room['startedAt'] = _now_iso() if room['status'] == 'countdown' else room.get('startedAt')
                conn.commit()
                return jsonify(
                    {
                        'room': _serialize_live_room(room, viewer_user_id=user['id']),
                        'matched': room['status'] == 'countdown',
                        'user': _safe_user(user),
                        'message': 'Joined private room.',
                    }
                )

            if not is_private:
                for room in LIVE_RACE_ROOMS.values():
                    if (
                        room['status'] == 'waiting'
                        and not room.get('isPrivate')
                        and room['mode'] == mode
                        and room['language'] == language
                        and room['duration'] == duration
                        and room.get('tournamentId') == tournament_id
                        and all(existing['userId'] != user['id'] for existing in room['players'])
                    ):
                        room['players'].append(player_snapshot)
                        room['status'] = 'countdown'
                        room['startedAt'] = _now_iso()
                        return jsonify({'room': _serialize_live_room(room, viewer_user_id=user['id']), 'matched': True})

            if is_private and stake_amount > 0:
                try:
                    _debit_user_balance(cur, user_id=user['id'], amount=stake_amount)
                except ValueError as exc:
                    conn.rollback()
                    return jsonify({'message': str(exc)}), 400
                cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                user = cur.fetchone()

            room_id = f'room_{int(datetime.utcnow().timestamp() * 1000)}_{secrets.token_hex(3)}'
            generated_invite = invite_code or secrets.token_hex(3).upper()
            room = {
                'id': room_id,
                'status': 'waiting',
                'mode': mode,
                'language': language,
                'duration': duration,
                'countdown': 3,
                'text': text,
                'inviteCode': generated_invite,
                'password': room_password if is_private else '',
                'isPrivate': is_private,
                'winnerTakesAll': winner_takes_all,
                'stakeAmount': stake_amount,
                'escrow': {},
                'totalEscrow': 0,
                'players': [player_snapshot],
                'results': {},
                'winnerPrize': winner_prize,
                'winnerUserId': None,
                'tournamentId': tournament_id,
                'spectators': 0,
                'createdAt': _now_iso(),
                'startedAt': None,
                'completedAt': None,
            }
            LIVE_RACE_ROOMS[room_id] = room
            conn.commit()
            return jsonify(
                {
                    'room': _serialize_live_room(room, viewer_user_id=user['id']),
                    'matched': False,
                    'user': _safe_user(user),
                    'message': 'Private room created.' if is_private else 'Live room created.',
                }
            ), 201
    finally:
        conn.close()


@app.get('/api/live-races/<room_id>')
def get_live_race(room_id: str):
    room = LIVE_RACE_ROOMS.get(room_id)
    if not room:
        return jsonify({'message': 'Live race room not found.'}), 404
    user_id_raw = request.headers.get('X-User-Id')
    viewer_user_id = int(user_id_raw) if user_id_raw and user_id_raw.isdigit() else None
    if viewer_user_id and viewer_user_id not in {player['userId'] for player in room.get('players', [])}:
        room['spectators'] = int(room.get('spectators') or 0) + 1
    return jsonify(_serialize_live_room(room, viewer_user_id=viewer_user_id))


@app.get('/api/live-races/invite/<invite_code>')
def get_live_race_by_invite(invite_code: str):
    room = _find_live_room_by_invite(invite_code)
    if not room:
        return jsonify({'message': 'Friend battle room not found.'}), 404
    user_id_raw = request.headers.get('X-User-Id')
    viewer_user_id = int(user_id_raw) if user_id_raw and user_id_raw.isdigit() else None
    return jsonify(_serialize_live_room(room, viewer_user_id=viewer_user_id))


@app.post('/api/live-races/<room_id>/cancel')
def cancel_live_race(room_id: str):
    room = LIVE_RACE_ROOMS.get(room_id)
    if not room:
        return jsonify({'message': 'Live race room not found.'}), 404

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        if not room.get('isPrivate'):
            return jsonify({'message': 'Only private rooms can be canceled manually.'}), 400
        if room.get('status') != 'waiting':
            return jsonify({'message': 'Only waiting private rooms can be canceled.'}), 400
        if not any(player['userId'] == user['id'] for player in room.get('players', [])):
            return jsonify({'message': 'You are not part of this private room.'}), 403

        refunded_users = []
        with conn.cursor() as cur:
            for escrow_user_id, amount in (room.get('escrow') or {}).items():
                if float(amount or 0) <= 0:
                    continue
                cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (float(amount), int(escrow_user_id)))
                cur.execute('SELECT * FROM users WHERE id = %s', (int(escrow_user_id),))
                refunded_user = cur.fetchone()
                if refunded_user:
                    refunded_users.append(_safe_user(refunded_user))
        conn.commit()
        LIVE_RACE_ROOMS.pop(room_id, None)

        current_user = next((item for item in refunded_users if item['id'] == user['id']), _safe_user(user))
        return jsonify(
            {
                'message': 'Private room canceled.',
                'refundedUsers': refunded_users,
                'user': current_user,
            }
        )
    finally:
        conn.close()


@app.post('/api/live-races/<room_id>/heartbeat')
def update_live_race_progress(room_id: str):
    room = LIVE_RACE_ROOMS.get(room_id)
    if not room:
        return jsonify({'message': 'Live race room not found.'}), 404

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
    finally:
        conn.close()

    payload = request.get_json(silent=True) or {}
    for player in room.get('players', []):
        if player['userId'] == user['id']:
            player['progress'] = max(0, min(100, int(payload.get('progress') or 0)))
            player['currentWpm'] = max(0, float(payload.get('currentWpm') or 0))
            break
    if room['status'] == 'countdown':
        room['status'] = 'racing'
    return jsonify(_serialize_live_room(room, viewer_user_id=user['id']))


@app.post('/api/live-races/<room_id>/submit')
def submit_live_race(room_id: str):
    room = LIVE_RACE_ROOMS.get(room_id)
    if not room:
        return jsonify({'message': 'Live race room not found.'}), 404

    payload = request.get_json(silent=True) or {}
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
    finally:
        conn.close()

    try:
        wpm = float(payload.get('wpm') or 0)
        accuracy = float(payload.get('accuracy') or 0)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid live race result.'}), 400

    room.setdefault('results', {})[user['id']] = {
        'userId': user['id'],
        'username': user['username'],
        'wpm': round(wpm, 1),
        'accuracy': round(accuracy, 1),
        'finishedAt': _now_iso(),
        'finishedAtTs': datetime.utcnow().timestamp(),
    }
    _complete_live_race_if_ready(room)
    return jsonify(_serialize_live_room(room, viewer_user_id=user['id']))


@app.get('/api/race-content/generate')
def generate_race_content():
    mode = request.args.get('mode', 'business')
    language = request.args.get('language', 'english')
    settings = _current_ai_settings()
    if settings['provider'] == 'local':
        content = _generate_passage(mode, language)
    else:
        try:
            content = _openai_generate_passage(mode, language)
        except ValueError:
            content = _generate_passage(mode, language)
    return jsonify(content)


@app.get('/api/store/catalog')
def store_catalog():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if user:
            with conn.cursor() as cur:
                _ensure_user_equipped_columns(cur)
                cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                user = cur.fetchone()
        owned = set(_owned_store_items_for_user(conn, int(user.get('id') or 0))) if user else set()
        items = []
        for item in MARKETPLACE_ITEMS:
            enriched = dict(item)
            enriched['owned'] = item['id'] in owned
            equip_field = _equip_field_for_category(item.get('category'))
            enriched['equipped'] = bool(user and equip_field and user.get(equip_field) == item['id'])
            items.append(enriched)
        return jsonify({'items': items})
    finally:
        conn.close()


@app.post('/api/store/purchase')
def store_purchase():
    payload = request.get_json(silent=True) or {}
    item_id = str(payload.get('itemId') or '').strip()
    item = next((candidate for candidate in MARKETPLACE_ITEMS if candidate['id'] == item_id), None)
    if not item:
        return jsonify({'message': 'Store item not found.'}), 404

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        owned_item_ids = set(_owned_store_items_for_user(conn, int(user.get('id') or 0)))
        if item_id in owned_item_ids:
            return jsonify({'message': 'You already own this store item.'}), 400
        with conn.cursor() as cur:
            try:
                _ensure_store_purchase_table(cur)
                _ensure_user_equipped_columns(cur)
                updated_user = _debit_user_balance(cur, user_id=user['id'], amount=float(item['price']))
                cur.execute(
                    '''
                    INSERT INTO store_purchases (user_id, item_id, item_name, price_paid)
                    VALUES (%s, %s, %s, %s)
                    ''',
                    (user['id'], item['id'], item['name'], float(item['price'])),
                )
                equip_field = _equip_field_for_category(item.get('category'))
                if equip_field:
                    cur.execute(f'UPDATE users SET {equip_field}=%s WHERE id=%s', (item['id'], user['id']))
                    cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                    updated_user = cur.fetchone()
            except ValueError as exc:
                conn.rollback()
                return jsonify({'message': str(exc)}), 400
        conn.commit()
        return jsonify(
            {
                'message': f'{item["name"]} unlocked and equipped successfully.',
                'item': item,
                'user': _safe_user(updated_user, conn),
            }
        )
    finally:
        conn.close()


@app.get('/api/tournaments')
def get_tournaments():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _sync_tournament_statuses(cur)
            rows = _fetch_all_tournaments(cur)
        conn.commit()
        return jsonify([_serialize_tournament(r) for r in rows])
    finally:
        conn.close()


@app.post('/api/tournaments/<int:tournament_id>/join')
def join_tournament(tournament_id: int):
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Please sign in first to join this tournament.'}), 401

        with conn.cursor() as cur:
            _sync_tournament_statuses(cur)
            tournament = _fetch_tournament_with_counts(cur, tournament_id, lock=True)
            if not tournament:
                return jsonify({'message': 'Tournament not found.'}), 404

            tournament_status = _computed_tournament_status(tournament)
            if tournament_status == 'completed':
                return jsonify({'message': 'This tournament has already ended.'}), 400

            entry_fee = float(tournament.get('entry_fee') or 0)
            user_balance = float(user.get('balance') or 0)
            if user_balance < entry_fee:
                return jsonify({'message': f'Insufficient funds. You need KES {entry_fee:.2f} to join this tournament.'}), 400

            cur.execute(
                'SELECT * FROM tournament_joins WHERE tournament_id=%s AND user_id=%s FOR UPDATE',
                (tournament_id, user['id']),
            )
            existing_join = cur.fetchone()
            if existing_join:
                refreshed_tournament = _fetch_tournament_with_counts(cur, tournament_id)
                if float(existing_join.get('paid_amount') or 0) > 0:
                    return jsonify(
                        {
                            'success': True,
                            'matched': True,
                            'message': 'Tournament starts in the next 30 seconds. Your entry has already been confirmed.',
                            'tournament': _serialize_tournament(refreshed_tournament),
                            'user': _safe_user(user),
                        }
                    )
                remaining_players = max(
                    0,
                    int(refreshed_tournament.get('match_size') or match_size)
                    - int(refreshed_tournament.get('participants') or 0)
                    - int(refreshed_tournament.get('waiting_players') or 0),
                )
                return jsonify(
                    {
                        'success': True,
                        'matched': False,
                        'message': (
                            f'You are already queued. Waiting for {remaining_players} more '
                            f'player{"s" if remaining_players != 1 else ""}.'
                        ),
                        'tournament': _serialize_tournament(refreshed_tournament),
                        'user': _safe_user(user),
                    }
                )

            paid_participants = int(tournament.get('participants') or 0)
            waiting_players = int(tournament.get('waiting_players') or 0)
            joined_players = paid_participants + waiting_players
            match_size = int(tournament.get('match_size') or tournament.get('max_participants') or TOURNAMENT_MATCH_SIZE)
            if joined_players >= match_size:
                return jsonify({'message': 'This tournament is already full.'}), 400

            cur.execute(
                'INSERT INTO tournament_joins (tournament_id, user_id, paid_amount) VALUES (%s, %s, %s)',
                (tournament_id, user['id'], 0),
            )
            cur.execute(
                '''
                SELECT *
                FROM tournament_joins
                WHERE tournament_id=%s
                ORDER BY joined_at ASC, id ASC
                FOR UPDATE
                ''',
                (tournament_id,),
            )
            tournament_joins = cur.fetchall()
            queued_players = len(tournament_joins)

            if queued_players < match_size:
                refreshed_tournament = _fetch_tournament_with_counts(cur, tournament_id)
                remaining_players = max(0, match_size - queued_players)
                conn.commit()
                return jsonify(
                    {
                        'success': True,
                        'matched': False,
                        'message': (
                            f'You joined the tournament. Waiting for {remaining_players} more '
                            f'player{"s" if remaining_players != 1 else ""}.'
                        ),
                        'tournament': _serialize_tournament(refreshed_tournament),
                        'user': _safe_user(user),
                    }
                )

            if queued_players > match_size:
                return jsonify({'message': 'This tournament is already full.'}), 400

            joined_user_ids = [int(join_row['user_id']) for join_row in tournament_joins]
            joined_users: dict[int, Dict[str, Any]] = {}
            insufficient_user_ids: list[int] = []
            for joined_user_id in joined_user_ids:
                cur.execute('SELECT * FROM users WHERE id = %s FOR UPDATE', (joined_user_id,))
                joined_user = cur.fetchone()
                if not joined_user:
                    insufficient_user_ids.append(joined_user_id)
                    continue
                joined_users[joined_user_id] = joined_user
                if float(joined_user.get('balance') or 0) < entry_fee:
                    insufficient_user_ids.append(joined_user_id)

            if insufficient_user_ids:
                placeholders = ', '.join(['%s'] * len(insufficient_user_ids))
                cur.execute(
                    f'DELETE FROM tournament_joins WHERE tournament_id = %s AND user_id IN ({placeholders})',
                    (tournament_id, *insufficient_user_ids),
                )
                refreshed_tournament = _fetch_tournament_with_counts(cur, tournament_id)
                conn.commit()
                return jsonify(
                    {
                        'success': False,
                        'matched': False,
                        'message': 'Some queued players no longer had enough funds and were removed. Join again when the lobby fills up.',
                        'tournament': _serialize_tournament(refreshed_tournament),
                        'user': _safe_user(user),
                    }
                )

            for joined_user_id in joined_user_ids:
                cur.execute('UPDATE users SET balance = balance - %s WHERE id = %s', (entry_fee, joined_user_id))

            cur.execute(
                'UPDATE tournament_joins SET paid_amount=%s WHERE tournament_id=%s AND paid_amount=0',
                (entry_fee, tournament_id),
            )
            cur.execute(
                'UPDATE tournaments SET participants=%s, status=%s, start_time=%s WHERE id=%s',
                (match_size, 'upcoming', datetime.utcnow() + timedelta(seconds=TOURNAMENT_START_DELAY_SECONDS), tournament_id),
            )

            cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
            updated_user = cur.fetchone()
            updated_tournament = _fetch_tournament_with_counts(cur, tournament_id)

        conn.commit()

        message = (
            f'All {match_size} players have joined. Tournament starts in the next '
            f'{TOURNAMENT_START_DELAY_SECONDS} seconds. Entry fees have been deducted.'
        )
        return jsonify(
            {
                'success': True,
                'matched': True,
                'message': message,
                'tournament': _serialize_tournament(updated_tournament),
                'user': _safe_user(updated_user),
            }
        )
    finally:
        conn.close()


@app.get('/api/leaderboard')
def leaderboard():
    limit_raw = request.args.get('limit', '100')
    try:
        limit = max(1, min(500, int(limit_raw)))
    except ValueError:
        limit = 100

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT
                    u.*,
                    COALESCE(rh.live_races, 0) AS live_races,
                    COALESCE(rh.live_earnings, 0) AS live_earnings,
                    COALESCE(tj.tournament_entries, 0) AS tournament_entries,
                    COALESCE(pp.tournament_payouts, 0) AS tournament_payouts
                FROM users u
                LEFT JOIN (
                    SELECT
                        user_id,
                        COUNT(*) AS live_races,
                        COALESCE(SUM(earnings), 0) AS live_earnings
                    FROM race_history
                    GROUP BY user_id
                ) rh ON rh.user_id = u.id
                LEFT JOIN (
                    SELECT
                        user_id,
                        COUNT(*) AS tournament_entries
                    FROM tournament_joins
                    WHERE paid_amount > 0
                    GROUP BY user_id
                ) tj ON tj.user_id = u.id
                LEFT JOIN (
                    SELECT
                        user_id,
                        COALESCE(SUM(amount), 0) AS tournament_payouts
                    FROM prize_payouts
                    WHERE status = 'completed' AND tournament_id IS NOT NULL
                    GROUP BY user_id
                ) pp ON pp.user_id = u.id
                ORDER BY u.wins DESC, u.wpm DESC, u.accuracy DESC
                LIMIT %s
                ''',
                (limit,),
            )
            users = cur.fetchall()

        board = []
        for idx, u in enumerate(users, start=1):
            row = _safe_user(u)
            tournament_entries = int(u.get('tournament_entries') or 0)
            tournament_payouts = float(u.get('tournament_payouts') or 0)
            live_races = int(u.get('live_races') or 0)
            live_earnings = float(u.get('live_earnings') or 0)
            row['tournamentEntries'] = tournament_entries
            row['tournamentPayouts'] = tournament_payouts
            row['liveRaces'] = live_races
            row['liveEarnings'] = live_earnings
            row['seasonPoints'] = int(
                row['seasonPoints']
                + (live_races * 6)
                + (tournament_entries * 12)
                + round((tournament_payouts + live_earnings) / 25)
            )
            row['rank'] = idx
            row['weeklyRank'] = idx
            board.append(row)

        return jsonify(board)
    finally:
        conn.close()


@app.post('/api/races/submit')
def submit_race():
    payload = request.get_json(silent=True) or {}
    try:
        wpm = float(payload.get('wpm', 0))
        accuracy = float(payload.get('accuracy', 0))
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid race payload'}), 400

    duration = payload.get('duration')

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        race_code = payload.get('id') or f'race_{int(datetime.utcnow().timestamp() * 1000)}'
        place = 1 if wpm >= float(user.get('wpm') or 0) else 2
        earnings = int(max(50, round(wpm * 3)))
        now_dt = datetime.utcnow()

        with conn.cursor() as cur:
            cur.execute(
                '''
                INSERT INTO race_history
                (race_code, user_id, username, wpm, accuracy, duration, place_position, earnings, race_timestamp)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''',
                (race_code, user['id'], user['username'], round(wpm, 1), round(accuracy, 1), duration, place, earnings, now_dt),
            )

            total_races = int(user.get('total_races') or 0) + 1
            wins = int(user.get('wins') or 0) + (1 if place == 1 else 0)
            next_wpm = round((float(user.get('wpm') or 0) * 0.8) + (wpm * 0.2), 1)
            next_accuracy = round((float(user.get('accuracy') or 0) * 0.8) + (accuracy * 0.2), 1)

            cur.execute(
                '''
                UPDATE users
                SET total_races=%s, wins=%s, wpm=%s, accuracy=%s, balance=balance+%s
                WHERE id=%s
                ''',
                (total_races, wins, next_wpm, next_accuracy, earnings, user['id']),
            )

        conn.commit()

        return jsonify(
            {
                'id': race_code,
                'userId': user['id'],
                'username': user['username'],
                'wpm': round(wpm, 1),
                'accuracy': round(accuracy, 1),
                'duration': duration,
                'place': place,
                'earnings': earnings,
                'timestamp': now_dt.isoformat() + 'Z',
                'coachTip': _coach_tip_for_user(
                    {
                        'wpm': next_wpm,
                        'accuracy': next_accuracy,
                        'wins': wins,
                    }
                ),
            }
        ), 201
    finally:
        conn.close()


@app.get('/api/users/<int:user_id>/races')
def user_races(user_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT race_code, user_id, username, wpm, accuracy, duration, place_position, earnings, race_timestamp
                FROM race_history
                WHERE user_id=%s
                ORDER BY race_timestamp DESC
                ''',
                (user_id,),
            )
            rows = cur.fetchall()

        data = [
            {
                'id': row['race_code'],
                'userId': row['user_id'],
                'username': row['username'],
                'wpm': float(row['wpm'] or 0),
                'accuracy': float(row['accuracy'] or 0),
                'duration': row.get('duration'),
                'place': int(row['place_position'] or 0),
                'earnings': float(row['earnings'] or 0),
                'timestamp': row['race_timestamp'].isoformat() + 'Z' if row.get('race_timestamp') else None,
            }
            for row in rows
        ]
        return jsonify(data)
    finally:
        conn.close()


@app.put('/api/users/<int:user_id>')
def update_user(user_id: int):
    payload = request.get_json(silent=True) or {}
    username = payload.get('username')
    phone_number = payload.get('phoneNumber')

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM users WHERE id=%s', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'message': 'User not found'}), 404

            if username is not None:
                cur.execute('UPDATE users SET username=%s WHERE id=%s', (str(username).strip(), user_id))
            if phone_number is not None:
                cur.execute('UPDATE users SET phone_number=%s WHERE id=%s', (str(phone_number).strip(), user_id))

            cur.execute('SELECT * FROM users WHERE id=%s', (user_id,))
            updated = cur.fetchone()
        conn.commit()
        return jsonify(_safe_user(updated))
    finally:
        conn.close()


@app.get('/api/health')
def api_health():
    return jsonify(
        {
            'status': 'ok',
            'buildAvailable': BUILD_DIR.exists(),
            'databaseConfigured': bool(DB_HOST and DB_USER and DB_NAME),
        }
    )


def _frontend_file_response(path: str = ''):
    if not BUILD_DIR.exists():
        return jsonify({'message': 'Frontend build not found on server. Upload the build/ directory.'}), 404

    normalized_path = str(path or '').strip().lstrip('/')
    requested_file = BUILD_DIR / normalized_path if normalized_path else BUILD_DIR / 'index.html'

    if normalized_path and requested_file.exists() and requested_file.is_file():
        return send_from_directory(BUILD_DIR, normalized_path)

    return send_from_directory(BUILD_DIR, 'index.html')


@app.errorhandler(RuntimeError)
def handle_runtime_error(exc):
    app.logger.exception('Runtime error while serving request')
    return jsonify({'message': str(exc)}), 500


@app.errorhandler(pymysql.MySQLError)
def handle_mysql_error(exc):
    app.logger.exception('Database error while serving request')
    return jsonify({'message': f'Database error: {exc}'}), 500


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    app.logger.exception('Unexpected error while serving request')
    return jsonify({'message': f'Unexpected server error: {exc}'}), 500


@app.get('/')
def frontend_index():
    return _frontend_file_response()


@app.get('/<path:path>')
def frontend_routes(path: str):
    if path.startswith('api/'):
        return jsonify({'message': 'API route not found'}), 404
    return _frontend_file_response(path)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3001, debug=True)
