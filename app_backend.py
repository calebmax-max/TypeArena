from __future__ import annotations
import os
import math
from flask_socketio import SocketIO, emit, join_room
from dotenv import load_dotenv
load_dotenv()

import base64
import hashlib
import hmac
import json
import os
import secrets
import string
import threading as _threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

import pymysql
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, static_folder=None)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv('TYPEARENA_ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
    if origin.strip()
]
CORS(app, origins=ALLOWED_ORIGINS)

BASE_DIR = Path(__file__).resolve().parent
BUILD_DIR = BASE_DIR / 'build'
APP_HOST = os.getenv('HOST', '0.0.0.0').strip() or '0.0.0.0'
APP_PORT = int(os.getenv('PORT', '3001'))

DB_HOST = os.getenv('ALWAYSDATA_DB_HOST', '').strip()
DB_USER = os.getenv('ALWAYSDATA_DB_USER', '').strip()
DB_PASSWORD = os.getenv('ALWAYSDATA_DB_PASSWORD', '')
DB_NAME = os.getenv('ALWAYSDATA_DB_NAME', '').strip()


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


try:
    DB_PORT = max(1, _env_int('ALWAYSDATA_DB_PORT', 3306))
except (TypeError, ValueError):
    DB_PORT = 3306
DB_CONNECT_TIMEOUT = max(3, _env_int('ALWAYSDATA_DB_CONNECT_TIMEOUT', 8))
DB_READ_TIMEOUT = max(3, _env_int('ALWAYSDATA_DB_READ_TIMEOUT', 30))
DB_WRITE_TIMEOUT = max(3, _env_int('ALWAYSDATA_DB_WRITE_TIMEOUT', 30))

MPESA_SIMULATE = os.getenv('MPESA_SIMULATE', 'false').lower() == 'true'
MPESA_CONSUMER_KEY = os.getenv('MPESA_CONSUMER_KEY', '')
MPESA_CONSUMER_SECRET = os.getenv('MPESA_CONSUMER_SECRET', '')
MPESA_SHORTCODE = os.getenv('MPESA_SHORTCODE', '174379')
MPESA_PASSKEY = os.getenv('MPESA_PASSKEY', '')
MPESA_CALLBACK_URL = os.getenv('MPESA_CALLBACK_URL', '').strip()
MPESA_B2C_SHORTCODE = os.getenv('MPESA_B2C_SHORTCODE', MPESA_SHORTCODE)
MPESA_B2C_INITIATOR_NAME = os.getenv('MPESA_B2C_INITIATOR_NAME', '')
MPESA_B2C_SECURITY_CREDENTIAL = os.getenv('MPESA_B2C_SECURITY_CREDENTIAL', '')
MPESA_B2C_RESULT_URL = os.getenv('MPESA_B2C_RESULT_URL', '').strip()
MPESA_B2C_TIMEOUT_URL = os.getenv('MPESA_B2C_TIMEOUT_URL', '').strip()
MPESA_BASE_URL = os.getenv('MPESA_BASE_URL', 'https://sandbox.safaricom.co.ke')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-5.2')
OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
AI_SETTINGS: Dict[str, Any] = {
    'provider': os.getenv('AI_CONTENT_PROVIDER', 'auto').strip().lower() or 'auto',
    'model': OPENAI_MODEL,
}
DEFAULT_SITE_MARQUEE_ITEMS = [
    'Product Update',
    'Private friend battles are live now.',
    'Wallet top-up, tournaments, and marketplace are active.',
]
SITE_SETTINGS_FILE = Path(__file__).resolve().parent / 'site_settings.json'
PAYPAL_CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID', '')
PAYPAL_CLIENT_SECRET = os.getenv('PAYPAL_CLIENT_SECRET', '')
PAYPAL_BASE_URL = os.getenv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com')
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY', '')
STRIPE_BASE_URL = os.getenv('STRIPE_BASE_URL', 'https://api.stripe.com/v1')
STRIPE_SUCCESS_URL = os.getenv('STRIPE_SUCCESS_URL', '').strip()
STRIPE_CANCEL_URL = os.getenv('STRIPE_CANCEL_URL', '').strip()
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET', '')

LEADERBOARD_CACHE_TTL_MS = 15_000
SITE_SETTINGS_STORAGE_KEY = 'site_settings'
_leaderboard_cache: Dict[str, Any] = {
    'key': None,
    'expires_at': 0,
    'payload': None,
}
_leaderboard_cache_lock = _threading.Lock()
ADMIN_EMAIL = os.getenv('TYPEARENA_ADMIN_EMAIL', '').strip()
ADMIN_PASSWORD = os.getenv('TYPEARENA_ADMIN_PASSWORD', '')
ADMIN_TOKEN_TTL_SECONDS = 8 * 60 * 60
ADMIN_TOKEN_SECRET = os.getenv('TYPEARENA_ADMIN_TOKEN_SECRET', '').strip()
TOURNAMENT_MATCH_SIZE = 2
TOURNAMENT_START_DELAY_SECONDS = 30
WINNER_PRIZE_SHARE = 0.60
WITHDRAWAL_FEE = 50.0
LIVE_RACE_COUNTDOWN_SECONDS = 5
LIVE_RACE_ROOMS: dict[str, Dict[str, Any]] = {}

socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGINS, async_mode='gevent')
app.extensions['socketio'] = socketio


def _is_admin_email(email: str) -> bool:
    normalized_email = str(email or '').strip().lower()
    return bool(normalized_email and ADMIN_EMAIL and normalized_email == ADMIN_EMAIL.lower())


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        text = str(value).strip()
        if not text:
            return default
        return int(float(text))
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        if isinstance(value, bool):
            return float(int(value))
        if isinstance(value, (int, float)):
            return float(value)
        text = str(value).strip()
        if not text:
            return default
        return float(text)
    except (TypeError, ValueError):
        return default


def _admin_token_secret() -> bytes:
    # Reuse the explicit admin password only as a compatibility fallback.
    secret = ADMIN_TOKEN_SECRET or ADMIN_PASSWORD
    return secret.encode('utf-8')


def _issue_admin_token() -> str:
    issued_at = int(time.time())
    payload = json.dumps(
        {'iat': issued_at, 'exp': issued_at + ADMIN_TOKEN_TTL_SECONDS, 'nonce': secrets.token_urlsafe(18)},
        separators=(',', ':'),
    ).encode('utf-8')
    encoded = base64.urlsafe_b64encode(payload).decode('ascii').rstrip('=')
    signature = hmac.new(_admin_token_secret(), encoded.encode('ascii'), hashlib.sha256).hexdigest()
    return f'{encoded}.{signature}'

def _build_live_mode_passages(parts: Dict[str, list[str]]) -> list[str]:
    intros = list(parts.get('intros') or [])
    focuses = list(parts.get('focuses') or [])
    metrics = list(parts.get('metrics') or [])
    closers = list(parts.get('closers') or [])

    passages: list[str] = []
    if not intros or not focuses or not metrics or not closers:
        return passages

    for intro_index, intro in enumerate(intros):
        for focus_index, focus in enumerate(focuses):
            for closer_index, closer in enumerate(closers):
                metric = metrics[(intro_index + focus_index + closer_index) % len(metrics)]
                passages.append(f'{intro} {focus} {metric} {closer}')
    return passages


COMPETITIVE_PASSAGE_SUFFIXES = [
    'Calibration note: keep 14, 27, 91.8%, 6:2, #08, {}, [], and "quoted text" exactly where they belong while alpha, beta, gamma, and delta stay in order.',
    'Symbol drill: preserve /, :, ;, #, %, and parentheses, then repeat the letters k, m, q, z, and x without flattening the spacing between them.',
    'Precision lane: hold 31, 57, and 93.8 intact, protect < > and = signs, and keep the sequence "a-b-c" aligned with every slash and comma.',
    'Tournament note: the second half rewards patience, so keep 18, 42, 108, and 4.1% clean while the punctuation stack stays disciplined.',
    'Race calibration: maintain every bracket, dash, apostrophe, and quotation mark while the letters in vector, syntax, and rhythm remain untouched.',
]

LONG_COMPETITIVE_BLOCKS = [
    'Extended drill: the strongest runs are built from small exact motions, so keep the symbols #, %, /, :, ;, and () in place while the words "high pressure" and "clean finish" never drift apart. Keep sequence markers like 03, 19, and 144 visible from the first letter to the last.',
    'Long-form checkpoint: accuracy matters more once the sentence grows, so protect the rhythm in alpha-numeric clusters such as a1, b2, c3, and z9. Stay calm through punctuation piles, quoted fragments, and bracket pairs while every comma still lands where it should.',
    'Competition layer: imagine the board as a scorecard that punishes careless edits. Hold 58.7%, 102, and 7:11 perfectly while you carry the letters p, r, o, and v through the line. The last stretch should still look tidy even when the pace rises.',
    'Endurance cue: keep the paragraph readable to a spectator but unforgiving to a rushed hand. Preserve hyphens, underscores, apostrophes, and slash-separated values like north/south and 12/24 without flattening the spacing or breaking the structure.',
    'Symbol density note: typed repetition should feel deliberate, not robotic, so repeat the pattern carefully while brackets [ ], braces { }, angle marks < >, and quotations " " remain locked in place. The real test is whether the line still feels controlled after the middle section.',
    'Focus stress test: the player who wins the lane usually maintains form when the content turns noisy. Keep the letters g, h, i, j, and k steady alongside 44, 88, 132, and 2.75%, then finish without dropping the final punctuation.',
]

MODE_COMPETITIVE_TAILS = {
    'code': [
        'Code emphasis: keep {}, (), [], =>, ==, !=, &&, ||, and :: in order while function names like renderBoard, submitRace, and mergeRooms stay readable.',
        'Syntax layer: preserve "const", "return", and "async" beside identifiers such as room_id, match_state, and winnerUserId without losing spacing or casing.',
        'Operator drill: make every slash, underscore, brace, and semicolon matter while the snippet still looks like production-quality logic.',
    ],
    'memory': [
        'Recall emphasis: keep the sequence 3, 8, 13, 21, 34, and 55 in order, then preserve the quote "remember the pattern first" exactly as shown.',
        'Retention layer: hold the letters n, o, p, q, r, and s in a clean chain while ratios, commas, and quotes stay attached to the right spots.',
        'Memory drill: the safest route is to store the structure before the clock turns, not to improvise the missing symbol at the end.',
    ],
    'marathon': [
        'Marathon emphasis: the text should keep breathing across a long span, so preserve rhythm through every extra clause and the final carry to the line end.',
        'Endurance layer: hold your posture through the middle paragraphs, where fatigue usually starts to bend punctuation and spacing out of shape.',
        'Distance drill: keep the run steady through a long corridor of words, numbers, and symbols so the final section still looks controlled.',
    ],
    'speed_burst': [
        'Burst emphasis: launch quickly, but do not let the accelerated pace strip away the punctuation or the spacing that makes the line readable.',
        'Sprint layer: keep the opening sharp and the exit clean, even while the numbers, dashes, and quotes come at you faster.',
        'Fast-lane note: the best burst is the one that looks aggressive without becoming sloppy in the last third.',
    ],
    'survival': [
        'Survival emphasis: every extra mark matters because one careless miss can hand momentum away in a pressure-heavy room.',
        'Pressure layer: keep the line compact and controlled so the sentence still survives the late-stage squeeze.',
        'Clutch drill: the goal is to protect detail when the passage starts to feel crowded and the timer feels louder.',
    ],
    'quote': [
        'Quote emphasis: keep the reflective tone intact while punctuation, punctuation-like pauses, and the quoted phrases stay crisp.',
        'Reflection layer: the line should feel calm but exact, as if every character has to earn its place on the page.',
        'Philosophy drill: preserve the sentence shape even when the passage slows down enough to tempt lazy typing.',
    ],
    'standard': [
        'Standard emphasis: keep the run balanced so it feels like a real competitive practice lane instead of a sample snippet.',
        'Baseline layer: protect both rhythm and detail because the easiest-looking passages often expose sloppy habits fastest.',
        'Core drill: this sector should read cleanly from start to finish while still asking enough of the hands to matter.',
    ],
}


def _content_id_for_index(kind: str, mode: str, language: str, index: int) -> str:
    raw = f'{kind}:{mode}:{language}:{index}'.encode('utf-8')
    return hashlib.sha1(raw).hexdigest()[:12]


def _augment_competitive_passage(base_passage: str, content_id: str, *, mode: str, language: str, is_live: bool) -> str:
    seed = hashlib.sha1(f'{content_id}:{mode}:{language}:{int(is_live)}'.encode('utf-8')).hexdigest()
    suffix_index = int(seed, 16) % len(COMPETITIVE_PASSAGE_SUFFIXES)
    block_index = int(seed[:8], 16) % len(LONG_COMPETITIVE_BLOCKS)
    second_block_index = (block_index + int(seed[8:16], 16)) % len(LONG_COMPETITIVE_BLOCKS)
    suffix = COMPETITIVE_PASSAGE_SUFFIXES[suffix_index]
    first_block = LONG_COMPETITIVE_BLOCKS[block_index]
    second_block = LONG_COMPETITIVE_BLOCKS[second_block_index]
    tail_pool = MODE_COMPETITIVE_TAILS.get(mode, MODE_COMPETITIVE_TAILS['standard'])
    tail_index = int(seed[16:24], 16) % len(tail_pool)
    tail = tail_pool[tail_index]
    checksum = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    return f'{base_passage} {suffix} {first_block} {second_block} {tail} Match code: {checksum}.'


def _normalize_exclude_content_ids(exclude_content_ids: Any) -> set[str]:
    normalized: set[str] = set()
    if not exclude_content_ids:
        return normalized
    if isinstance(exclude_content_ids, str):
        exclude_content_ids = [exclude_content_ids]
    for value in exclude_content_ids:
        text = str(value or '').strip()
        if not text:
            continue
        for chunk in text.split(','):
            normalized_chunk = chunk.strip()
            if normalized_chunk:
                normalized.add(normalized_chunk)
    return normalized


def _select_competitive_passage(
    passages: list[str],
    *,
    kind: str,
    mode: str,
    language: str,
    exclude_content_ids: Any = None,
    is_live: bool = False,
) -> Dict[str, Any]:
    entries = []
    for index, passage in enumerate(passages):
        content_id = _content_id_for_index(kind, mode, language, index)
        entries.append(
            {
                'contentId': content_id,
                'passage': _augment_competitive_passage(
                    passage,
                    content_id,
                    mode=mode,
                    language=language,
                    is_live=is_live,
                ),
            }
        )

    if not entries:
        return {'contentId': '', 'passage': '', 'totalContentCount': 0}

    excluded = _normalize_exclude_content_ids(exclude_content_ids)
    available = [entry for entry in entries if entry['contentId'] not in excluded]
    if not available:
        available = entries

    selected = available[secrets.randbelow(len(available))]
    return {
        **selected,
        'id': selected['contentId'],
        'totalContentCount': len(entries),
    }


LIVE_RACE_TEXTS = {
    'standard': 'Speed comes from rhythm, not panic. Keep your shoulders relaxed and let accurate keystrokes build momentum every second of the race.',
    'survival': 'In survival mode every mistake costs pressure. Stay calm, stay precise, and protect your lead with clean, confident typing.',
    'speed_burst': 'Burst rounds reward explosive starts. Push early, keep your form clean, and hold the pace long enough to break your opponent.',
    'code': 'function renderLeaderboard(rankings) { return rankings.filter(player => player.wpm > 80).map(player => player.username).join(", "); }',
    'memory': 'Remember the phrase before the countdown ends, then reproduce it with focus, control, and steady breathing under pressure.',
    'quote': 'Discipline beats motivation when the work must be done every day, especially when excellence is built one correct character at a time.',
    'marathon': 'Long-form races test endurance. The fastest typists conserve motion, preserve posture, and finish with accuracy still intact.',
}
LIVE_BATTLE_PASSAGE_PARTS = {
    'standard': {
        'intros': [
            'Nairobi arena memo: the 1v1 card is live and both players have one clean minute to own the room without drifting into panic.',
            'Prime duel briefing: the lobby is loud, the stakes are even, and this matchup will reward the player who types with cleaner rhythm from the opening word.',
            'Championship room update: two typists loaded in with no room for lazy corrections once the countdown breaks and the first line starts to move.',
            'Kenya server notice: tonight\'s versus race favors disciplined hands, sharp focus, and smooth recovery whenever pressure spikes near the end.',
            'Matchday bulletin: the duel looks even on paper, but the scoreboard will reward the player who keeps execution cleaner through every transition.',
        ],
        'focuses': [
            'Preserve every symbol, bracket, and quote while holding the phrase "hold the lane, own the finish" exactly as shown.',
            'Keep commas, slashes, and score tags locked in place because small details decide more duels than raw speed alone.',
            'Type with stable tempo through every checkpoint and protect the quoted line "finish clean, not frantic" without breaking form.',
            'Carry calm hands across the full sentence and do not let one rushed correction damage the flow of the round.',
            'Stay composed through punctuation clusters, closing marks, and the final burst where most players lose free points.',
        ],
        'metrics': [
            'Watch figures like 16, 38, and 97.1%, plus symbols such as %, /, #, and :, exactly as written.',
            'Protect values like 24, 44, and 91.6 while keeping ratio 4:1 and checkpoint #08 untouched.',
            'Keep 5:3, 28, and 86.4 intact while every slash, comma, and dash stays in its original place.',
            'Lock in 17, 42, and 108 with the same discipline you use on every bracket and quote.',
            'Preserve 31, 57, and 93.8 while each symbol, number, and pause marker lands cleanly.',
        ],
        'closers': [
            'The result screen usually belongs to the player who keeps form longer than the crowd expects.',
            'Silent hands and a louder scoreboard still win more races than flashy panic ever will.',
            'Pressure only changes the board when a typist stops trusting clean motion near the finish.',
            'The final gap often appears in the last seconds when one player protects details and the other leaks them.',
        ],
    },
    'survival': {
        'intros': [
            'Survival room alert: one careless entry can swing the whole duel, so every line now carries real pressure.',
            'Final-life dispatch: both players are deep enough into the round that every dropped mark becomes a free opening.',
            'Arena elimination notice: this survival battle will punish panic faster than it rewards reckless speed.',
            'Clutch-round memo: the room is tight, the pressure is rising, and the cleanest typist usually survives longest.',
            'Matchpoint signal: once survival mode narrows, one rushed correction can erase a full stretch of solid typing.',
        ],
        'focuses': [
            'Preserve the warning "protect the lead with precision" and keep every closing symbol in place.',
            'Type through decimals, quotes, and brackets without giving away cheap mistakes on the safer parts of the line.',
            'Hold your rhythm steady even when punctuation stacks up and the room starts to feel louder than the text.',
            'Keep the phrase "clean correction beats desperate recovery" exactly as shown from start to finish.',
            'Resist panic when slash, colon, and percentage marks arrive back to back in the pressure zone.',
        ],
        'metrics': [
            'Keep #18, 9/12, and 91.3 exact while preserving brackets and semicolons across the line.',
            'Protect 14, 63, and 92.1 with the same care you give to %, #, and /.',
            'Hold 31, 57, and 88.6 intact while symbols like {}, (), and : stay untouched.',
            'Preserve 12/16, 94.2%, and code tags like #11 without a rushed slip.',
            'Lock in 3, 11, and 87.4 while each symbol and pause marker remains clean.',
        ],
        'closers': [
            'Survival rounds are usually decided by whichever player keeps breathing when the line tightens.',
            'The board flips late when one typist guards details and the other starts rushing them.',
            'Pressure punishes loose hands faster than it rewards brave ones.',
            'One clean final sequence can matter more than a fast opening half.',
        ],
    },
    'speed_burst': {
        'intros': [
            'Burst race dispatch: the opening seconds will shape the whole board before either player fully settles.',
            'Quickfire lobby update: this duel rewards the typist who explodes early without losing structure.',
            'Short-clock esports note: the first line matters more than usual because the timer leaves no room for lazy recoveries.',
            'Fast-lane memo: both players need instant rhythm because hesitation gets punished almost immediately.',
            'Velocity room bulletin: this sprint will turn on who launches hardest while still keeping the sentence clean.',
        ],
        'focuses': [
            'Preserve the phrase "start hot, stay sharp, end cleaner" exactly as shown while the speed rises.',
            'Keep every dash, slash, and quote in place because burst duels leak points on tiny misses.',
            'Type "hit the gas, keep the shape, close with intent" with zero drift on punctuation.',
            'Hold your line through the first surge and do not let one rushed correction flatten the whole run.',
            'Explode forward, but protect each detail once the paragraph starts stacking symbols and short pauses.',
        ],
        'metrics': [
            'Protect #07, 5:2, and 18.4 while every symbol, number, and pause marker stays intact.',
            'Keep 21, 56, and 99% untouched together with each dash, comma, and slash.',
            'Preserve 11, 34, and 95.7 plus symbols like #, /, and : exactly as written.',
            'Lock in 7, 19, and 98.2 while all punctuation lands cleanly at full pace.',
            'Hold 23, 41, and 90.9 without dropping %, /, or # near the close.',
        ],
        'closers': [
            'Burst rooms are won by players who stay sharp after the first explosion, not just during it.',
            'A clean finish still beats a noisy launch when both players start fast.',
            'The smallest stumble feels bigger in a short race because the clock never slows down.',
            'Fast hands matter most when they still respect the shape of the sentence.',
        ],
    },
    'code': {
        'intros': [
            'Developer showdown brief: this room uses code syntax, so every symbol carries real weight from the opening token.',
            'Scrim build notice: code mode rewards typists who can stay calm while operators, braces, and underscores pile up.',
            'Match script update: one missing character can flip the entire board faster than a slow hand ever could.',
            'Arena dev log: this duel runs on precision because punctuation errors cost harder in code than in prose.',
            'Finals compile memo: both players need clean structure when the line fills with quotes, brackets, and operators.',
        ],
        'focuses': [
            'Preserve every backtick, semicolon, and brace while keeping the snippet structurally correct all the way through.',
            'Type the full sequence with exact spacing because one missing symbol can change the entire meaning of the line.',
            'Keep the expression intact from start to finish and protect every quote, underscore, and operator.',
            'Hold the syntax steady through brackets, colons, and logical checks without improvising a single character.',
            'Respect the structure of the snippet and keep every delimiter locked in its original place.',
        ],
        'metrics': [
            'Protect values like 12, 27, and 91.8 while symbols such as {}, (), and ; remain exact.',
            'Keep room_id, latency_ms=37, and tags like #sync untouched through the full run.',
            'Preserve score > 88, errors < 3, and update_v3 while every brace and quote stays clean.',
            'Hold "P-17", 96.4, and retry-room-8 exactly as written alongside each underscore and bracket.',
            'Keep 92.5, 19:45, and winner?.name ?? "pending" in place without dropping any operator.',
        ],
        'closers': [
            'Code rooms usually reward the player who respects structure more than the one who only chases speed.',
            'One missing symbol can erase a strong run faster than any slow split on the board.',
            'Clean syntax still beats reckless pace when the final comparison is exact.',
            'The strongest coders in the arena type symbols like they matter, because they do.',
        ],
    },
    'memory': {
        'intros': [
            'Memory duel prompt: the best players capture the shape first, then trust rhythm when the recall window closes.',
            'Recall sprint memo: this room rewards typists who can hold structure under pressure instead of rushing the release.',
            'Retention battle note: memory mode flips fast when one player remembers punctuation and the other only remembers words.',
            'Short-retention alert: both players saw the pattern, but only one will carry every detail into the final output.',
            'Mental map briefing: this duel is about storing the line cleanly before speed even becomes a factor.',
        ],
        'focuses': [
            'Preserve the phrase "see it once, type it right" exactly while holding the structure together.',
            'Type "hold the image, trust the fingers" with the same punctuation and spacing shown in the room.',
            'Keep every symbol, ratio, and quoted note intact because memory races leak points on tiny forgotten details.',
            'Lock in the pattern first, then release it with calm hands even when the pressure starts to rise.',
            'Carry the sequence cleanly through slashes, brackets, and numbers without guessing the missing shape.',
        ],
        'metrics': [
            'Protect 14, 29, and 73 while symbols like %, :, /, and () remain exact.',
            'Keep #5, 2:1, and 88.7% untouched together with every quote and slash.',
            'Preserve 18, 46, and 90.5 while symbols such as %, #, and () stay in place.',
            'Hold 6:2, 33, and 92.4 with the same care you give every comma and quote.',
            'Keep 27, 52, and 89.6 intact while :, /, and # land exactly where they belong.',
        ],
        'closers': [
            'Memory rooms usually belong to the player who guards structure even when speed starts pulling harder.',
            'Clean recall beats brave guessing once the last line begins to tighten.',
            'The scoreboard rewards the typist who remembers the details others think are safe to improvise.',
            'One forgotten symbol near the end can undo a whole minute of disciplined recall.',
        ],
    },
    'quote': {
        'intros': [
            'Arena quote note: this duel carries more pressure than noise, and the cleanest player usually looks calm the whole way through.',
            'Match wisdom briefing: strong typists build their lead one exact character at a time before the board finally shows it.',
            'Private room quote update: patience, form, and detail control often decide these battles more than loud confidence ever does.',
            'Scoreboard memo: the line looks simple until the symbols, timing marks, and final phrase start punishing lazy hands.',
            'Champion quote bulletin: the room will reward the player who trusts clean repetition when the tension rises late.',
        ],
        'focuses': [
            'Preserve the quote "calm is a weapon" exactly as written and do not let the punctuation drift.',
            'Keep the phrase "precision leaves no argument" intact while every slash, symbol, and pause stays clean.',
            'Type "focus > noise" with the same confidence and structure shown in the original line.',
            'Hold "calm pressure wins finals" exactly as displayed while protecting the rest of the sentence from rushed edits.',
            'Carry "patience builds pace" to the finish without breaking form on any symbol or number.',
        ],
        'metrics': [
            'Protect ratio 3:2, checkpoint #14, and 21:30 with every symbol left exactly in place.',
            'Keep 64, 117, and 92.8 untouched together with each > sign, quote, and slash.',
            'Preserve 22, 49, and 94.4 while %, /, and # remain exact from open to close.',
            'Hold 71, 105, and 91.2 with the same discipline you use on every quote and bracket.',
            'Keep 13, 58, and 96.1 intact while all slashes, commas, and quotes stay untouched.',
        ],
        'closers': [
            'Quiet confidence still wins more rooms than noisy panic once the final words arrive.',
            'The board rarely lies for long when one player protects form and the other stops trusting it.',
            'Good quotes expose rushed hands because every symbol feels more visible near the end.',
            'The final gap usually comes from discipline, not drama.',
        ],
    },
    'marathon': {
        'intros': [
            'Endurance duel report: long rooms reveal every habit once the early adrenaline fades and both players have to settle.',
            'Distance battle memo: marathon mode rewards efficient motion, breathing control, and clean correction choices over flashy starts.',
            'Extended room bulletin: the player who stays compact after line three usually owns the final board in long-form duels.',
            'Long-set arena note: posture, rhythm, and detail protection matter more with every extra sentence in a marathon room.',
            'Deep-race briefing: this challenge will expose wasted movement the same way a long final exposes weak fundamentals.',
        ],
        'focuses': [
            'Preserve the closing instruction "stay smooth through the final stretch" exactly as written.',
            'Keep "endurance is accuracy under fatigue" intact while every bracket, symbol, and pause marker stays clean.',
            'Type "steady rhythm outlasts sudden pace" with the same discipline you began the room with.',
            'Hold "finish disciplined, not exhausted" exactly while every quote, slash, and percentage sign remains in place.',
            'Protect the shape of the sentence through every longer clause because marathon rooms punish sloppy drift.',
        ],
        'metrics': [
            'Keep 31, 58, and 104.3% untouched with every comma, bracket, and number preserved.',
            'Preserve 26, 44, and 89.9 together with symbols like %, /, #, and ; exactly as shown.',
            'Hold 19, 67, and 93.0 while %, /, :, and # remain in their original places.',
            'Protect 32, 74, and 90.7 plus each semicolon and bracket without breaking rhythm.',
            'Keep 28, 61, and 95.2 intact while every quote, slash, and symbol lands cleanly.',
        ],
        'closers': [
            'Marathon wins usually come from efficient hands that stay disciplined after the easy pace disappears.',
            'Long-form rooms punish sloppy recovery because the sentence keeps offering more ways to leak points.',
            'The gap often opens late when one player preserves posture and the other starts forcing speed.',
            'Endurance still belongs to the typist who respects clean motion all the way to the last character.',
        ],
    },
}


def _extend_passage_parts(parts_map: Dict[str, Dict[str, list[str]]], extra_parts: Dict[str, list[str]]) -> None:
    for sector_parts in parts_map.values():
        for bucket_name, extra_values in extra_parts.items():
            bucket = sector_parts.setdefault(bucket_name, [])
            for value in extra_values:
                cleaned = str(value or '').strip()
                if cleaned and cleaned not in bucket:
                    bucket.append(cleaned)


PRACTICE_EXTRA_PARTS = {
    'intros': [
        'Advanced practice note: this sector is meant to feel denser, longer, and more like a real ranked drill.',
        'Precision ladder update: this solo run now leans harder into symbol density, longer clauses, and steady pressure.',
        'Tournament rehearsal memo: treat every line like a controlled competition sequence rather than a sample paragraph.',
    ],
    'focuses': [
        'Keep the rhythm stable through nested punctuation, quoted fragments, and bracket pairs without flattening the line.',
        'Preserve mixed character clusters like a1, g7, and t9 while the sentence keeps stretching across the full screen.',
        'Hold the structure of the paragraph from the first word to the final symbol, even when the text starts to stack.',
    ],
    'metrics': [
        'Keep 41, 83, and 97.2% exact while #, /, :, ;, and () stay perfectly aligned.',
        'Protect 19:08, 62, and 88.4 while underscores, dashes, and quotes remain locked in place.',
        'Preserve 7/11, 54, and 91.0 together with {}, [], <>, and comma-separated values.',
    ],
    'closers': [
        'This practice sector should now feel long enough to build real endurance, not just warm up the fingers.',
        'Longer training lines help the hands learn how to stay accurate after the easy part is over.',
        'The best practice rounds are the ones that feel demanding from the middle all the way to the final mark.',
    ],
}

LIVE_EXTRA_PARTS = {
    'intros': [
        'Live arena escalation: this sector is meant to feel tighter, cleaner, and more competitive than a simple warm-up.',
        'Ranked duel briefing: both players need longer focus windows because the board rewards sustained accuracy now.',
        'Match pressure update: this live sector is built to punish lazy rhythm and reward deliberate control.',
    ],
    'focuses': [
        'Protect the quoted phrase, the numerical cluster, and every symbol in between while the pace keeps rising.',
        'Carry through nested punctuation, angle marks, and slash-separated values without losing the sentence shape.',
        'Keep the duel text readable under pressure so every character still feels intentional and hard-earned.',
    ],
    'metrics': [
        'Maintain 12, 68, and 99.1% while /, #, :, ;, and " " stay untouched.',
        'Hold 23:11, 57, and 94.7 with {}, [], <>, and operator-like symbols aligned exactly.',
        'Preserve 4/9, 81, and 90.3 while commas, dashes, and apostrophes remain clean.',
    ],
    'closers': [
        'Live sectors should now carry enough density to feel like a real duel instead of a short lap.',
        'The harder the passage feels, the more it rewards controlled hands and disciplined recovery.',
        'Competitive text is most useful when it stays demanding right through the final character.',
    ],
}
LIVE_BATTLE_PASSAGE_BANK = {
    mode: _build_live_mode_passages(parts)
    for mode, parts in LIVE_BATTLE_PASSAGE_PARTS.items()
}
MARKETPLACE_ITEMS = [
    {
        'id': 'skin_velocity_black',
        'name': 'Velocity Black Keys',
        'category': 'keyboardSkins',
        'price': 140,
        'rarity': 'rare',
        'collection': 'Ranked Circuit',
        'displayMark': 'VB',
        'description': 'A stripped-back tournament keyboard skin with sharp legends, dark carbon keys, and high-contrast focus lines.',
    },
    {
        'id': 'skin_molten_copper',
        'name': 'Molten Copper Deck',
        'category': 'keyboardSkins',
        'price': 185,
        'rarity': 'epic',
        'collection': 'Founders Forge',
        'displayMark': 'MC',
        'description': 'Burnished copper highlights and ember edge-lighting for players who want their race setup to feel expensive.',
    },
    {
        'id': 'skin_frostline_pro',
        'name': 'Frostline Pro Keys',
        'category': 'keyboardSkins',
        'price': 225,
        'rarity': 'legendary',
        'collection': 'Winter Major',
        'displayMark': 'FP',
        'description': 'Ice-glass keycaps and elite tournament trim that give the whole typing deck a colder championship presence.',
    },
    {
        'id': 'theme_nairobi_night',
        'name': 'Nairobi Night Theme',
        'category': 'typingThemes',
        'price': 210,
        'rarity': 'epic',
        'collection': 'City After Dark',
        'displayMark': 'NN',
        'description': 'A deep city-light interface with crisp neon lanes, warm dashboard glow, and premium leaderboard contrast.',
    },
    {
        'id': 'theme_savanna_gold',
        'name': 'Savanna Gold Theme',
        'category': 'typingThemes',
        'price': 195,
        'rarity': 'rare',
        'collection': 'Sunline Series',
        'displayMark': 'SG',
        'description': 'Golden dusk accents, clean sand-toned surfaces, and a warmer arena mood that still feels competitive.',
    },
    {
        'id': 'theme_stealth_hq',
        'name': 'Stealth HQ Theme',
        'category': 'typingThemes',
        'price': 260,
        'rarity': 'legendary',
        'collection': 'Blacksite Pack',
        'displayMark': 'SH',
        'description': 'Minimal graphite panels, stealth indicators, and a disciplined esports look built for serious ranked players.',
    },
    {
        'id': 'avatar_apex_panther',
        'name': 'Apex Panther Avatar',
        'category': 'avatars',
        'price': 150,
        'rarity': 'rare',
        'collection': 'Night Hunt',
        'displayMark': 'AP',
        'description': 'A sleek predatory profile icon for players who want a colder, sharper identity on the leaderboard.',
    },
    {
        'id': 'avatar_signal_ghost',
        'name': 'Signal Ghost Avatar',
        'category': 'avatars',
        'price': 135,
        'rarity': 'epic',
        'collection': 'Blacksite Pack',
        'displayMark': 'SG',
        'description': 'A masked signal-style avatar that feels built for private rooms, stealth wins, and silent climb sessions.',
    },
    {
        'id': 'avatar_crown_hawk',
        'name': 'Crown Hawk Avatar',
        'category': 'avatars',
        'price': 240,
        'rarity': 'legendary',
        'collection': 'Skyline Prestige',
        'displayMark': 'CH',
        'description': 'A premium emblem-avatar hybrid that gives your public card a champion-level silhouette.',
    },
    {
        'id': 'badge_founders_mark',
        'name': 'Founder Mark Badge',
        'category': 'premiumBadges',
        'price': 220,
        'rarity': 'legendary',
        'collection': 'Legacy Drop',
        'displayMark': 'FM',
        'description': 'A high-status founder badge for players who want instant credibility the moment their profile loads.',
    },
    {
        'id': 'badge_clutch_streak',
        'name': 'Clutch Streak Badge',
        'category': 'premiumBadges',
        'price': 175,
        'rarity': 'epic',
        'collection': 'Ranked Circuit',
        'displayMark': 'CS',
        'description': 'A sharper badge for players who win close races, hold streaks, and make pressure look routine.',
    },
    {
        'id': 'badge_elite_verified',
        'name': 'Elite Verified Badge',
        'category': 'premiumBadges',
        'price': 125,
        'rarity': 'rare',
        'collection': 'Pro Access',
        'displayMark': 'EV',
        'description': 'A clean verified-style marker that makes your profile feel trusted, established, and worth clicking into.',
    },
    {
        'id': 'effect_reactor_sparks',
        'name': 'Reactor Sparks Effect',
        'category': 'animatedEffects',
        'price': 165,
        'rarity': 'rare',
        'collection': 'Energy Lab',
        'displayMark': 'RS',
        'description': 'Fast electric sparks that punch through your result card and make personal-best finishes feel explosive.',
    },
    {
        'id': 'effect_afterburn_wave',
        'name': 'Afterburn Wave Effect',
        'category': 'animatedEffects',
        'price': 205,
        'rarity': 'epic',
        'collection': 'Velocity Series',
        'displayMark': 'AW',
        'description': 'A wider, brighter win effect that gives your results panel the feeling of a premium finisher animation.',
    },
    {
        'id': 'effect_royal_echo',
        'name': 'Royal Echo Effect',
        'category': 'animatedEffects',
        'price': 275,
        'rarity': 'legendary',
        'collection': 'Crown Edition',
        'displayMark': 'RE',
        'description': 'A top-tier prestige pulse reserved for players who want their wins to land with a richer, more elite finish.',
    },
    {
        'id': 'frame_titan_brass',
        'name': 'Titan Brass Frame',
        'category': 'profileFrames',
        'price': 145,
        'rarity': 'rare',
        'collection': 'Forge Line',
        'displayMark': 'TB',
        'description': 'A weighty metallic frame that makes challenge cards look more premium without feeling loud.',
    },
    {
        'id': 'frame_carbonglass',
        'name': 'Carbon Glass Frame',
        'category': 'profileFrames',
        'price': 190,
        'rarity': 'epic',
        'collection': 'Stealth Grid',
        'displayMark': 'CG',
        'description': 'Layered carbon and glass styling that sharpens your player card into something sleek and competitive.',
    },
    {
        'id': 'frame_imperial_crown',
        'name': 'Imperial Crown Frame',
        'category': 'profileFrames',
        'price': 290,
        'rarity': 'legendary',
        'collection': 'Crown Edition',
        'displayMark': 'IC',
        'description': 'A flagship prestige frame with ceremonial trim and unmistakable top-tier presence on your public profile.',
    },
    {
        'id': 'perk_tournament_cashback',
        'name': 'Tournament Cashback Pass',
        'category': 'utilityPasses',
        'price': 320,
        'rarity': 'legendary',
        'collection': 'Arena Advantage',
        'displayMark': 'TC',
        'benefit': 'Get 10% of every tournament entry returned to your wallet automatically after confirmation.',
        'description': 'A permanent tournament perk that refunds part of every confirmed entry straight back into your wallet.',
    },
    {
        'id': 'perk_season_booster',
        'name': 'Season Points Booster',
        'category': 'utilityPasses',
        'price': 240,
        'rarity': 'epic',
        'collection': 'Ladder Edge',
        'displayMark': 'SP',
        'benefit': 'Earn 8% more season points across your profile and leaderboard progression.',
        'description': 'A lighter progression edge for players who want a season boost without overpowering pure typing performance.',
    },
    {
        'id': 'perk_signature_invites',
        'name': 'Signature Invite Pass',
        'category': 'utilityPasses',
        'price': 180,
        'rarity': 'rare',
        'collection': 'Private Rooms Pro',
        'displayMark': 'SI',
        'benefit': 'Create private rooms with your own custom invite code instead of using a random one.',
        'description': 'A creator-friendly upgrade that lets you brand private room invites with a cleaner custom code.',
    },
]
STORE_BUNDLES = [
    {
        'id': 'bundle_ranked_identity',
        'name': 'Ranked Identity Pack',
        'item_ids': ['avatar_crown_hawk', 'frame_carbonglass', 'badge_elite_verified'],
        'discount_rate': 0.15,
    },
    {
        'id': 'bundle_arena_luxe',
        'name': 'Arena Luxe Pack',
        'item_ids': ['theme_nairobi_night', 'skin_frostline_pro', 'effect_afterburn_wave'],
        'discount_rate': 0.18,
    },
    {
        'id': 'bundle_creator_room',
        'name': 'Creator Room Pack',
        'item_ids': ['perk_signature_invites', 'avatar_signal_ghost', 'frame_imperial_crown'],
        'discount_rate': 0.12,
    },
]
PRACTICE_PASSAGE_PARTS = {
    'standard': {
        'intros': [
            'Practice arena note: this solo standard run is built to sharpen rhythm before you step back into real duels.',
            'Warm-up card: standard mode rewards clean timing, strong posture, and steady confidence through the full paragraph.',
            'Solo sprint memo: use this practice block to build smoother motion before pressure and spectators get involved.',
            'Training room update: standard practice should feel disciplined, not frantic, even when the pace begins to rise.',
            'Focus session briefing: this run is about turning repetition into cleaner execution one sentence at a time.',
        ],
        'focuses': [
            'Preserve every symbol, comma, and quote while holding the phrase "practice clean, race cleaner" exactly as shown.',
            'Keep your line compact through brackets, slashes, and pause marks instead of forcing speed too early.',
            'Type with calm hands and protect the structure of the full sentence from opening word to closing mark.',
            'Use the round to build a smoother lane through punctuation clusters and small correction moments.',
            'Hold steady rhythm across the paragraph and do not let one rushed sequence break the flow of the session.',
        ],
        'metrics': [
            'Keep values like 18, 47, and 93.4% intact, together with symbols such as %, /, #, and :.',
            'Protect 26, 59, and 91.2 while every bracket, quote, and dash remains in place.',
            'Preserve checkpoint #06, ratio 3:1, and figures 14 and 72 exactly as written.',
            'Hold 22, 41, and 96.0 while commas, slashes, and semicolons stay clean.',
            'Keep 9:4, 33, and 88.7% untouched through the whole run.',
        ],
        'closers': [
            'The point of practice is to make clean motion feel normal before the scoreboard matters.',
            'Strong public results usually begin with quiet private sessions like this one.',
            'The best training runs are the ones that feel controlled all the way to the last character.',
            'Clean repetition here becomes confidence when the live clock starts later.',
        ],
    },
    'survival': {
        'intros': [
            'Survival practice alert: this solo round is here to train calm hands when every mistake feels louder.',
            'Training pressure memo: survival mode teaches you to protect details after the first clean streak ends.',
            'Last-life practice note: use this session to build precision when punctuation and pressure arrive together.',
            'Clutch prep briefing: survival practice matters because real matches punish rushed recovery the same way.',
            'Control drill update: every symbol in this paragraph is part of the pressure test.',
        ],
        'focuses': [
            'Preserve the quote "clean correction beats desperate recovery" exactly as shown through the full line.',
            'Keep breathing steady while decimals, slashes, and brackets stack up toward the finish.',
            'Type through pressure without handing away free errors on the easy sections of the paragraph.',
            'Hold your form when symbols arrive back to back and the line starts feeling tighter than expected.',
            'Use this run to train discipline on the parts that usually trigger panic in live play.',
        ],
        'metrics': [
            'Keep #12, 8/14, and 91.5 exact while brackets and semicolons remain untouched.',
            'Protect 15, 38, and 88.9% with every %, #, and / left in place.',
            'Preserve 27, 64, and 92.3 together with {}, (), and :.',
            'Hold 11:3, 49, and 90.1 while each quote and slash stays clean.',
            'Keep 6, 29, and 94.0 intact through the full pressure sequence.',
        ],
        'closers': [
            'Survival practice is where you learn to stay composed before the real room turns loud.',
            'The players who panic less in training usually leak less in live finals.',
            'Pressure becomes manageable once your hands trust accuracy more than fear.',
            'One clean closing sequence in practice often fixes a whole class of live mistakes.',
        ],
    },
    'speed_burst': {
        'intros': [
            'Burst practice memo: this short run is built to sharpen your opening speed without wrecking structure.',
            'Quickfire training card: use this session to attack early while keeping your correction cost low.',
            'Fast-start drill update: burst mode teaches you how to launch with intent and still stay clean.',
            'Velocity prep note: this paragraph trains the first ten seconds where many live duels are decided.',
            'Sprint warm-up briefing: this run is about fast confidence, not careless speed.',
        ],
        'focuses': [
            'Preserve the line "start hot, stay sharp, end cleaner" exactly as shown while the pace rises.',
            'Keep dashes, quotes, and slashes locked in place even when your fingers want to sprint ahead.',
            'Type with explosive intent, but protect the structure of every short phrase and symbol cluster.',
            'Train yourself to finish the burst without flattening your accuracy on the final words.',
            'Use this mode to build recovery speed after tiny slips instead of letting them expand.',
        ],
        'metrics': [
            'Keep #03, 5:2, and 18.8 intact while each symbol and comma remains clean.',
            'Protect 12, 31, and 97.0% with every slash, quote, and dash untouched.',
            'Preserve 8:1, 27, and 94.6 exactly as written through the short clock.',
            'Hold 21, 46, and 98.1 while %, /, and # stay in their original places.',
            'Keep 7, 39, and 90.8 intact across the whole burst sequence.',
        ],
        'closers': [
            'Burst training works best when speed grows without accuracy breaking underneath it.',
            'The cleanest opening is still more useful than the loudest one.',
            'Short sessions like this teach your hands how to stay sharp after the launch.',
            'A fast start becomes dangerous only when the structure survives it.',
        ],
    },
    'code': {
        'intros': [
            'Code practice briefing: this solo dev run is built to sharpen syntax accuracy before competitive code rooms.',
            'Training compile note: code mode rewards typists who can respect structure even when the line grows messy.',
            'Syntax drill memo: every bracket, operator, and quote in this session matters as much as the words.',
            'Developer warm-up card: this practice block should make symbols feel less expensive under live pressure.',
            'Solo script update: use this run to build cleaner code rhythm before real room stakes return.',
        ],
        'focuses': [
            'Preserve every brace, semicolon, underscore, and quote exactly through the full snippet.',
            'Keep the structure intact from start to finish because one missing symbol can break the whole line.',
            'Type with steady spacing while logical operators, brackets, and tags begin to stack up.',
            'Respect the syntax more than the pace and let clean structure guide the full run.',
            'Use this drill to make symbols feel automatic instead of stressful.',
        ],
        'metrics': [
            'Keep room_id, retry_count, and 91.8 exact while {}, (), and ; remain untouched.',
            'Protect score > 88, errors < 3, and latency_ms=37 across the whole snippet.',
            'Preserve "P-17", update_v3, and 96.4 while quotes, braces, and commas stay clean.',
            'Hold 19:45, #sync, and result_map["room-4"] exactly as written.',
            'Keep 92.5, clean-win, and retry-room-8 intact with every operator in place.',
        ],
        'closers': [
            'Code practice pays off when symbols stop feeling like traps in live rooms.',
            'The strongest code typists train structure until panic has less to break.',
            'Clean syntax in practice becomes quiet confidence in competition.',
            'A disciplined dev run teaches your fingers to respect every character equally.',
        ],
    },
    'memory': {
        'intros': [
            'Memory practice prompt: this run trains structure retention before speed takes over.',
            'Recall session note: solo memory work is where you teach your hands to trust the stored pattern.',
            'Retention drill memo: this paragraph is built to sharpen recall on numbers, punctuation, and order.',
            'Mental map warm-up: use this run to hold the shape before you chase pace.',
            'Short-retention training update: every detail here is part of the memory test.',
        ],
        'focuses': [
            'Preserve the line "see it once, type it right" exactly as shown throughout the run.',
            'Keep the pattern intact through slashes, quotes, and ratios without guessing missing pieces.',
            'Type from structure first and let speed follow once the sequence feels stable.',
            'Hold the image of the line cleanly even when the details begin to pile up.',
            'Use this drill to protect punctuation as strongly as words and numbers.',
        ],
        'metrics': [
            'Keep 14, 29, and 73 intact together with %, :, /, and ().',
            'Protect #5, 2:1, and 88.7% while every quote and slash remains in place.',
            'Preserve 18, 46, and 90.5 through the full recall sequence.',
            'Hold 6:2, 33, and 92.4 exactly as written in the room.',
            'Keep 27, 52, and 89.6 while :, /, and # stay untouched.',
        ],
        'closers': [
            'Memory practice works when the structure survives even after the first rush fades.',
            'The clearest recall usually comes from calm repetition rather than forced speed.',
            'Training memory this way makes live recall rooms feel much less chaotic.',
            'One clean practice run can fix several lazy habits at once.',
        ],
    },
    'quote': {
        'intros': [
            'Quote practice note: this session is for building calm rhythm on reflective text before pressure returns.',
            'Solo quote memo: use this run to sharpen punctuation discipline on lines that look easier than they are.',
            'Practice wisdom card: these rounds reward patience, timing, and steady attention to detail.',
            'Training quote update: this paragraph is here to make clean phrasing feel automatic under your fingers.',
            'Focus quote briefing: let the sentence teach control before the live room asks for speed.',
        ],
        'focuses': [
            'Preserve the phrase "focus > panic" exactly as shown through every symbol and pause.',
            'Keep the full quote intact while commas, slashes, and timing marks stay in their original places.',
            'Type with clean pacing and do not let one rushed section break the shape of the whole line.',
            'Use the paragraph to train detail protection on small marks that live players often overlook.',
            'Hold the quote steady from opening word to final character without flattening its structure.',
        ],
        'metrics': [
            'Keep ratio 3:2, checkpoint #11, and 21:15 intact while all symbols remain exact.',
            'Protect 22, 49, and 94.4 together with %, /, and # exactly as written.',
            'Preserve 13, 58, and 96.1 while every quote and bracket stays untouched.',
            'Hold 71, 105, and 91.2 with the same care you give each symbol.',
            'Keep 64, 117, and 92.8 across the line without punctuation drift.',
        ],
        'closers': [
            'Quote practice becomes powerful when rhythm and detail start feeling inseparable.',
            'The cleanest live quote rooms usually begin with quiet sessions like this.',
            'Strong phrasing under pressure comes from disciplined repetition in training.',
            'A calm practice line often teaches more than a rushed leaderboard chase.',
        ],
    },
    'marathon': {
        'intros': [
            'Marathon practice report: this long-form run is designed to train endurance before you return to deeper races.',
            'Distance session memo: long paragraphs reveal whether your posture and rhythm can survive beyond the opening burst.',
            'Extended practice note: marathon mode teaches efficient motion after the easy pace disappears.',
            'Endurance warm-up briefing: use this run to protect form through a longer line without forcing speed.',
            'Long-set training update: every sentence here is meant to stretch your focus without letting accuracy collapse.',
        ],
        'focuses': [
            'Preserve the phrase "stay smooth through the final stretch" exactly as shown across the whole run.',
            'Keep your rhythm compact through longer clauses, symbols, and pause marks instead of drifting late.',
            'Type with patient control when the paragraph begins to feel heavy and repetitive.',
            'Use this mode to build efficient movement after the early adrenaline of the session fades.',
            'Hold clean structure through the deeper part of the sentence where fatigue usually leaks points.',
        ],
        'metrics': [
            'Keep 31, 58, and 104.3% intact while commas, brackets, and symbols remain clean.',
            'Protect 26, 44, and 89.9 with %, /, #, and ; left exactly in place.',
            'Preserve 19, 67, and 93.0 while %, /, :, and # stay untouched.',
            'Hold 32, 74, and 90.7 with every semicolon and bracket locked in.',
            'Keep 28, 61, and 95.2 intact from opening word to final mark.',
        ],
        'closers': [
            'Marathon practice is where efficient hands learn to outlast early excitement.',
            'Long-form control grows when you protect rhythm after the sentence stops feeling easy.',
            'The best endurance gains come from staying disciplined after fatigue first appears.',
            'Clean long sessions turn into stronger closing speed in every other mode too.',
        ],
    },
}


_extend_passage_parts(PRACTICE_PASSAGE_PARTS, PRACTICE_EXTRA_PARTS)
_extend_passage_parts(LIVE_BATTLE_PASSAGE_PARTS, LIVE_EXTRA_PARTS)

AI_PASSAGE_BANK = {
    mode: _build_live_mode_passages(parts)
    for mode, parts in PRACTICE_PASSAGE_PARTS.items()
}
AI_PASSAGE_BANK.update({
    'coding': list(AI_PASSAGE_BANK['code']),
    'business': list(AI_PASSAGE_BANK['standard']),
    'exam': list(AI_PASSAGE_BANK['memory']),
    'french': [
        "Rapport d'entrainement 01: la pratique solo renforce le rythme, la precision et la discipline avant les grandes manches. Gardez 14, 27 et 39 exacts, conservez les symboles %, /, # et recopiez \"precision avant vitesse\" sans perdre la structure.",
        "Session de frappe 02: un bon joueur construit sa confiance pendant l'entrainement, surtout quand les chiffres 18, 44 et 91.5% apparaissent avec des signes comme (), :, ; et /. Tapez chaque detail proprement jusqu'au dernier caractere.",
    ],
    'swahili': [
        'Kipindi cha mazoezi 01: mazoezi ya peke yako hujenga mdundo, umakini, na nidhamu kabla ya mechi za moja kwa moja. Linda 12, 48, na 96 pamoja na alama kama %, /, #, na nukuu "usahihi kabla ya kasi" hadi mwisho wa mstari.',
        'Ripoti ya mazoezi 02: mpigaji bora hujenga utulivu wake wakati wa practice, hasa namba 17, 33, na 92.4% zinapoonekana pamoja na alama kama (), :, na /. Andika kila sehemu kwa usafi bila kuvunja mpangilio.',
    ],
    'legal': [
        'Practice agreement note: every solo session should still reward exact typing, clear pacing, and careful attention to symbols before competitive rooms begin.',
    ],
    'medical': [
        'Clinical practice passage: accurate transcription matters because each number, term, and symbol must remain clear from the first character to the last.',
    ],
})

PASSAGE_DECORATORS = [
    'Final check: preserve every digit, symbol, and capital letter exactly as shown.',
    'Reminder: copy punctuation carefully, especially %, #, /, :, ;, quotes, and brackets.',
    'Match note: accuracy drops fast when players skip hyphens, decimals, or closing symbols.',
]


def _season_name() -> str:
    return _get_current_season_name()


def _tier_for_user(user: Dict[str, Any], thresholds: Dict[str, int] | None = None) -> str:
    """
    Tier is determined only by the current season point thresholds.

    `thresholds` can be passed in by callers that already loaded site
    settings (e.g. the leaderboard endpoint looping over many users) to
    avoid re-fetching the same config from the DB for every single row.
    If omitted, thresholds are loaded fresh (fine for one-off lookups).
    """
    season_pts = _safe_int(user.get('season_points_stored') or user.get('seasonPoints') or 0)
    return _tier_for_season_points(season_pts, thresholds)


def _store_perks_from_owned_items(owned_items: list[str] | set[str] | tuple[str, ...]) -> Dict[str, Any]:
    owned = set(owned_items or [])
    season_multiplier = 1.08 if 'perk_season_booster' in owned else 1.0
    tournament_cashback_rate = 0.1 if 'perk_tournament_cashback' in owned else 0.0
    return {
        'seasonPointsMultiplier': season_multiplier,
        'tournamentCashbackRate': tournament_cashback_rate,
        'customInviteCodes': 'perk_signature_invites' in owned,
    }


# Season points are now awarded/deducted per race as they happen, scaled by
# how competitive that race mode actually is, instead of being recomputed
# from lifetime (or even season-aggregate) stats on every request. This is
# what makes a defeat cost points, and what makes a tournament win worth
# more than a 1v1/private-room win, which in turn is worth far more than a
# practice run.
SEASON_RACE_POINTS: Dict[str, Dict[str, int]] = {
    # Tournaments are the highest-stakes competitive mode: biggest reward
    # for winning, biggest hit for losing.
    'tournament': {'win': 60, 'loss': -22},
    # 1v1 matchmaking and private-room battles are both "versus" play —
    # real opponents, but lower stakes than a paid tournament bracket.
    'versus': {'win': 28, 'loss': -12},
}
# Practice (solo) races have no opponent and can't be lost, so they only
# ever trickle in a small flat reward — never more than this, regardless
# of how fast the run was.
PRACTICE_SEASON_POINTS_CAP = 10


def _season_points_delta_for_race(
    *,
    race_category: str,
    did_win: bool,
    wpm: float,
    accuracy: float,
    placement: int = 1,
    total_players: int = 2,
    owned_items: list[str] | set[str] | tuple[str, ...] | None = None,
) -> int:
    """
    Points earned or lost from a single just-completed race, meant to be
    added directly onto season_points_stored (see _apply_season_points_delta).

    race_category is one of:
      - 'tournament': a live race that belongs to a paid tournament bracket
      - 'versus':     a live race that is 1v1 matchmaking or a private room
      - 'practice':   a solo practice run with no opponent

    placement/total_players describe where this player finished in a room
    that can hold more than two racers (currently only tournament rooms —
    matchmaking and private rooms are always exactly 2 players). They only
    affect the size of a *loss*: for a normal 2-player race the scale below
    always works out to 1.0, i.e. an unchanged flat loss.
    """
    wpm = max(0.0, _safe_float(wpm))
    accuracy = max(0.0, _safe_float(accuracy))
    perks = _store_perks_from_owned_items(owned_items or [])
    multiplier = float(perks.get('seasonPointsMultiplier') or 1.0)

    if race_category == 'practice':
        # Small, gentle, hard-capped — grinding practice should never be
        # able to substitute for playing real matches.
        delta = min(PRACTICE_SEASON_POINTS_CAP, max(2, round(wpm / 15)))
        return int(round(delta * multiplier))

    tier_points = SEASON_RACE_POINTS.get(race_category, SEASON_RACE_POINTS['versus'])

    if not did_win:
        # Defeats always cost points. The multiplier is a *reward* perk, so
        # it never softens a loss. In a room bigger than 2 players (only
        # tournaments can be), a close runner-up loses far less than
        # someone who finished last — placement 2 of 2 always scales to
        # a full loss, matching the old flat behaviour exactly.
        total_players = max(2, total_players)
        placement = min(max(placement, 2), total_players)
        scale = (placement - 1) / (total_players - 1)
        return int(round(tier_points['loss'] * scale))

    skill_bonus = 0
    if accuracy >= 98:
        skill_bonus += 6
    elif accuracy >= 95:
        skill_bonus += 3
    if wpm >= 120:
        skill_bonus += 8
    elif wpm >= 100:
        skill_bonus += 4

    delta = tier_points['win'] + skill_bonus
    return int(round(delta * multiplier))


def _apply_season_points_delta(cur, *, user_id: int, delta: int) -> int:
    """Apply one race's point delta onto the running season total, floored at 0."""
    cur.execute(
        'UPDATE users SET season_points_stored = GREATEST(0, season_points_stored + %s) WHERE id = %s',
        (delta, user_id),
    )
    cur.execute('SELECT season_points_stored FROM users WHERE id = %s', (user_id,))
    row = cur.fetchone() or {}
    _clear_leaderboard_cache()
    return int(row.get('season_points_stored') or 0)


def _referral_code_for_user(user: Dict[str, Any]) -> str:
    username = ''.join(ch for ch in str(user.get('username') or 'TYPE') if ch.isalnum()).upper()[:4] or 'TYPE'
    return f'{username}{_safe_int(user.get("id") or 0):04d}'


def _coach_tip_for_user(user: Dict[str, Any]) -> str:
    accuracy = _safe_float(user.get('accuracy') or 0)
    wpm = _safe_float(user.get('wpm') or 0)
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

    duration_seconds = int(row.get('match_duration_mins') or 10) * 60
    end_time = start_time + timedelta(seconds=duration_seconds)
    if now_dt >= end_time:
        return 'completed'
    return 'active'


def _sync_tournament_statuses(cur) -> None:
    cur.execute('SELECT id, start_time, duration, status, match_duration_mins FROM tournaments')
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


def _ensure_typing_content_table(cur) -> None:
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS typing_content (
            id INT AUTO_INCREMENT PRIMARY KEY,
            content_id VARCHAR(80) NOT NULL UNIQUE,
            content_type VARCHAR(20) NOT NULL DEFAULT 'practice',
            mode VARCHAR(40) NOT NULL DEFAULT 'standard',
            language VARCHAR(40) NOT NULL DEFAULT 'english',
            passage TEXT NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_typing_content_lookup (content_type, mode, language, is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )


def _ensure_marketplace_revenue_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS marketplace_revenue (
            id INT AUTO_INCREMENT PRIMARY KEY,
            purchase_id INT NULL,
            buyer_user_id INT NOT NULL,
            admin_user_id INT NULL,
            item_id VARCHAR(80) NOT NULL,
            item_name VARCHAR(150) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            revenue_destination VARCHAR(40) NOT NULL DEFAULT 'platform_hold',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_marketplace_revenue_buyer (buyer_user_id),
            KEY idx_marketplace_revenue_admin (admin_user_id),
            CONSTRAINT fk_marketplace_revenue_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_marketplace_revenue_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT fk_marketplace_revenue_purchase FOREIGN KEY (purchase_id) REFERENCES store_purchases(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _ensure_admin_wallet_transactions_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_wallet_transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_user_id INT NOT NULL,
            transaction_code VARCHAR(100) NOT NULL,
            transaction_type VARCHAR(40) NOT NULL,
            amount DECIMAL(12,2) NOT NULL,
            direction VARCHAR(10) NOT NULL,
            source VARCHAR(40) NOT NULL,
            note VARCHAR(255) NULL,
            related_purchase_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_admin_wallet_tx (transaction_code),
            KEY idx_admin_wallet_user (admin_user_id),
            CONSTRAINT fk_admin_wallet_user FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_admin_wallet_purchase FOREIGN KEY (related_purchase_id) REFERENCES store_purchases(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """
    )


def _ensure_prize_payout_tracking_columns(cur) -> None:
    cur.execute("SHOW COLUMNS FROM prize_payouts LIKE 'payout_method'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE prize_payouts ADD COLUMN payout_method VARCHAR(40) NULL AFTER amount")
    cur.execute("SHOW COLUMNS FROM prize_payouts LIKE 'fee_amount'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE prize_payouts ADD COLUMN fee_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER payout_method")
    cur.execute("SHOW COLUMNS FROM prize_payouts LIKE 'provider_originator_conversation_id'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE prize_payouts ADD COLUMN provider_originator_conversation_id VARCHAR(120) NULL AFTER fee_amount")
    cur.execute("SHOW COLUMNS FROM prize_payouts LIKE 'provider_conversation_id'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE prize_payouts ADD COLUMN provider_conversation_id VARCHAR(120) NULL AFTER provider_originator_conversation_id")
    cur.execute("SHOW COLUMNS FROM prize_payouts LIKE 'result_code'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE prize_payouts ADD COLUMN result_code VARCHAR(40) NULL AFTER provider_conversation_id")
    cur.execute("SHOW COLUMNS FROM prize_payouts LIKE 'result_desc'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE prize_payouts ADD COLUMN result_desc VARCHAR(255) NULL AFTER result_code")
    cur.execute("SHOW COLUMNS FROM prize_payouts LIKE 'failed_at'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE prize_payouts ADD COLUMN failed_at DATETIME NULL AFTER completed_at")


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


def _owned_store_items_for_users(conn, user_ids: list[int] | tuple[int, ...]) -> Dict[int, list[str]]:
    ids = [int(user_id) for user_id in user_ids if int(user_id or 0) > 0]
    if not ids:
        return {}

    placeholders = ', '.join(['%s'] * len(ids))
    owned_map: Dict[int, list[str]] = {user_id: [] for user_id in ids}
    with conn.cursor() as cur:
        _ensure_store_purchase_table(cur)
        cur.execute(
            f'''
            SELECT user_id, item_id
            FROM store_purchases
            WHERE user_id IN ({placeholders})
            ORDER BY purchased_at DESC
            ''',
            tuple(ids),
        )
        for row in cur.fetchall():
            user_id = int(row.get('user_id') or 0)
            item_id = str(row.get('item_id') or '').strip()
            if user_id > 0 and item_id:
                owned_map.setdefault(user_id, []).append(item_id)
    return owned_map


def _ensure_tournament_duration_column(cur) -> None:
    cur.execute("SHOW COLUMNS FROM tournaments LIKE 'match_duration_mins'")
    if not cur.fetchone():
        cur.execute('ALTER TABLE tournaments ADD COLUMN match_duration_mins INT NOT NULL DEFAULT 10 AFTER duration')


def _ensure_tournament_prize_paid_column(cur) -> None:
    cur.execute("SHOW COLUMNS FROM tournament_joins LIKE 'prize_paid'")
    if not cur.fetchone():
        cur.execute('ALTER TABLE tournament_joins ADD COLUMN prize_paid DECIMAL(12,2) NOT NULL DEFAULT 0')


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
    cur.execute("SHOW COLUMNS FROM users LIKE 'equipped_cursor'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE users ADD COLUMN equipped_cursor VARCHAR(80) NULL AFTER equipped_frame")


# â”€â”€ Season reset helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _ensure_season_tables(cur) -> None:
    """Create season_snapshots table and add season tracking columns to users."""
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS season_snapshots (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            season_name   VARCHAR(40) NOT NULL,
            user_id       INT NOT NULL,
            username      VARCHAR(120) NOT NULL,
            season_points INT NOT NULL DEFAULT 0,
            tier          VARCHAR(40) NOT NULL DEFAULT 'Bronze',
            rank_position INT NOT NULL DEFAULT 0,
            snapshotted_at DATETIME NOT NULL,
            INDEX idx_season_name (season_name),
            INDEX idx_user_id     (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )
    cur.execute("SHOW COLUMNS FROM users LIKE 'season_name'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE users ADD COLUMN season_name VARCHAR(40) NULL AFTER accuracy"
        )
    cur.execute("SHOW COLUMNS FROM users LIKE 'season_points_stored'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE users ADD COLUMN season_points_stored INT NOT NULL DEFAULT 0 AFTER season_name"
        )
    cur.execute("SHOW COLUMNS FROM users LIKE 'season_races'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE users ADD COLUMN season_races INT NOT NULL DEFAULT 0 AFTER season_points_stored"
        )
    cur.execute("SHOW COLUMNS FROM users LIKE 'season_wins'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE users ADD COLUMN season_wins INT NOT NULL DEFAULT 0 AFTER season_races"
        )
    cur.execute("SHOW COLUMNS FROM users LIKE 'season_losses'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE users ADD COLUMN season_losses INT NOT NULL DEFAULT 0 AFTER season_wins"
        )
    cur.execute("SHOW COLUMNS FROM users LIKE 'season_earnings'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE users ADD COLUMN season_earnings DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER season_wins"
        )


def _ensure_race_history_audit_columns(cur) -> None:
    """
    Adds an audit trail to race_history so every race's category
    (practice/versus/tournament) and the season-points delta it produced
    are recorded permanently, instead of being computed and thrown away.

    race_category is left NULL-able with no default specifically so we can
    tell "written before this column existed" (NULL) apart from a genuine
    new row (always explicitly set) — that's what lets
    _backfill_legacy_race_history below run safely exactly once.
    """
    cur.execute("SHOW COLUMNS FROM race_history LIKE 'race_category'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE race_history ADD COLUMN race_category VARCHAR(20) NULL AFTER place_position"
        )
    cur.execute("SHOW COLUMNS FROM race_history LIKE 'points_delta'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE race_history ADD COLUMN points_delta INT NOT NULL DEFAULT 0 AFTER race_category"
        )


def _backfill_legacy_race_history(cur) -> None:
    """
    One-time, idempotent correction for race_history rows written before
    race_category existed — which is also every row written before the
    solo-practice win-tracking fix. Those old practice rows could carry
    place_position=1 for merely beating your own rolling average, which
    then fed straight into users.wins/total_races/wpm/accuracy forever.

    Only rows with race_category still NULL get touched, so after the
    first successful run this is a no-op on every subsequent boot.
    Live-race rows are recognisable because the server (never the client)
    always names them 'live_<roomId>_<userId>' — anything else reaching
    race_history came from the solo/practice endpoint.
    """
    cur.execute("SELECT 1 FROM race_history WHERE race_category IS NULL LIMIT 1")
    if not cur.fetchone():
        return

    cur.execute(
        """
        UPDATE race_history
        SET race_category = IF(LEFT(race_code, 5) = 'live_', 'versus', 'practice')
        WHERE race_category IS NULL
        """
    )
    # Neutralise the actual bug: a practice row was never a real win, so it
    # should never have been recorded as place_position=1.
    cur.execute(
        """
        UPDATE race_history
        SET place_position = 2
        WHERE race_category = 'practice' AND place_position = 1
        """
    )
    # Recompute every user's lifetime stats from the now-corrected history
    # in one pass, rather than only the users touched by this boot's races.
    cur.execute(
        """
        UPDATE users u
        JOIN (
            SELECT
                user_id,
                COUNT(*) AS total_races,
                SUM(CASE WHEN place_position = 1 THEN 1 ELSE 0 END) AS wins,
                AVG(wpm) AS avg_wpm,
                AVG(accuracy) AS avg_accuracy
            FROM race_history
            GROUP BY user_id
        ) agg ON agg.user_id = u.id
        SET u.total_races = agg.total_races,
            u.wins         = agg.wins,
            u.wpm          = ROUND(agg.avg_wpm, 1),
            u.accuracy     = ROUND(agg.avg_accuracy, 1)
        """
    )
    _clear_leaderboard_cache()


def _get_current_season_name() -> str:
    """Returns e.g. 'May 2026'. Matches _season_name() but used server-side."""
    now = datetime.utcnow()
    return f'{now.strftime("%B")} {now.year}'


def _ensure_season_reset(conn) -> None:
    """
    Called on leaderboard load and profile load.
    If the calendar month has rolled over since the last recorded season on any
    user, snapshot the final standings and zero out all season counters.
    This is idempotent â€” safe to call on every request.
    """
    current_season = _get_current_season_name()
    with conn.cursor() as cur:
        _ensure_season_tables(cur)
        # Check whether any user still has a stale season_name
        cur.execute(
            "SELECT COUNT(*) AS n FROM users WHERE season_name IS NOT NULL AND season_name != %s LIMIT 1",
            (current_season,),
        )
        row = cur.fetchone()
        needs_reset = bool(row and int(row.get('n') or 0) > 0)

        # Also handle first-ever run: users whose season_name is NULL
        if not needs_reset:
            cur.execute("SELECT COUNT(*) AS n FROM users WHERE season_name IS NULL LIMIT 1")
            row = cur.fetchone()
            needs_reset = bool(row and int(row.get('n') or 0) > 0)

        if not needs_reset:
            return

        # â”€â”€ Snapshot the ending season before reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        cur.execute(
            """
            SELECT id, username, season_name, season_points_stored, season_races, season_wins, season_earnings
            FROM users
            WHERE season_name IS NOT NULL AND season_name != %s AND season_points_stored > 0
            ORDER BY season_points_stored DESC, season_wins DESC
            """,
            (current_season,),
        )
        ending_players = cur.fetchall()
        now_dt = datetime.utcnow()
        # Load thresholds once for the whole snapshot pass instead of once
        # per player (was re-querying site_settings for every row).
        snapshot_thresholds = _load_site_settings().get('leaderboardTiers', _default_leaderboard_tiers())
        for rank_idx, player in enumerate(ending_players, start=1):
            old_season = player.get('season_name') or 'Unknown'
            tier = _tier_for_season_points(int(player.get('season_points_stored') or 0), snapshot_thresholds)
            cur.execute(
                """
                INSERT INTO season_snapshots
                (season_name, user_id, username, season_points, tier, rank_position, snapshotted_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    season_points  = VALUES(season_points),
                    tier           = VALUES(tier),
                    rank_position  = VALUES(rank_position),
                    snapshotted_at = VALUES(snapshotted_at)
                """,
                (
                    old_season,
                    int(player['id']),
                    str(player['username']),
                    int(player.get('season_points_stored') or 0),
                    tier,
                    rank_idx,
                    now_dt,
                ),
            )

        # â”€â”€ Reset all users to the new season â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        cur.execute(
            """
            UPDATE users
            SET season_name          = %s,
                season_points_stored = 0,
                season_races         = 0,
                season_wins          = 0,
                season_losses        = 0,
                season_earnings      = 0
            """,
            (current_season,),
        )
    conn.commit()
    # The season just rolled over — any cached leaderboard payload now
    # reflects the wrong season's points, so drop it immediately rather
    # than waiting for the TTL to expire.
    _clear_leaderboard_cache()


def _increment_season_stats(
    cur,
    *,
    user_id: int,
    earnings: float,
    did_win: bool,
    delta: int,
    race_category: str = 'versus',
) -> None:
    """
    Accumulate per-season counters and apply this race's already-computed
    season-points delta (see _season_points_delta_for_race — computed once
    by the caller so the number applied here always matches what got
    written to race_history.points_delta). race_category controls whether
    a non-win counts as a loss: practice races have no opponent, so they
    never register as a loss.
    """
    current_season = _get_current_season_name()
    is_competitive = race_category in ('tournament', 'versus')
    cur.execute(
        """
        UPDATE users
        SET season_name     = %s,
            season_races    = season_races + 1,
            season_wins     = season_wins + %s,
            season_losses   = season_losses + %s,
            season_earnings = season_earnings + %s
        WHERE id = %s
        """,
        (
            current_season,
            1 if did_win else 0,
            1 if (is_competitive and not did_win) else 0,
            max(0.0, earnings),
            user_id,
        ),
    )
    _apply_season_points_delta(cur, user_id=user_id, delta=delta)


def _clear_leaderboard_cache() -> None:
    with _leaderboard_cache_lock:
        _leaderboard_cache.update({'key': None, 'expires_at': 0, 'payload': None})


# NOTE: season points used to be fully recomputed from aggregate stats on
# demand (see the old _competitive_season_points/_refresh_season_points_for_user
# pair). That's gone now — season_points_stored is a running total built up
# race-by-race via _apply_season_points_delta, so there's nothing to "refresh"
# from scratch anymore. A store perk that boosts season points (e.g.
# perk_season_booster) is applied at the moment each future race's delta is
# computed, not retroactively to points already earned.


def _tier_for_season_points(season_points: int, thresholds: Dict[str, int] | None = None) -> str:
    """
    Determines tier from adjustable season-point thresholds.

    `thresholds` should be a dict like _default_leaderboard_tiers() returns.
    Pass it in explicitly when computing tiers for many users in a loop
    (e.g. building the leaderboard) so this doesn't hit the DB per user.

    Scores below the configured Bronze threshold are 'Unranked' rather than
    silently defaulting to Bronze — this makes the admin-configured Bronze
    value actually mean something instead of being unused.
    """
    if thresholds is None:
        thresholds = _load_site_settings().get('leaderboardTiers', _default_leaderboard_tiers())
    if season_points >= thresholds['grandmaster']:
        return 'Grandmaster'
    if season_points >= thresholds['diamond']:
        return 'Diamond'
    if season_points >= thresholds['gold']:
        return 'Gold'
    if season_points >= thresholds['silver']:
        return 'Silver'
    if season_points >= thresholds['bronze']:
        return 'Bronze'
    return 'Unranked'


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


def _fetch_admin_content(mode: str, language: str, content_type: str, exclude_content_ids: Any = None) -> Dict[str, Any] | None:
    excluded = _normalize_exclude_content_ids(exclude_content_ids)
    try:
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    '''
                    SELECT content_id, passage
                    FROM typing_content
                    WHERE content_type=%s AND mode=%s AND language=%s AND is_active=1
                    ORDER BY id ASC
                    ''',
                    (content_type, mode, language),
                )
                rows = cur.fetchall()
        finally:
            _return_connection(conn)
    except Exception as exc:  # noqa: BLE001
        app.logger.warning('Admin content lookup failed: %s', exc)
        return None

    if not rows:
        return None
    available = [row for row in rows if str(row.get('content_id') or '') not in excluded] or rows
    selected = available[secrets.randbelow(len(available))]
    return {
        'contentId': str(selected['content_id']),
        'id': str(selected['content_id']),
        'passage': str(selected['passage']),
        'totalContentCount': len(rows),
    }


def _generate_passage(mode: str, language: str, exclude_content_ids: Any = None) -> Dict[str, Any]:
    normalized_mode = str(mode or 'standard').strip().lower()
    normalized_language = str(language or 'english').strip().lower()
    if normalized_language == 'swahili':
        pool_key = 'swahili'
    elif normalized_language == 'french':
        pool_key = 'french'
    elif normalized_language == 'code':
        pool_key = 'code'
    elif normalized_mode in {'code', 'coding'}:
        pool_key = 'code'
    elif normalized_mode in {'quote', 'quote battle'}:
        pool_key = 'quote'
    elif normalized_mode in {'memory', 'exam'}:
        pool_key = 'memory'
    else:
        pool_key = normalized_mode if normalized_mode in AI_PASSAGE_BANK else 'standard'

    curated = _fetch_admin_content(normalized_mode, normalized_language, 'practice', exclude_content_ids)
    if curated:
        return {
            'mode': normalized_mode,
            'language': normalized_language,
            **curated,
            'title': f'{pool_key.title()} Admin Passage',
            'antiCheatHint': 'Admin-curated content is selected from the published content library.',
            'provider': 'admin-library',
            'model': 'database',
        }

    passages = AI_PASSAGE_BANK.get(pool_key) or AI_PASSAGE_BANK['standard']
    selected = _select_competitive_passage(
        passages,
        kind='practice',
        mode=normalized_mode,
        language=normalized_language,
        exclude_content_ids=exclude_content_ids,
        is_live=False,
    )
    return {
        'mode': normalized_mode,
        'language': normalized_language,
        'passage': selected['passage'],
        'contentId': selected['contentId'],
        'id': selected['id'],
        'totalContentCount': selected['totalContentCount'],
        'title': f'{pool_key.title()} Marathon Paragraph',
        'antiCheatHint': 'Freshly generated content reduces memorization and replay abuse.',
        'provider': 'local',
        'model': 'template-bank',
    }


def _generate_live_battle_passage(mode: str, language: str, is_private: bool = False, exclude_content_ids: Any = None) -> Dict[str, Any]:
    normalized_mode = str(mode or 'standard').strip().lower()
    normalized_language = str(language or 'english').strip().lower()

    if normalized_language == 'swahili':
        passages = AI_PASSAGE_BANK.get('swahili') or []
    elif normalized_language == 'french':
        passages = AI_PASSAGE_BANK.get('french') or []
    elif normalized_language == 'code' or normalized_mode in {'code', 'coding'}:
        passages = LIVE_BATTLE_PASSAGE_BANK.get('code') or []
    else:
        passages = LIVE_BATTLE_PASSAGE_BANK.get(normalized_mode) or LIVE_BATTLE_PASSAGE_BANK.get('standard') or []

    curated = _fetch_admin_content(normalized_mode, normalized_language, 'live', exclude_content_ids)
    if curated:
        passage = curated['passage']
        if is_private:
            room_code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
            passage = f'{passage} Private room note: keep code {room_code} and every symbol exactly as shown.'
        return {**curated, 'passage': passage}

    if not passages:
        fallback = _generate_passage(mode, language, exclude_content_ids=exclude_content_ids)
        passage_text = fallback.get('passage') or LIVE_RACE_TEXTS.get(normalized_mode, LIVE_RACE_TEXTS['standard'])
        return {
            'contentId': fallback.get('contentId') or _content_id_for_index('live-fallback', normalized_mode, normalized_language, 0),
            'id': fallback.get('contentId') or _content_id_for_index('live-fallback', normalized_mode, normalized_language, 0),
            'passage': passage_text,
            'totalContentCount': fallback.get('totalContentCount') or len(passages),
        }

    selected = _select_competitive_passage(
        passages,
        kind='live',
        mode=normalized_mode,
        language=normalized_language,
        exclude_content_ids=exclude_content_ids,
        is_live=True,
    )
    passage = selected['passage']
    if is_private:
        room_code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        passage = f'{passage} Private room note: keep code {room_code} and every symbol exactly as shown.'
    return {
        'contentId': selected['contentId'],
        'id': selected['id'],
        'passage': passage,
        'totalContentCount': selected['totalContentCount'],
    }


def _current_ai_settings() -> Dict[str, Any]:
    provider = str(AI_SETTINGS.get('provider') or 'auto').strip().lower()
    if provider not in {'auto', 'openai', 'local'}:
        provider = 'auto'
    model = str(AI_SETTINGS.get('model') or OPENAI_MODEL).strip() or OPENAI_MODEL
    return {'provider': provider, 'model': model}


def _default_site_marquee_settings() -> Dict[str, Any]:
    return {'items': list(DEFAULT_SITE_MARQUEE_ITEMS)}


def _normalize_site_marquee_items(items: Any) -> list[str]:
    if not isinstance(items, list):
        return list(DEFAULT_SITE_MARQUEE_ITEMS)

    normalized_items: list[str] = []
    for item in items:
        text = str(item or '').strip()
        if text:
            normalized_items.append(text[:160])

    return normalized_items or list(DEFAULT_SITE_MARQUEE_ITEMS)


def _default_leaderboard_tiers() -> Dict[str, int]:
    return {'bronze': 500, 'silver': 851, 'gold': 1500, 'diamond': 1760, 'grandmaster': 2001}


def _normalize_leaderboard_tiers(tiers: Any) -> Dict[str, int]:
    defaults = _default_leaderboard_tiers()
    if not isinstance(tiers, dict):
        return defaults
    try:
        values = {key: max(0, int(tiers.get(key, default))) for key, default in defaults.items()}
    except (TypeError, ValueError):
        return defaults
    if not (
        values['bronze'] < values['silver']
        and values['silver'] < values['gold']
        and values['gold'] < values['diamond']
        and values['diamond'] < values['grandmaster']
    ):
        return defaults
    return values


def _default_commentator_config() -> Dict[str, float]:
    return {'rate': 1.08, 'pitch': 0.92, 'gap': 220, 'volume': 1.0, 'cooldown': 3500}


def _normalize_commentator_config(config: Any) -> Dict[str, float]:
    defaults = _default_commentator_config()
    if not isinstance(config, dict):
        return defaults
    try:
        return {
            'rate': min(2.0, max(0.5, float(config.get('rate', defaults['rate'])))),
            'pitch': min(2.0, max(0.0, float(config.get('pitch', defaults['pitch'])))),
            'gap': min(2000, max(0, int(config.get('gap', defaults['gap'])))),
            'volume': min(1.0, max(0.0, float(config.get('volume', defaults['volume'])))),
            'cooldown': min(15000, max(0, int(config.get('cooldown', defaults['cooldown'])))),
        }
    except (TypeError, ValueError):
        return defaults


def _normalize_music_tracks(tracks: Any) -> list[Dict[str, str]]:
    if not isinstance(tracks, list):
        return []
    normalized = []
    for index, track in enumerate(tracks):
        if not isinstance(track, dict):
            continue
        url = str(track.get('url') or '').strip()
        if not url:
            continue
        normalized.append({
            'id': str(track.get('id') or f'track_{index + 1}').strip()[:80],
            'title': str(track.get('title') or 'Untitled Track').strip()[:150],
            'artist': str(track.get('artist') or 'TypeArena').strip()[:150],
            'url': url[:1000],
        })
    return normalized


def _default_commentator_phrases() -> Dict[str, list[list[str]]]:
    return {
        'raceStart': [
            ["And they're OFF!", 'Fingers to the keys!', 'Every millisecond counts!'],
            ['GO GO GO!', 'The race has BEGUN!', 'No room for error now!'],
            ['The clock starts NOW!', 'Push hard from the first keystroke!', 'The crowd is watching!'],
            ['AWAY they go!', 'Blazing speed right from the start!', 'This is what we came for!'],
        ],
        'finish': [
            ['What a finish!', 'That was a furious run!', 'The crowd is on its feet!'],
            ['Done and dusted!', 'A brilliant closing burst!', 'That was championship pace!'],
            ['Finish line crossed!', 'Precision all the way through!', 'That is how you close strong!'],
            ['Race complete!', 'A huge final push!', 'What a performance!'],
        ],
    }


def _normalize_commentator_phrases(phrases: Any) -> Dict[str, list[list[str]]]:
    defaults = _default_commentator_phrases()
    if not isinstance(phrases, dict):
        return defaults

    normalized: Dict[str, list[list[str]]] = {}
    for key, fallback in defaults.items():
        raw_lines = phrases.get(key)
        if not isinstance(raw_lines, list):
            normalized[key] = fallback
            continue

        normalized_lines: list[list[str]] = []
        for line in raw_lines:
            if isinstance(line, list):
                parts = [str(part or '').strip() for part in line]
            else:
                parts = [part.strip() for part in str(line or '').split('|')]
            phrases_line = [part for part in parts if part]
            if phrases_line:
                normalized_lines.append(phrases_line[:4])

        normalized[key] = normalized_lines or fallback

    return normalized


def _site_settings_defaults() -> Dict[str, Any]:
    return {
        'items': list(DEFAULT_SITE_MARQUEE_ITEMS),
        'musicTracks': [],
        'commentatorEnabled': True,
        'commentatorConfig': _default_commentator_config(),
        'leaderboardTiers': _default_leaderboard_tiers(),
        'commentatorPhrases': _default_commentator_phrases(),
    }


def _normalize_site_settings(raw: Any) -> Dict[str, Any]:
    defaults = _site_settings_defaults()
    if not isinstance(raw, dict):
        return defaults

    items = raw.get('items')
    if items is None:
        items = raw.get('siteMarqueeItems')

    return {
        'items': _normalize_site_marquee_items(items),
        'musicTracks': _normalize_music_tracks(raw.get('musicTracks')),
        'commentatorEnabled': raw.get('commentatorEnabled') is not False,
        'commentatorConfig': _normalize_commentator_config(raw.get('commentatorConfig')),
        'leaderboardTiers': _normalize_leaderboard_tiers(raw.get('leaderboardTiers')),
        'commentatorPhrases': _normalize_commentator_phrases(raw.get('commentatorPhrases')),
    }


def _ensure_site_settings_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS site_settings (
            setting_key VARCHAR(80) PRIMARY KEY,
            setting_value LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )


def _persist_site_settings(settings: Dict[str, Any], *, persist_file: bool = True) -> None:
    normalized = _normalize_site_settings(settings)
    payload = json.dumps(normalized, indent=2)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_site_settings_table(cur)
            cur.execute(
                """
                INSERT INTO site_settings (setting_key, setting_value)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE
                    setting_value = VALUES(setting_value),
                    updated_at = CURRENT_TIMESTAMP
                """,
                (SITE_SETTINGS_STORAGE_KEY, payload),
            )
        conn.commit()
    finally:
        _return_connection(conn)

    if persist_file:
        try:
            SITE_SETTINGS_FILE.write_text(payload, encoding='utf-8')
        except OSError:
            pass


def _load_site_settings() -> Dict[str, Any]:
    defaults = _site_settings_defaults()
    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            _ensure_site_settings_table(cur)
            cur.execute(
                'SELECT setting_value FROM site_settings WHERE setting_key = %s LIMIT 1',
                (SITE_SETTINGS_STORAGE_KEY,),
            )
            row = cur.fetchone() or {}
        raw_value = row.get('setting_value')
        if raw_value:
            try:
                return _normalize_site_settings(json.loads(raw_value))
            except (TypeError, ValueError, json.JSONDecodeError):
                pass
    except Exception:
        conn = None
    finally:
        if conn is not None:
            _return_connection(conn)

    if SITE_SETTINGS_FILE.exists():
        try:
            raw = json.loads(SITE_SETTINGS_FILE.read_text(encoding='utf-8'))
            settings = _normalize_site_settings(raw)
            try:
                _persist_site_settings(settings, persist_file=True)
            except Exception:
                pass
            return settings
        except (OSError, json.JSONDecodeError):
            pass

    return defaults


def _save_site_marquee_settings(items: list[str]) -> Dict[str, Any]:
    current = _load_site_settings()
    settings = {**current, 'items': _normalize_site_marquee_items(items)}
    _persist_site_settings(settings)
    return {'items': list(settings['items'])}


def _save_media_settings(tracks: Any, commentator_enabled: Any, commentator_config: Any = None, commentator_phrases: Any = None) -> Dict[str, Any]:
    current = _load_site_settings()
    settings = {
        **current,
        'musicTracks': _normalize_music_tracks(tracks),
        'commentatorEnabled': commentator_enabled is not False,
        'commentatorConfig': _normalize_commentator_config(commentator_config),
        'commentatorPhrases': _normalize_commentator_phrases(commentator_phrases or current.get('commentatorPhrases')),
    }
    _persist_site_settings(settings)
    return {
        'musicTracks': settings['musicTracks'],
        'commentatorEnabled': settings['commentatorEnabled'],
        'commentatorConfig': settings['commentatorConfig'],
        'commentatorPhrases': settings['commentatorPhrases'],
    }


def _save_leaderboard_settings(tiers: Any) -> Dict[str, int]:
    current = _load_site_settings()
    settings = {**current, 'leaderboardTiers': _normalize_leaderboard_tiers(tiers)}
    _persist_site_settings(settings)
    _clear_leaderboard_cache()
    return settings['leaderboardTiers']


def _openai_generate_passage(mode: str, language: str) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise ValueError('OPENAI_API_KEY is not configured.')

    settings = _current_ai_settings()
    model_name = settings['model']
    normalized_mode = str(mode or 'business').strip().lower()
    normalized_language = str(language or 'english').strip().lower()

    # Use /chat/completions â€” the standard OpenAI endpoint.
    # The previous /responses endpoint does not exist and caused every AI call
    # to silently time out after 20 s before falling back to local passages.
    response = _http_json(
        'POST',
        f'{OPENAI_BASE_URL}/chat/completions',
        payload={
            'model': model_name,
            'max_tokens': 400,
            'response_format': {'type': 'json_object'},
            'messages': [
                {
                    'role': 'system',
                    'content': (
                        'You create fresh anti-cheat typing passages for competitive live races. '
                        'Always respond with valid JSON only â€” no markdown, no extra text. '
                        'JSON must have exactly these keys: title, passage, antiCheatHint.'
                    ),
                },
                {
                    'role': 'user',
                    'content': (
                        'Generate one fresh typing race passage. '
                        f'Mode: {normalized_mode}. Language: {normalized_language}. '
                        'Passage must be a single paragraph between 180 and 260 words, natural, competitive, hard to memorize, and worthy of serious practice. '
                        'It must include several clusters of numbers and symbols such as %, #, /, :, ;, brackets, quotes, dashes, underscores, and angle marks. '
                        'The paragraph should feel like a long competitive drill rather than a short sample. '
                        'Include a short anti-cheat hint. '
                        'Respond with JSON only: {"title": "...", "passage": "...", "antiCheatHint": "..."}'
                    ),
                },
            ],
        },
        headers={'Authorization': f'Bearer {OPENAI_API_KEY}'},
    )

    # Parse standard chat/completions response shape: choices[0].message.content
    try:
        output_text = str(response['choices'][0]['message']['content']).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f'Unexpected OpenAI response shape: {response}') from exc

    if not output_text:
        raise ValueError('OpenAI returned empty content.')

    try:
        parsed = json.loads(output_text)
    except json.JSONDecodeError as exc:
        raise ValueError('OpenAI response was not valid JSON.') from exc

    passage = str(parsed.get('passage') or '').strip()
    if not passage:
        raise ValueError('OpenAI response did not include a passage.')
    content_id = hashlib.sha1(f'openai:{normalized_mode}:{normalized_language}:{passage}'.encode('utf-8')).hexdigest()[:12]

    return {
        'mode': normalized_mode,
        'language': normalized_language,
        'title': str(parsed.get('title') or f'{normalized_mode.title()} Sprint').strip(),
        'passage': passage,
        'contentId': content_id,
        'id': content_id,
        'totalContentCount': 0,
        'antiCheatHint': str(parsed.get('antiCheatHint') or 'Fresh AI-generated text reduces repetition and memorization.').strip(),
        'provider': 'openai',
        'model': model_name,
    }


def _serialize_live_room(room: Dict[str, Any], viewer_user_id: Optional[int] = None) -> Dict[str, Any]:
    players = []
    winner_user_id = room.get('winnerUserId')
    winner_username = ''
    for player in room.get('players', []):
        result = room.get('results', {}).get(player['userId'], {})
        if winner_user_id is not None and str(player['userId']) == str(winner_user_id):
            winner_username = str(player.get('username') or '')
        players.append(
            {
                'userId': player['userId'],
                'username': player['username'],
                'progress': int(player.get('progress') or 0),
                'currentWpm': float(player.get('currentWpm') or 0),
                'currentAccuracy': float(player.get('currentAccuracy') or 100),
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
        'countdown': room.get('countdown', LIVE_RACE_COUNTDOWN_SECONDS),
        'text': room['text'],
        'contentId': room.get('contentId'),
        'totalContentCount': int(room.get('totalContentCount') or 0),
        'players': players,
        'winnerUserId': winner_user_id,
        'winnerUsername': winner_username or str(room.get('winner', {}).get('username') or ''),
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
        'serverNow': _now_iso(),
        'completedAt': room.get('completedAt'),
    }


def _is_password_hashed(password_value: str) -> bool:
    value = str(password_value or '')
    return value.startswith('pbkdf2:') or value.startswith('scrypt:')


class _ConnectionPool:
    """Bounded pool of reusable MySQL connections.

    A bounded pool is important on hosted MySQL plans where opening a new
    connection for every concurrent request can exhaust max_user_connections.
    """
    def __init__(self, size: int = 2, wait_seconds: float = 3.0):
        self._size = max(1, int(size))
        self._wait_seconds = max(0.1, float(wait_seconds))
        self._pool: list = []
        self._active = 0
        self._condition = _threading.Condition()

    def _make_conn(self):
        if not DB_HOST or not DB_USER or not DB_NAME:
            raise RuntimeError(
                'Alwaysdata database environment variables are missing. '
                'Set ALWAYSDATA_DB_HOST, ALWAYSDATA_DB_USER, ALWAYSDATA_DB_PASSWORD, and ALWAYSDATA_DB_NAME.'
            )
        return pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
            connect_timeout=DB_CONNECT_TIMEOUT,
            read_timeout=DB_READ_TIMEOUT,
            write_timeout=DB_WRITE_TIMEOUT,
        )

    def get(self):
        deadline = time.monotonic() + self._wait_seconds
        while True:
            with self._condition:
                if self._pool:
                    conn = self._pool.pop()
                    self._active += 1
                elif self._active < self._size:
                    conn = None
                    self._active += 1
                else:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise RuntimeError('Database connection pool is busy')
                    self._condition.wait(timeout=remaining)
                    continue

            if conn is not None:
                try:
                    conn.ping(reconnect=False)
                    return conn
                except Exception:
                    try:
                        conn.close()
                    except Exception:
                        pass
                    with self._condition:
                        self._active -= 1
                        self._condition.notify()
                    continue

            try:
                return self._make_conn()
            except Exception:
                with self._condition:
                    self._active -= 1
                    self._condition.notify()
                raise

    def put(self, conn):
        healthy = True
        try:
            conn.rollback()
        except Exception:
            healthy = False

        with self._condition:
            self._active = max(0, self._active - 1)
            if healthy and len(self._pool) < self._size:
                self._pool.append(conn)
            else:
                try:
                    conn.close()
                except Exception:
                    pass
            self._condition.notify()


try:
    _db_pool_size = max(1, min(4, int(os.getenv('TYPEARENA_DB_POOL_SIZE', '4'))))
except (TypeError, ValueError):
    _db_pool_size = 4
_db_pool = _ConnectionPool(size=_db_pool_size)


def get_connection() -> pymysql.connections.Connection:
    return _db_pool.get()


def _return_connection(conn) -> None:
    """Return a connection to the pool instead of closing it."""
    _db_pool.put(conn)


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + 'Z'


def _now_db() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    raw = str(value or '').strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace('Z', '+00:00'))
    except ValueError:
        return None


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


def _mpesa_stk_push(
    phone_number: str,
    amount: float,
    account_reference: str,
    description: str,
    callback_url: str | None = None,
) -> Dict[str, Any]:
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
        'CallBackURL': str(callback_url or MPESA_CALLBACK_URL).strip() or MPESA_CALLBACK_URL,
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


def _withdrawal_fee_for_method(amount: float, payout_method: str) -> float:
    normalized_method = str(payout_method or '').strip().lower()
    if normalized_method != 'mpesa':
        return float(WITHDRAWAL_FEE)

    mpesa_fee_bands = [
        (1, 300, 0.0),
        (301, 1000, 30.0),
        (1001, 1500, 50.0),
        (1501, 2500, 100.0),
        (2501, 3500, 150.0),
        (3501, 5000, 200.0),
        (5001, 7500, 250.0),
        (7501, 10000, 300.0),
        (10001, 15000, 350.0),
        (15001, 20000, 400.0),
        (20001, 35000, 450.0),
        (35001, 50000, 500.0),
        (50001, 250000, 550.0),
    ]

    rounded_amount = int(round(amount))
    for lower, upper, fee in mpesa_fee_bands:
        if lower <= rounded_amount <= upper:
            return fee

    return 309.0


def _wallet_capabilities() -> Dict[str, Any]:
    stripe_ready = bool(STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET and STRIPE_SUCCESS_URL and STRIPE_CANCEL_URL)
    simulated_payments_enabled = bool(MPESA_SIMULATE)
    mpesa_topup_ready = bool(
        simulated_payments_enabled
        or (
            MPESA_CONSUMER_KEY
            and MPESA_CONSUMER_SECRET
            and MPESA_PASSKEY
            and MPESA_CALLBACK_URL
        )
    )
    mpesa_withdraw_ready = bool(
        simulated_payments_enabled
        or (
            mpesa_topup_ready
            and MPESA_B2C_INITIATOR_NAME
            and MPESA_B2C_SECURITY_CREDENTIAL
            and MPESA_B2C_RESULT_URL
            and MPESA_B2C_TIMEOUT_URL
        )
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
        'simulatedPaymentsEnabled': simulated_payments_enabled,
    }


def _safe_user_with_owned_items(
    user: Dict[str, Any],
    owned_items: list[str] | set[str] | tuple[str, ...],
    tier_thresholds: Dict[str, int] | None = None,
) -> Dict[str, Any]:
    total_races = _safe_int(user.get('total_races') or 0)
    wins = _safe_int(user.get('wins') or 0)
    owned_list = list(owned_items or [])
    perks = _store_perks_from_owned_items(owned_list)
    is_admin = _is_admin_email(user.get('email') or '')
    return {
        'id': user['id'],
        'username': user['username'],
        'email': user['email'],
        'isAdmin': is_admin,
        'phoneNumber': user.get('phone_number') or '',
        'wpm': _safe_float(user.get('wpm') or 0),
        'accuracy': _safe_float(user.get('accuracy') or 0),
        'totalRaces': total_races,
        'gamesPlayed': total_races,
        'wins': wins,
        'balance': _safe_float(user.get('balance') or 0),
        'tier': _tier_for_user(user, tier_thresholds),
        'season': _season_name(),
        'seasonPoints': _safe_int(user.get('season_points_stored') or 0),
        'premium': wins >= 10 or _safe_float(user.get('balance') or 0) >= 5000,
        'aiCoachTip': _coach_tip_for_user(user),
        'ownedStoreItems': owned_list,
        'storePerks': perks,
        'equippedItems': {
            'avatar': user.get('equipped_avatar') or '',
            'theme': user.get('equipped_theme') or '',
            'skin': user.get('equipped_skin') or '',
            'badge': user.get('equipped_badge') or '',
            'effect': user.get('equipped_effect') or '',
            'frame': user.get('equipped_frame') or '',
            'cursor': user.get('equipped_cursor') or '',
        },
    }


def _safe_user(user: Dict[str, Any], conn=None) -> Dict[str, Any]:
    owned_items = _owned_store_items_for_user(conn, _safe_int(user.get('id') or 0)) if conn else []
    return _safe_user_with_owned_items(user, owned_items)


def _serialize_tournament(row: Dict[str, Any], user_owned_items: list[str] | set[str] | tuple[str, ...] | None = None) -> Dict[str, Any]:
    entry_fee = float(row.get('entry_fee') or 0)
    prize_pool = float(row.get('prize_pool') or 0)
    match_size = int(row.get('match_size') or row.get('max_participants') or TOURNAMENT_MATCH_SIZE)
    total_player_stake = round(entry_fee * match_size, 2)
    winner_share = WINNER_PRIZE_SHARE
    status = _computed_tournament_status(row)
    start_time = row.get('start_time')
    end_time = start_time + timedelta(minutes=int(row.get('match_duration_mins') or 10)) if start_time else None
    perks = _store_perks_from_owned_items(user_owned_items or [])
    cashback_rate = float(perks.get('tournamentCashbackRate') or 0)
    savings = round(entry_fee * cashback_rate, 2)
    effective_cost = round(max(0.0, entry_fee - savings), 2)
    return {
        'id': int(row['id']),
        'name': row['name'],
        'description': row.get('description') or '',
        'entryFee': entry_fee,
        'cost': effective_cost,
        'baseCost': entry_fee,
        'savings': savings,
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
        'cashbackRate': cashback_rate,
        'matchDurationMins': int(row.get('match_duration_mins') or 10),
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


def _refund_failed_withdrawal(cur, payout_row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    user_id = int(payout_row.get('user_id') or 0)
    if user_id <= 0:
        return None

    amount_value = float(payout_row.get('amount') or 0)
    fee_amount = float(payout_row.get('fee_amount') or 0)
    total_refund = amount_value + fee_amount
    if total_refund > 0:
        cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (total_refund, user_id))

    admin_user = _get_admin_user(cur)
    if admin_user and fee_amount > 0:
        admin_balance = float(admin_user.get('balance') or 0)
        debit_amount = min(admin_balance, fee_amount)
        if debit_amount > 0:
            cur.execute('UPDATE users SET balance = balance - %s WHERE id = %s', (debit_amount, admin_user['id']))
            _record_admin_wallet_transaction(
                cur,
                admin_user_id=int(admin_user['id']),
                transaction_type='withdrawal_fee_reversal',
                amount=float(debit_amount),
                direction='out',
                source='wallet_fee_refund',
                note=f'Fee refund for failed withdrawal {payout_row.get("payout_code")}',
            )

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

    admin_user = _get_admin_user(cur)
    if not admin_user:
        return 0.0

    cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (admin_share, admin_user['id']))
    _record_admin_wallet_transaction(
        cur,
        admin_user_id=int(admin_user['id']),
        transaction_type='tournament_profit',
        amount=admin_share,
        direction='in',
        source='tournament',
        note=f'Admin profit from tournament {str(tournament.get("name") or tournament.get("id") or "").strip()}',
    )
    return admin_share


def _record_admin_wallet_transaction(
    cur,
    *,
    admin_user_id: int,
    transaction_type: str,
    amount: float,
    direction: str,
    source: str,
    note: str = '',
    related_purchase_id: int | None = None,
) -> Dict[str, Any]:
    _ensure_admin_wallet_transactions_table(cur)
    tx_code = f'adminwallet_{transaction_type}_{int(datetime.utcnow().timestamp() * 1000)}_{secrets.token_hex(3)}'
    cur.execute(
        '''
        INSERT INTO admin_wallet_transactions
        (admin_user_id, transaction_code, transaction_type, amount, direction, source, note, related_purchase_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ''',
        (admin_user_id, tx_code, transaction_type, amount, direction, source, note[:255] if note else None, related_purchase_id),
    )
    cur.execute('SELECT * FROM users WHERE id = %s', (admin_user_id,))
    updated_admin = cur.fetchone()
    return {
        'code': tx_code,
        'adminUserId': admin_user_id,
        'transactionType': transaction_type,
        'amount': amount,
        'direction': direction,
        'source': source,
        'note': note,
        'adminUser': updated_admin,
    }


def _get_admin_wallet_history(cur, admin_user_id: int) -> Dict[str, Any]:
    _ensure_admin_wallet_transactions_table(cur)
    cur.execute(
        '''
        SELECT transaction_code, transaction_type, amount, direction, source, note, created_at
        FROM admin_wallet_transactions
        WHERE admin_user_id = %s
        ORDER BY created_at DESC
        LIMIT 30
        ''',
        (admin_user_id,),
    )
    rows = cur.fetchall()
    return {
        'items': [
            {
                'code': str(row.get('transaction_code') or ''),
                'type': str(row.get('transaction_type') or ''),
                'amount': float(row.get('amount') or 0),
                'direction': str(row.get('direction') or ''),
                'source': str(row.get('source') or ''),
                'note': str(row.get('note') or ''),
                'createdAt': row['created_at'].isoformat() + 'Z' if row.get('created_at') else None,
            }
            for row in rows
        ]
    }


def _record_marketplace_revenue(
    cur,
    *,
    buyer_user_id: int,
    purchase_id: int | None,
    item: Dict[str, Any],
    amount: float,
) -> Dict[str, Any]:
    _ensure_marketplace_revenue_table(cur)
    admin_user_id = None
    destination = 'platform_hold'

    if ADMIN_EMAIL:
        admin_user = _get_admin_user(cur)
        if admin_user:
            admin_user_id = int(admin_user['id'])
            cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (amount, admin_user_id))
            _record_admin_wallet_transaction(
                cur,
                admin_user_id=admin_user_id,
                transaction_type='marketplace_sale',
                amount=amount,
                direction='in',
                source='marketplace',
                note=f'Automatic marketplace revenue from {str(item.get("name") or "").strip()}',
                related_purchase_id=purchase_id,
            )
            destination = 'admin_wallet'

    cur.execute(
        '''
        INSERT INTO marketplace_revenue
        (purchase_id, buyer_user_id, admin_user_id, item_id, item_name, amount, revenue_destination)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ''',
        (
            purchase_id,
            buyer_user_id,
            admin_user_id,
            str(item.get('id') or ''),
            str(item.get('name') or ''),
            amount,
            destination,
        ),
    )
    return {
        'adminUserId': admin_user_id,
        'destination': destination,
        'amount': amount,
    }


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
    race_category: str = 'versus',
    placement: int = 1,
    total_players: int = 2,
) -> Dict[str, Any]:
    now_dt = datetime.utcnow()

    # Compute the season-points delta once, up front, so the exact same
    # number gets written to race_history.points_delta (the audit trail)
    # and applied to the user's running season total — no risk of the two
    # drifting apart.
    connection = getattr(cur, 'connection', None)
    owned_items = _owned_store_items_for_user(connection, user_id) if connection is not None else []
    points_delta = _season_points_delta_for_race(
        race_category=race_category,
        did_win=did_win,
        wpm=wpm,
        accuracy=accuracy,
        placement=placement,
        total_players=total_players,
        owned_items=owned_items,
    )

    cur.execute(
        '''
        INSERT INTO race_history
        (race_code, user_id, username, wpm, accuracy, duration, place_position, earnings, race_timestamp, race_category, points_delta)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            wpm = VALUES(wpm),
            accuracy = VALUES(accuracy),
            duration = VALUES(duration),
            place_position = VALUES(place_position),
            earnings = VALUES(earnings),
            race_timestamp = VALUES(race_timestamp),
            race_category = VALUES(race_category),
            points_delta = VALUES(points_delta)
        ''',
        (
            race_code, user_id, username, round(wpm, 1), round(accuracy, 1), duration,
            1 if did_win else 2, earnings, now_dt, race_category, points_delta,
        ),
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
    updated_user = cur.fetchone()
    # Accumulate per-season counters and apply this race's point delta so
    # season_points_stored stays current.
    _increment_season_stats(
        cur,
        user_id=user_id,
        earnings=earnings,
        did_win=did_win,
        delta=points_delta,
        race_category=race_category,
    )
    return updated_user


def _persist_completed_live_race(room: Dict[str, Any], conn=None) -> None:
    if room.get('resultsPersisted'):
        return

    player_ids = [player['userId'] for player in room.get('players', [])]
    results = room.get('results', {})

    is_completed = str(room.get('status') or '').lower() == 'completed'
    if not is_completed:
        if not player_ids or any(player_id not in results for player_id in player_ids):
            return

    winner_user_id = room.get('winnerUserId')
    winner_prize = float(room.get('winnerPrize') or 0)
    # Tournament bracket matches score at the top 'tournament' tier; both
    # 1v1 matchmaking and private-room battles score as 'versus' — same
    # tier for either, since a private room is just an invite-only 1v1/small
    # group match rather than a lower-stakes mode.
    race_category = 'tournament' if room.get('tournamentId') else 'versus'

    # Matchmaking and private rooms are always exactly 2 players, but a
    # tournament room can hold more (admin-configurable maxParticipants).
    # Rank everyone by the same (wpm, accuracy) metric used to pick the
    # winner so a close runner-up in a big room can be scored differently
    # from someone who finished last — see _season_points_delta_for_race.
    total_players = max(1, len(player_ids))

    def _placement_sort_key(pid: int):
        result = results.get(pid, {})
        return (-float(result.get('wpm') or 0), -float(result.get('accuracy') or 0))

    ranked_player_ids = sorted(player_ids, key=_placement_sort_key)
    placements = {pid: idx + 1 for idx, pid in enumerate(ranked_player_ids)}

    # Use the caller's connection if provided â€” avoids an extra TCP round-trip
    _owns_conn = conn is None
    if _owns_conn:
        conn = get_connection()
    try:
        with conn.cursor() as cur:
            for player in room.get('players', []):
                user_id = int(player['userId'])
                result = results.get(user_id, {})
                did_win = user_id == winner_user_id
                _apply_user_performance_update(
                    cur,
                    user_id=user_id,
                    username=str(player.get('username') or result.get('username') or 'Player'),
                    race_code=f'live_{room["id"]}_{user_id}',
                    wpm=float(result.get('wpm') or 0),
                    accuracy=float(result.get('accuracy') or 0),
                    duration=room.get('duration'),
                    earnings=winner_prize if did_win else 0,
                    did_win=did_win,
                    race_category=race_category,
                    placement=placements.get(user_id, total_players),
                    total_players=total_players,
                )
        if _owns_conn:
            conn.commit()
        room['resultsPersisted'] = True
    finally:
        if _owns_conn:
            _return_connection(conn)

def _complete_live_race_if_ready(room: Dict[str, Any], conn=None) -> None:
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
        _persist_completed_live_race(room, conn=conn)
        return

    # Use the caller's connection if provided â€” avoids an extra TCP round-trip
    _owns_conn = conn is None
    if _owns_conn:
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
        if _owns_conn:
            conn.commit()
        room['winner'] = _safe_user(updated_winner)
        room['winnerPrize'] = winner_prize
    finally:
        if _owns_conn:
            _return_connection(conn)
            conn = None  # don't pass a closed/returned conn to persist

    _persist_completed_live_race(room, conn=conn)
def _finalize_live_room_if_expired(room: Dict[str, Any]) -> bool:
    if not room or str(room.get('status') or '').lower() == 'completed':
        return False

    if len(room.get('players', [])) < 2:
        return False

    started_at = _parse_iso_datetime(room.get('startedAt'))
    if started_at is None:
        return False

    elapsed_seconds = (datetime.utcnow().timestamp() - started_at.timestamp())
    duration_seconds = max(1, int(room.get('duration') or 0))
    countdown_seconds = max(0, int(room.get('countdown') or LIVE_RACE_COUNTDOWN_SECONDS))
    
    if elapsed_seconds < duration_seconds + countdown_seconds:
        return False

    # Force change memory status instantly to break stale heartbeat connections
    room['status'] = 'completed'
    finished_at = _now_iso()
    room['completedAt'] = finished_at
    room.setdefault('results', {})

    # Gather whatever the players typed up to this absolute moment
    for player in room.get('players', []):
        user_id = int(player.get('userId') or 0)
        if user_id in room['results']:
            continue
        room['results'][user_id] = {
            'userId': user_id,
            'username': player.get('username') or 'Player',
            'wpm': round(float(player.get('currentWpm') or 0), 1),
            'accuracy': round(float(player.get('currentAccuracy') or 100), 1),
            'finishedAt': finished_at,
            'finishedAtTs': datetime.utcnow().timestamp(),
        }

    # Setup standard metric winner references (Metrics onlyâ€”No money involved)
    try:
        player_ids = [p['userId'] for p in room.get('players', [])]
        def result_sort_key(p_id: int):
            res = room['results'].get(p_id, {})
            return (float(res.get('wpm') or 0), float(res.get('accuracy') or 0))
        
        if player_ids:
            room['winnerUserId'] = max(player_ids, key=result_sort_key)
            room['winnerPrize'] = 0
    except Exception as e:
        print(f"Error resolving metrics winner: {e}")

    # Log stats directly to your historical logs safely
    try:
        _persist_completed_live_race(room)
    except Exception as db_err:
        print(f"Error persisting data logs: {db_err}")

    return True


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


def _ensure_live_race_rooms_table(cur) -> None:
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS live_race_rooms (
            room_id VARCHAR(64) PRIMARY KEY,
            invite_code VARCHAR(32) NOT NULL,
            status VARCHAR(32) NOT NULL,
            is_private TINYINT(1) NOT NULL DEFAULT 0,
            room_data LONGTEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_live_race_invite (invite_code),
            KEY idx_live_race_status (status),
            KEY idx_live_race_private (is_private)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )


def _hydrate_live_room(room: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not room:
        return None

    room_id = str(room.get('id') or '').strip()
    if room_id:
        LIVE_RACE_ROOMS[room_id] = room
    return room


def _load_live_room_from_row(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None

    raw_room = row.get('room_data')
    if isinstance(raw_room, (bytes, bytearray)):
        raw_room = raw_room.decode('utf-8', errors='ignore')

    try:
        room = json.loads(str(raw_room or '{}'))
    except json.JSONDecodeError:
        return None

    if not isinstance(room, dict):
        return None

    raw_results = room.get('results')
    if isinstance(raw_results, dict):
        normalized_results = {}
        for user_id, result in raw_results.items():
            try:
                normalized_results[int(user_id)] = result
            except (TypeError, ValueError):
                continue
        room['results'] = normalized_results

    room['inviteCode'] = str(room.get('inviteCode') or row.get('invite_code') or '').upper()
    room['status'] = str(room.get('status') or row.get('status') or 'waiting')
    room['isPrivate'] = bool(room.get('isPrivate') if 'isPrivate' in room else row.get('is_private'))
    return _hydrate_live_room(room)


def _content_in_active_room(content_id: str, cur) -> bool:
    cur.execute("SELECT room_data FROM live_race_rooms WHERE status <> 'completed'")
    for row in cur.fetchall():
        try:
            room = json.loads(str(row.get('room_data') or '{}'))
        except (TypeError, json.JSONDecodeError):
            continue
        if str(room.get('contentId') or '') == content_id:
            return True
    return False


def _save_live_room(cur, room: Dict[str, Any]) -> Dict[str, Any]:
    room_id = str(room.get('id') or '').strip()
    if not room_id:
        raise ValueError('Live room is missing an id.')

    room_copy = dict(room)
    room_copy['inviteCode'] = str(room_copy.get('inviteCode') or '').strip().upper()
    payload = json.dumps(room_copy, ensure_ascii=True, separators=(',', ':'))
    cur.execute(
        '''
        INSERT INTO live_race_rooms (room_id, invite_code, status, is_private, room_data)
        VALUES (%s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            invite_code = VALUES(invite_code),
            status = VALUES(status),
            is_private = VALUES(is_private),
            room_data = VALUES(room_data),
            updated_at = CURRENT_TIMESTAMP
        ''',
        (
            room_id,
            room_copy['inviteCode'],
            str(room_copy.get('status') or 'waiting'),
            1 if room_copy.get('isPrivate') else 0,
            payload,
        ),
    )
    return _hydrate_live_room(room_copy) or room_copy


def _get_live_room(cur, room_id: str, for_update: bool = False) -> Optional[Dict[str, Any]]:
    normalized = str(room_id or '').strip()
    if not normalized:
        return None

    query = 'SELECT * FROM live_race_rooms WHERE room_id=%s LIMIT 1'
    cur.execute(query + (' FOR UPDATE' if for_update else ''), (normalized,))
    room = _load_live_room_from_row(cur.fetchone())
    if room:
        return room

    cached = LIVE_RACE_ROOMS.get(normalized)
    if cached:
        return cached
    return None


def _get_live_room_by_invite(cur, invite_code: str, for_update: bool = False) -> Optional[Dict[str, Any]]:
    normalized = str(invite_code or '').strip().upper()
    if not normalized:
        return None

    query = 'SELECT * FROM live_race_rooms WHERE invite_code=%s LIMIT 1'
    cur.execute(query + (' FOR UPDATE' if for_update else ''), (normalized,))
    room = _load_live_room_from_row(cur.fetchone())
    if room:
        return room

    cached = _find_live_room_by_invite(normalized)
    if cached:
        return cached
    return None


def _list_live_rooms(cur) -> list[Dict[str, Any]]:
    cur.execute(
        '''
        SELECT *
        FROM live_race_rooms
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 100
        '''
    )
    rooms = []
    for row in cur.fetchall():
        room = _load_live_room_from_row(row)
        if room:
            rooms.append(room)
    return rooms


def _delete_live_room(cur, room_id: str) -> None:
    normalized = str(room_id or '').strip()
    if not normalized:
        return
    cur.execute('DELETE FROM live_race_rooms WHERE room_id=%s', (normalized,))
    LIVE_RACE_ROOMS.pop(normalized, None)


def _ensure_auth_token_column(cur) -> None:
    cur.execute("SHOW COLUMNS FROM users LIKE 'auth_token'")
    if not cur.fetchone():
        cur.execute(
            'ALTER TABLE users ADD COLUMN auth_token VARCHAR(64) NULL UNIQUE AFTER password'
        )


def _issue_user_token(cur, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    cur.execute('UPDATE users SET auth_token=%s WHERE id=%s', (token, user_id))
    return token


def _get_user_from_header(conn) -> Optional[Dict[str, Any]]:
    # Browser requests must authenticate with a server-issued bearer token.
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return None

    token = auth[7:].strip()
    if not token:
        return None

    with conn.cursor() as cur:
        cur.execute(
            'SELECT * FROM users WHERE auth_token = %s',
            (token,),
        )
        return cur.fetchone()

def _is_admin_request() -> bool:
    token = request.headers.get('X-Admin-Token', '').strip()
    if not token or not _admin_token_secret():
        return False
    try:
        encoded, signature = token.split('.', 1)
        expected = hmac.new(_admin_token_secret(), encoded.encode('ascii'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return False
        padding = '=' * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode((encoded + padding).encode('ascii')))
        return int(payload.get('exp', 0)) > int(time.time())
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeError):
        return False

def _get_admin_user(cur) -> Optional[Dict[str, Any]]:
    if not ADMIN_EMAIL:
        return None
    cur.execute('SELECT * FROM users WHERE LOWER(email)=LOWER(%s)', (ADMIN_EMAIL,))
    admin_user = cur.fetchone()
    if admin_user:
        stored_password = str(admin_user.get('password') or '')
        if ADMIN_PASSWORD and (not stored_password or not _is_password_hashed(stored_password)):
            cur.execute(
                'UPDATE users SET password=%s WHERE id=%s',
                (generate_password_hash(ADMIN_PASSWORD), admin_user['id']),
            )
            cur.execute('SELECT * FROM users WHERE id = %s', (admin_user['id'],))
            admin_user = cur.fetchone()
        return admin_user

    if not ADMIN_PASSWORD:
        return None

    admin_username = ADMIN_EMAIL.split('@')[0].strip() or 'admin'
    cur.execute(
        '''
        INSERT INTO users
        (username, email, password, phone_number, wpm, accuracy, total_races, wins, balance)
        VALUES (%s, %s, %s, %s, 0, 0, 0, 0, 0)
        ''',
        (admin_username, ADMIN_EMAIL.lower(), generate_password_hash(ADMIN_PASSWORD), ''),
    )
    admin_user_id = cur.lastrowid
    cur.execute('SELECT * FROM users WHERE id = %s', (admin_user_id,))
    return cur.fetchone()


@app.get('/api/health')
def health():
    return jsonify(
        {
            'ok': True,
            'service': 'typearena-backend',
            'storage': 'mysql',
            'buildAvailable': BUILD_DIR.exists(),
            'databaseConfigured': bool(DB_HOST and DB_USER and DB_NAME),
        }
    )


@app.post('/api/admin/login')
def admin_login():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get('email', '')).strip().lower()
    password = str(payload.get('password', '')).strip()

    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        return jsonify({'message': 'Admin credentials are not configured on the server.'}), 500

    if email != ADMIN_EMAIL.lower() or password != ADMIN_PASSWORD:
        return jsonify({'message': 'Invalid admin credentials'}), 401

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _get_admin_user(cur)
        conn.commit()
    finally:
        _return_connection(conn)

    token = _issue_admin_token()
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
        match_duration_mins = max(1, int(payload.get('matchDurationMins', 10)))
    except (TypeError, ValueError):
        return jsonify({'message': 'entryFee, prizePool, maxParticipants and matchDurationMins must be valid numbers.'}), 400

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
            _ensure_tournament_duration_column(cur)
            cur.execute(
                '''
                INSERT INTO tournaments
                (name, description, entry_fee, prize_pool, participants, max_participants, status, start_time, duration, image, match_duration_mins)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''',
                (name, description, entry_fee, prize_pool, 0, max_participants, status, start_time, duration, image, match_duration_mins),
            )
            tournament_id = cur.lastrowid
            tournament = _fetch_tournament_with_counts(cur, tournament_id)
        conn.commit()
        return jsonify({'message': 'Tournament created successfully.', 'tournament': _serialize_tournament(tournament)}), 201
    finally:
        _return_connection(conn)


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
        _return_connection(conn)


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
        _return_connection(conn)


@app.put('/api/admin/tournaments/<int:tournament_id>')
def admin_update_tournament(tournament_id: int):
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    name = str(payload.get('name', '')).strip()
    image = str(payload.get('image', '')).strip()
    status = str(payload.get('status', '')).strip().lower()
    start_time_raw = str(payload.get('startTime', '')).strip()

    try:
        entry_fee = float(payload.get('entryFee', 0))
        prize_pool = float(payload.get('prizePool', 0))
        max_participants = max(TOURNAMENT_MATCH_SIZE, int(payload.get('maxParticipants', 0)))
        match_duration_mins = max(1, int(payload.get('matchDurationMins', 10)))
    except (TypeError, ValueError):
        return jsonify({'message': 'entryFee, prizePool, maxParticipants and matchDurationMins must be valid numbers.'}), 400

    if not name:
        return jsonify({'message': 'Tournament name is required.'}), 400
    if status and status not in {'upcoming', 'active', 'completed'}:
        return jsonify({'message': 'Invalid status.'}), 400

    start_time = None
    if start_time_raw:
        try:
            start_time = datetime.fromisoformat(start_time_raw.replace('Z', ''))
        except ValueError:
            start_time = None

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_tournament_duration_column(cur)
            tournament = _fetch_tournament_with_counts(cur, tournament_id, lock=True)
            if not tournament:
                return jsonify({'message': 'Tournament not found.'}), 404

            fields = ['name=%s', 'entry_fee=%s', 'prize_pool=%s', 'max_participants=%s', 'match_duration_mins=%s']
            values = [name, entry_fee, prize_pool, max_participants, match_duration_mins]

            if image:
                fields.append('image=%s')
                values.append(image)
            if start_time is not None:
                fields.append('start_time=%s')
                values.append(start_time)
            if status:
                fields.append('status=%s')
                values.append(status)

            values.append(tournament_id)
            cur.execute(f'UPDATE tournaments SET {", ".join(fields)} WHERE id=%s', values)
            updated = _fetch_tournament_with_counts(cur, tournament_id)
        conn.commit()
        return jsonify({'message': 'Tournament updated successfully.', 'tournament': _serialize_tournament(updated)})
    finally:
        _return_connection(conn)


@app.get('/api/admin/tournaments/<int:tournament_id>/participants')
def admin_tournament_participants(tournament_id: int):
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM tournaments WHERE id=%s', (tournament_id,))
            if not cur.fetchone():
                return jsonify({'message': 'Tournament not found.'}), 404

            cur.execute(
                '''
                SELECT
                    u.id, u.username, u.email, u.wpm,
                    tj.joined_at, tj.paid_amount
                FROM tournament_joins tj
                JOIN users u ON u.id = tj.user_id
                WHERE tj.tournament_id = %s
                ORDER BY tj.joined_at ASC
                ''',
                (tournament_id,),
            )
            rows = cur.fetchall()

        participants = [
            {
                'id': row['id'],
                'username': row['username'],
                'email': row['email'],
                'wpm': float(row['wpm'] or 0),
                'paidAmount': float(row['paid_amount'] or 0),
                'joinedAt': row['joined_at'].isoformat() + 'Z' if row.get('joined_at') else None,
            }
            for row in rows
        ]
        return jsonify(participants)
    finally:
        _return_connection(conn)


@app.post('/api/admin/tournaments/<int:tournament_id>/force-start')
def admin_force_start_tournament(tournament_id: int):
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM tournaments WHERE id = %s', (tournament_id,))
            tournament = cur.fetchone()
            if not tournament:
                return jsonify({'message': 'Tournament not found.'}), 404

            t_status = str(tournament.get('status') or '').lower()
            if t_status == 'completed':
                return jsonify({'message': 'Tournament already completed.'}), 400

            # Gather joined players (paid or waiting)
            cur.execute(
                '''
                SELECT tj.user_id, tj.paid_amount
                FROM tournament_joins tj
                WHERE tj.tournament_id = %s
                ORDER BY tj.joined_at ASC, tj.id ASC
                FOR UPDATE
                ''',
                (tournament_id,),
            )
            joins = cur.fetchall()
            actual_count = len(joins)

            if actual_count < 2:
                return jsonify({'message': f'Cannot force-start: only {actual_count} player(s) in the lobby. Need at least 2.'}), 400

            entry_fee = float(tournament.get('entry_fee') or 0)

            # Charge any players who joined but haven't been charged yet
            insufficient_user_ids: list[int] = []
            for join_row in joins:
                uid = int(join_row['user_id'])
                if float(join_row.get('paid_amount') or 0) == 0:
                    cur.execute('SELECT id, balance FROM users WHERE id = %s FOR UPDATE', (uid,))
                    u = cur.fetchone()
                    if not u or float(u.get('balance') or 0) < entry_fee:
                        insufficient_user_ids.append(uid)

            if insufficient_user_ids:
                placeholders = ', '.join(['%s'] * len(insufficient_user_ids))
                cur.execute(
                    f'DELETE FROM tournament_joins WHERE tournament_id = %s AND user_id IN ({placeholders})',
                    (tournament_id, *insufficient_user_ids),
                )
                # Re-fetch after removing broke players
                cur.execute(
                    'SELECT tj.user_id, tj.paid_amount FROM tournament_joins tj WHERE tj.tournament_id = %s FOR UPDATE',
                    (tournament_id,),
                )
                joins = cur.fetchall()
                actual_count = len(joins)
                if actual_count < 2:
                    conn.commit()
                    return jsonify({'message': f'After removing players with insufficient funds, only {actual_count} remain. Need at least 2.'}), 400

            # Charge uncharged players
            for join_row in joins:
                uid = int(join_row['user_id'])
                if float(join_row.get('paid_amount') or 0) == 0:
                    cur.execute('UPDATE users SET balance = balance - %s WHERE id = %s', (entry_fee, uid))

            cur.execute(
                'UPDATE tournament_joins SET paid_amount = %s WHERE tournament_id = %s AND paid_amount = 0',
                (entry_fee, tournament_id),
            )

            # Start with actual player count (prize pool = actual collected fees)
            cur.execute(
                'UPDATE tournaments SET participants = %s, status = %s, start_time = %s WHERE id = %s',
                (actual_count, 'upcoming', datetime.utcnow() + timedelta(seconds=TOURNAMENT_START_DELAY_SECONDS), tournament_id),
            )

        conn.commit()
        return jsonify({
            'message': f'Tournament force-started with {actual_count} player(s). Starts in {TOURNAMENT_START_DELAY_SECONDS}s.',
            'participants': actual_count,
            'prizePool': round(entry_fee * actual_count * WINNER_PRIZE_SHARE, 2),
        })
    finally:
        _return_connection(conn)


@app.post('/api/admin/tournaments/<int:tournament_id>/cancel')
def admin_cancel_tournament(tournament_id: int):
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT * FROM tournaments WHERE id = %s', (tournament_id,))
            tournament = cur.fetchone()
            if not tournament:
                return jsonify({'message': 'Tournament not found.'}), 404

            if str(tournament.get('status') or '').lower() == 'completed':
                return jsonify({'message': 'Cannot cancel a completed tournament.'}), 400

            # Refund all players who were charged
            cur.execute(
                'SELECT user_id, paid_amount FROM tournament_joins WHERE tournament_id = %s AND paid_amount > 0',
                (tournament_id,),
            )
            paid_joins = cur.fetchall()

            refunded_count = 0
            for join_row in paid_joins:
                uid = int(join_row['user_id'])
                refund = float(join_row['paid_amount'] or 0)
                if refund > 0:
                    cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (refund, uid))
                    refunded_count += 1

            # Remove all join records and mark tournament cancelled
            cur.execute('DELETE FROM tournament_joins WHERE tournament_id = %s', (tournament_id,))
            cur.execute(
                "UPDATE tournaments SET status = 'cancelled', participants = 0 WHERE id = %s",
                (tournament_id,),
            )

        conn.commit()
        return jsonify({
            'message': f'Tournament cancelled. {refunded_count} player(s) refunded.',
            'refundedPlayers': refunded_count,
        })
    finally:
        _return_connection(conn)


@app.get('/api/tournaments/<int:tournament_id>/winner')
def tournament_winner(tournament_id: int):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_tournament_prize_paid_column(cur)
            cur.execute('SELECT id, status FROM tournaments WHERE id=%s', (tournament_id,))
            tournament = cur.fetchone()
            if not tournament:
                return jsonify({'message': 'Tournament not found.'}), 404

            cur.execute(
                '''
                SELECT
                    u.id, u.username,
                    tj.paid_amount, tj.prize_paid
                FROM tournament_joins tj
                JOIN users u ON u.id = tj.user_id
                WHERE tj.tournament_id = %s AND tj.paid_amount > 0
                ORDER BY tj.prize_paid DESC, tj.joined_at ASC
                LIMIT 1
                ''',
                (tournament_id,),
            )
            winner_row = cur.fetchone()

        if not winner_row:
            return jsonify({'winner': None})

        return jsonify({
            'winner': {
                'id': winner_row['id'],
                'username': winner_row['username'],
                'prize': float(winner_row['prize_paid'] or 0),
            }
        })
    finally:
        _return_connection(conn)


@app.get('/api/admin/wallet')
def admin_wallet_summary():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            admin_user = _get_admin_user(cur)
            if not admin_user:
                return jsonify({'message': 'Admin wallet user was not found. Make sure the admin email also exists in users.'}), 404
            _ensure_marketplace_revenue_table(cur)
            _ensure_admin_wallet_transactions_table(cur)
            cur.execute(
                '''
                SELECT COALESCE(SUM(amount), 0) AS total_marketplace_revenue
                FROM marketplace_revenue
                WHERE admin_user_id = %s
                ''',
                (admin_user['id'],),
            )
            revenue_row = cur.fetchone() or {}
            history = _get_admin_wallet_history(cur, int(admin_user['id']))
        return jsonify(
            {
                'adminEmail': admin_user.get('email') or ADMIN_EMAIL,
                'adminUsername': admin_user.get('username') or 'Admin',
                'balance': float(admin_user.get('balance') or 0),
                'marketplaceRevenueTotal': float(revenue_row.get('total_marketplace_revenue') or 0),
                'history': history,
            }
        )
    finally:
        _return_connection(conn)


@app.post('/api/admin/wallet/topup')
def admin_wallet_topup():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    try:
        amount_value = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid amount'}), 400

    if not math.isfinite(amount_value) or amount_value <= 0:
        return jsonify({'message': 'Amount must be greater than zero'}), 400

    note = str(payload.get('note') or 'Manual admin wallet top-up').strip()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            admin_user = _get_admin_user(cur)
            if not admin_user:
                return jsonify({'message': 'Admin wallet user was not found. Make sure the admin email also exists in users.'}), 404
            cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (amount_value, admin_user['id']))
            tx_info = _record_admin_wallet_transaction(
                cur,
                admin_user_id=int(admin_user['id']),
                transaction_type='manual_topup',
                amount=amount_value,
                direction='in',
                source='admin_panel',
                note=note,
            )
        conn.commit()
        return jsonify(
            {
                'message': f'Added KES {amount_value:.2f} to the admin wallet.',
                'wallet': {
                    'balance': float(tx_info['adminUser'].get('balance') or 0),
                },
                'transaction': {
                    'code': tx_info['code'],
                    'type': tx_info['transactionType'],
                    'amount': tx_info['amount'],
                    'direction': tx_info['direction'],
                    'source': tx_info['source'],
                    'note': tx_info['note'],
                },
            }
        )
    finally:
        _return_connection(conn)


@app.post('/api/admin/wallet/withdraw')
def admin_wallet_withdraw():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    try:
        amount_value = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid amount'}), 400

    if not math.isfinite(amount_value) or amount_value <= 0:
        return jsonify({'message': 'Amount must be greater than zero'}), 400

    note = str(payload.get('note') or 'Manual admin wallet withdrawal').strip()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            admin_user = _get_admin_user(cur)
            if not admin_user:
                return jsonify({'message': 'Admin wallet user was not found. Make sure the admin email also exists in users.'}), 404
            admin_balance = float(admin_user.get('balance') or 0)
            if admin_balance < amount_value:
                return jsonify({'message': f'Insufficient admin wallet balance. Available balance is KES {admin_balance:.2f}.'}), 400
            cur.execute('UPDATE users SET balance = balance - %s WHERE id = %s', (amount_value, admin_user['id']))
            tx_info = _record_admin_wallet_transaction(
                cur,
                admin_user_id=int(admin_user['id']),
                transaction_type='manual_withdrawal',
                amount=amount_value,
                direction='out',
                source='admin_panel',
                note=note,
            )
        conn.commit()
        return jsonify(
            {
                'message': f'Withdrew KES {amount_value:.2f} from the admin wallet.',
                'wallet': {
                    'balance': float(tx_info['adminUser'].get('balance') or 0),
                },
                'transaction': {
                    'code': tx_info['code'],
                    'type': tx_info['transactionType'],
                    'amount': tx_info['amount'],
                    'direction': tx_info['direction'],
                    'source': tx_info['source'],
                    'note': tx_info['note'],
                },
            }
        )
    finally:
        _return_connection(conn)


@app.get('/api/admin/analytics')
def admin_analytics():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            admin_user = _get_admin_user(cur)
            _ensure_marketplace_revenue_table(cur)
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

            cur.execute(
                '''
                SELECT COALESCE(SUM(amount), 0) AS marketplace_total
                FROM marketplace_revenue
                '''
            )
            marketplace_revenue = cur.fetchone() or {}

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
                'adminWalletBalance': float(admin_user.get('balance') or 0) if admin_user else 0,
                'marketplaceRevenueTotal': float(marketplace_revenue.get('marketplace_total') or 0),
                'topPlayers': [
                    {
                        'id': row['id'],
                        'username': row['username'],
                        'wpm': float(row.get('wpm') or 0),
                        'wins': int(row.get('wins') or 0),
                    }
                    for row in top_players
                ],
            }
        )
    finally:
        _return_connection(conn)


@app.get('/api/admin/ai-settings')
def admin_ai_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    settings = _current_ai_settings()
    settings['hasApiKey'] = bool(OPENAI_API_KEY)
    return jsonify(settings)


@app.get('/api/admin/content')
def admin_content_list():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_typing_content_table(cur)
            cur.execute(
                '''
                SELECT id, content_id, content_type, mode, language, passage, is_active, created_at, updated_at
                FROM typing_content
                ORDER BY updated_at DESC, id DESC
                '''
            )
            rows = cur.fetchall()
        return jsonify(rows)
    finally:
        _return_connection(conn)


def _validate_admin_content_payload(payload: Dict[str, Any]) -> tuple[str, str, str, str, bool] | tuple[None, None, None, None, None]:
    content_type = str(payload.get('contentType') or 'practice').strip().lower()
    mode = str(payload.get('mode') or 'standard').strip().lower()
    language = str(payload.get('language') or 'english').strip().lower()
    passage = str(payload.get('passage') or '').strip()
    if content_type not in {'practice', 'live'}:
        return None, None, None, None, None
    if not mode or not language or not passage or len(passage) > 10000:
        return None, None, None, None, None
    active = payload.get('isActive', True) is not False
    return content_type, mode, language, passage, active


@app.post('/api/admin/content')
def admin_content_create():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    content_type, mode, language, passage, active = _validate_admin_content_payload(request.get_json(silent=True) or {})
    if content_type is None:
        return jsonify({'message': 'Provide a valid content type, mode, language, and passage.'}), 400
    content_id = f'admin_{secrets.token_urlsafe(12)}'
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_typing_content_table(cur)
            cur.execute(
                '''
                INSERT INTO typing_content (content_id, content_type, mode, language, passage, is_active)
                VALUES (%s, %s, %s, %s, %s, %s)
                ''',
                (content_id, content_type, mode, language, passage, 1 if active else 0),
            )
            cur.execute('SELECT * FROM typing_content WHERE id=%s', (cur.lastrowid,))
            row = cur.fetchone()
        conn.commit()
        return jsonify({'message': 'Typing content added.', 'content': row}), 201
    finally:
        _return_connection(conn)


@app.put('/api/admin/content/<int:content_id>')
def admin_content_update(content_id: int):
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    content_type, mode, language, passage, active = _validate_admin_content_payload(request.get_json(silent=True) or {})
    if content_type is None:
        return jsonify({'message': 'Provide a valid content type, mode, language, and passage.'}), 400
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_typing_content_table(cur)
            cur.execute('SELECT * FROM typing_content WHERE id=%s FOR UPDATE', (content_id,))
            existing = cur.fetchone()
            if not existing:
                return jsonify({'message': 'Content not found.'}), 404
            if str(existing.get('content_id')) and _content_in_active_room(str(existing['content_id']), cur):
                return jsonify({'message': 'This passage is assigned to an active room and cannot be edited yet.'}), 409
            cur.execute(
                '''
                UPDATE typing_content
                SET content_type=%s, mode=%s, language=%s, passage=%s, is_active=%s
                WHERE id=%s
                ''',
                (content_type, mode, language, passage, 1 if active else 0, content_id),
            )
            cur.execute('SELECT * FROM typing_content WHERE id=%s', (content_id,))
            row = cur.fetchone()
        conn.commit()
        return jsonify({'message': 'Typing content updated.', 'content': row})
    finally:
        _return_connection(conn)


@app.delete('/api/admin/content/<int:content_id>')
def admin_content_delete(content_id: int):
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_typing_content_table(cur)
            cur.execute('SELECT content_id FROM typing_content WHERE id=%s FOR UPDATE', (content_id,))
            existing = cur.fetchone()
            if not existing:
                return jsonify({'message': 'Content not found.'}), 404
            if _content_in_active_room(str(existing['content_id']), cur):
                cur.execute('UPDATE typing_content SET is_active=0 WHERE id=%s', (content_id,))
                message = 'Passage is in an active room, so it was deactivated instead of deleted.'
            else:
                cur.execute('DELETE FROM typing_content WHERE id=%s', (content_id,))
                message = 'Typing content deleted.'
        conn.commit()
        return jsonify({'message': message})
    finally:
        _return_connection(conn)


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


@app.post('/api/admin/impersonate-user')
def admin_impersonate_user():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    raw_user_id = payload.get('userId')
    raw_username = str(payload.get('username') or '').strip()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            target_user = None
            if raw_user_id is not None:
                try:
                    user_id = int(raw_user_id)
                except (TypeError, ValueError):
                    return jsonify({'message': 'Invalid user id'}), 400
                cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
                target_user = cur.fetchone()
            elif raw_username:
                cur.execute('SELECT * FROM users WHERE LOWER(username)=LOWER(%s)', (raw_username,))
                target_user = cur.fetchone()
            else:
                return jsonify({'message': 'userId or username is required'}), 400

            if not target_user:
                return jsonify({'message': 'User not found'}), 404

            _ensure_auth_token_column(cur)
            token = _issue_user_token(cur, int(target_user['id']))
        conn.commit()
        response = _safe_user(target_user, conn)
        response['token'] = token
        message = f"Signed in as {response.get('username') or 'player'}."
        return jsonify({'user': response, 'message': message})
    finally:
        _return_connection(conn)


@app.get('/api/site-marquee')
def site_marquee_settings():
    return jsonify(_load_site_settings())


@app.get('/api/media-settings')
def media_settings():
    settings = _load_site_settings()
    return jsonify({
        'musicTracks': settings.get('musicTracks', []),
        'commentatorEnabled': settings.get('commentatorEnabled', True),
        'commentatorConfig': settings.get('commentatorConfig', _default_commentator_config()),
        'commentatorPhrases': settings.get('commentatorPhrases', _default_commentator_phrases()),
    })


@app.get('/api/leaderboard-settings')
def leaderboard_settings():
    return jsonify({'tiers': _load_site_settings().get('leaderboardTiers', _default_leaderboard_tiers())})


@app.get('/api/admin/site-marquee')
def admin_site_marquee_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    return jsonify(_load_site_settings())


@app.put('/api/admin/site-marquee')
def admin_update_site_marquee_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    items = payload.get('items')
    if not isinstance(items, list):
        return jsonify({'message': 'Marquee items must be sent as a list.'}), 400

    try:
        settings = _save_site_marquee_settings(items)
    except OSError:
        return jsonify({'message': 'Could not save marquee settings on the server.'}), 500

    return jsonify({'message': 'Marquee content updated.', 'settings': settings})


@app.get('/api/admin/media-settings')
def admin_media_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    settings = _load_site_settings()
    return jsonify({
        'musicTracks': settings.get('musicTracks', []),
        'commentatorEnabled': settings.get('commentatorEnabled', True),
        'commentatorConfig': settings.get('commentatorConfig', _default_commentator_config()),
        'commentatorPhrases': settings.get('commentatorPhrases', _default_commentator_phrases()),
    })


@app.put('/api/admin/media-settings')
def admin_update_media_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    payload = request.get_json(silent=True) or {}
    tracks = payload.get('musicTracks', [])
    if not isinstance(tracks, list) or len(tracks) > 100:
        return jsonify({'message': 'Music playlist must contain at most 100 tracks.'}), 400
    settings = _save_media_settings(
        tracks,
        payload.get('commentatorEnabled', True),
        payload.get('commentatorConfig'),
        payload.get('commentatorPhrases'),
    )
    return jsonify({'message': 'Media settings updated.', 'settings': settings})


@app.get('/api/admin/leaderboard-settings')
def admin_leaderboard_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    return jsonify({'tiers': _load_site_settings().get('leaderboardTiers', _default_leaderboard_tiers())})


@app.put('/api/admin/leaderboard-settings')
def admin_update_leaderboard_settings():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401
    payload = request.get_json(silent=True) or {}
    tiers = _normalize_leaderboard_tiers(payload.get('tiers'))
    if tiers == _default_leaderboard_tiers() and payload.get('tiers') != tiers:
        return jsonify({'message': 'Tier thresholds must be increasing: Bronze, Silver, Gold, Diamond, Grandmaster.'}), 400
    _save_leaderboard_settings(tiers)
    return jsonify({'message': 'Leaderboard tier thresholds updated.', 'tiers': tiers})


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
            _ensure_auth_token_column(cur)
            token = _issue_user_token(cur, user_id)
            cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
            user = cur.fetchone()
        conn.commit()
        response = _safe_user(user, conn)
        response['token'] = token
        return jsonify(response), 201
    finally:
        _return_connection(conn)


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

        with conn.cursor() as cur:
            _ensure_auth_token_column(cur)
            token = _issue_user_token(cur, user['id'])
        conn.commit()
        safe_user = _safe_user(user, conn)
        safe_user['token'] = token
        if safe_user.get('isAdmin'):
            safe_user['adminEmail'] = ADMIN_EMAIL
            safe_user['adminToken'] = _issue_admin_token()
        return jsonify(safe_user)
    finally:
        _return_connection(conn)


@app.get('/api/user/me')
def user_me():
    conn = get_connection()
    try:
        try:
            user = _get_user_from_header(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            # Session validation must be read-only. Rotating the token here lets
            # concurrent App/Play requests invalidate one another.
            token = request.headers.get('Authorization', '')[7:].strip()
            response = _safe_user(user, conn)
            response['token'] = token
            return jsonify(response)
        except Exception:
            app.logger.exception(
                '/api/user/me failed for user_id=%s email=%s',
                user.get('id') if isinstance(user, dict) else None,
                user.get('email') if isinstance(user, dict) else None,
            )
            raise
    finally:
        _return_connection(conn)


@app.post('/api/auth/refresh')
def auth_refresh():
    """Lets a logged-in frontend exchange its current token for a fresh one."""
    conn = get_connection()
    try:
        try:
            user = _get_user_from_header(conn)
            if not user:
                return jsonify({'message': 'Unauthorized'}), 401
            with conn.cursor() as cur:
                _ensure_auth_token_column(cur)
                token = _issue_user_token(cur, user['id'])
            conn.commit()
            response = _safe_user(user, conn)
            response['token'] = token
            return jsonify(response)
        except Exception:
            app.logger.exception(
                '/api/auth/refresh failed for user_id=%s email=%s',
                user.get('id') if isinstance(user, dict) else None,
                user.get('email') if isinstance(user, dict) else None,
            )
            raise
    finally:
        _return_connection(conn)


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
        _return_connection(conn)


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

    if not math.isfinite(amount_value) or amount_value <= 0:
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

        withdrawal_fee = _withdrawal_fee_for_method(amount_value, payout_method)
        total_debit = amount_value + withdrawal_fee
        current_balance = float(user.get('balance') or 0)
        if current_balance < total_debit:
            return jsonify({'message': f'Insufficient balance. You need KES {total_debit:.2f} including the KES {withdrawal_fee:.2f} fee.'}), 400

        payout_status = 'pending'
        payout_mode = 'live'
        payout_response: Dict[str, Any] = {}
        if capabilities.get('simulatedPaymentsEnabled'):
            payout_status = 'completed'
            payout_mode = 'simulated'
        else:
            try:
                if payout_method == 'paypal':
                    _paypal_payout(payout_destination, amount_value, currency)
                elif payout_method == 'mpesa':
                    payout_response = _mpesa_b2c_payout(
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
            _ensure_prize_payout_tracking_columns(cur)
            cur.execute('UPDATE users SET balance = balance - %s WHERE id = %s', (total_debit, user['id']))
            payout_code = f'withdraw_{int(datetime.utcnow().timestamp() * 1000)}'
            cur.execute(
                '''
                INSERT INTO prize_payouts
                (
                    payout_code,
                    user_id,
                    tournament_id,
                    phone_number,
                    amount,
                    payout_method,
                    fee_amount,
                    provider_originator_conversation_id,
                    provider_conversation_id,
                    result_code,
                    result_desc,
                    status,
                    mode,
                    created_at,
                    completed_at
                )
                VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''',
                (
                    payout_code,
                    user['id'],
                    payout_destination,
                    amount_value,
                    payout_method,
                    withdrawal_fee,
                    payout_response.get('OriginatorConversationID'),
                    payout_response.get('ConversationID'),
                    str(payout_response.get('ResponseCode') or '') if payout_response else '',
                    payout_response.get('ResponseDescription') if payout_response else '',
                    payout_status,
                    payout_mode,
                    _now_db(),
                    _now_db() if payout_status == 'completed' else None,
                ),
            )
            cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
            updated_user = cur.fetchone()
            admin_user = _get_admin_user(cur)
            if admin_user and withdrawal_fee > 0:
                cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (withdrawal_fee, admin_user['id']))
                _record_admin_wallet_transaction(
                    cur,
                    admin_user_id=int(admin_user['id']),
                    transaction_type='withdrawal_fee_profit',
                    amount=float(withdrawal_fee),
                    direction='in',
                    source='wallet_fee',
                    note=f'Withdrawal fee collected from user {user["id"]}',
                )
        conn.commit()
        return jsonify(
            {
                'message': (
                    f'Simulated withdrawal completed via {payout_method.replace("_", " ").title()}. '
                    f'KES {withdrawal_fee:.0f} fee deducted.'
                    if payout_mode == 'simulated'
                    else f'Withdrawal sent via {payout_method.replace("_", " ").title()}. KES {withdrawal_fee:.0f} fee deducted.'
                ),
                'fee': withdrawal_fee,
                'amount': amount_value,
                'currency': currency,
                'payoutMethod': payout_method,
                'status': payout_status,
                'payoutCode': payout_code,
                'provider': payout_response,
                'user': _safe_user(updated_user),
            }
        )
    finally:
        _return_connection(conn)


@app.post('/api/wallet/topup')
def wallet_topup():
    payload = request.get_json(silent=True) or {}
    amount = payload.get('amount')

    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid amount'}), 400

    if not math.isfinite(amount_value) or amount_value <= 0:
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

        if capabilities.get('simulatedPaymentsEnabled') and payment_method == 'mpesa':
            phone_number = _normalize_mpesa_phone(account_identifier)
            if not phone_number:
                return jsonify({'message': 'A valid M-Pesa phone number is required.'}), 400

            with conn.cursor() as cur:
                cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (amount_value, user['id']))
                cur.execute(
                    '''
                    INSERT INTO mpesa_transactions
                    (tx_code, user_id, phone_number, amount, status, mode, checkout_request_id, merchant_request_id, created_at, completed_at, result_desc)
                    VALUES (%s, %s, %s, %s, 'completed', 'simulated', %s, %s, %s, %s, %s)
                    ''',
                    (
                        tx_code,
                        user['id'],
                        phone_number,
                        amount_value,
                        f'SIM-{tx_code}',
                        f'SIM-MERCHANT-{user["id"]}',
                        _now_db(),
                        _now_db(),
                        'Simulated wallet top-up',
                    ),
                )
                cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                updated_user = cur.fetchone()
            conn.commit()
            return jsonify(
                {
                    'message': 'Simulated M-Pesa top-up completed and funds were added to your wallet.',
                    'status': 'completed',
                    'currency': currency,
                    'paymentMethod': 'mpesa',
                    'user': _safe_user(updated_user, conn),
                }
            )

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
        _return_connection(conn)


@app.post('/api/mpesa_payment')
def mpesa_payment():
    payload = request.get_json(silent=True) or request.form.to_dict() or {}

    try:
        amount_value = float(payload.get('amount'))
    except (TypeError, ValueError):
        return jsonify({'message': 'A valid amount is required.'}), 400

    if not math.isfinite(amount_value) or amount_value <= 0:
        return jsonify({'message': 'Amount must be greater than zero.'}), 400

    phone_number = _normalize_mpesa_phone(payload.get('phone') or payload.get('phoneNumber') or '')
    if not phone_number:
        return jsonify({'message': 'A valid M-Pesa phone number is required.'}), 400

    account_reference = str(payload.get('accountReference') or 'account').strip() or 'account'
    description = str(payload.get('transactionDesc') or 'account').strip() or 'account'
    callback_url = str(payload.get('callbackUrl') or '').strip() or None
    tx_code = f'mpesa_{int(datetime.utcnow().timestamp() * 1000)}'
    conn = get_connection()

    try:
        user = _get_user_from_header(conn)

        if MPESA_SIMULATE:
            simulated_checkout_id = f'SIM-{tx_code}'
            simulated_merchant_id = f'SIM-MERCHANT-{phone_number}'
            updated_user = None

            if user:
                with conn.cursor() as cur:
                    cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (amount_value, user['id']))
                    cur.execute(
                        '''
                        INSERT INTO mpesa_transactions
                        (tx_code, user_id, phone_number, amount, status, mode, checkout_request_id, merchant_request_id, created_at, completed_at, result_desc)
                        VALUES (%s, %s, %s, %s, 'completed', 'simulated', %s, %s, %s, %s, %s)
                        ''',
                        (
                            tx_code,
                            user['id'],
                            phone_number,
                            amount_value,
                            simulated_checkout_id,
                            simulated_merchant_id,
                            _now_db(),
                            _now_db(),
                            description,
                        ),
                    )
                    cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                    updated_user = cur.fetchone()
                conn.commit()

            return jsonify(
                {
                    'message': 'Please Complete Payment in Your Phone and we will deliver in minutes',
                    'status': 'completed' if user else 'pending',
                    'mode': 'simulated',
                    'paymentMethod': 'mpesa',
                    'user': _safe_user(updated_user, conn) if updated_user else None,
                    'mpesa': {
                        'ResponseCode': '0',
                        'ResponseDescription': 'Simulated STK push accepted for testing.',
                        'CustomerMessage': 'Simulated M-Pesa prompt sent.',
                        'CheckoutRequestID': simulated_checkout_id,
                        'MerchantRequestID': simulated_merchant_id,
                        'PhoneNumber': phone_number,
                        'Amount': int(round(amount_value)),
                    },
                }
            )

        try:
            stk_response = _mpesa_stk_push(
                phone_number=phone_number,
                amount=amount_value,
                account_reference=account_reference,
                description=description,
                callback_url=callback_url,
            )
        except ValueError as exc:
            return jsonify({'message': str(exc)}), 400

        if stk_response.get('ResponseCode') != '0':
            return jsonify(
                {
                    'message': stk_response.get('errorMessage')
                    or stk_response.get('ResponseDescription')
                    or 'M-Pesa payment request failed.',
                    'mpesa': stk_response,
                }
            ), 400

        if user:
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
                'message': 'Please Complete Payment in Your Phone and we will deliver in minutes',
                'status': 'pending',
                'mode': 'live',
                'paymentMethod': 'mpesa',
                'mpesa': stk_response,
            }
        )
    finally:
        _return_connection(conn)


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
        _return_connection(conn)


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
        _return_connection(conn)


@app.get('/api/wallet/topup/status')
def wallet_topup_status():
    checkout_request_id = str(request.args.get('checkoutRequestId') or '').strip()
    if not checkout_request_id:
        return jsonify({'message': 'checkoutRequestId is required.'}), 400

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT *
                FROM mpesa_transactions
                WHERE checkout_request_id = %s AND user_id = %s
                LIMIT 1
                ''',
                (checkout_request_id, user['id']),
            )
            tx = cur.fetchone()
            if not tx:
                return jsonify({'message': 'Top-up transaction not found for this user.'}), 404

            latest_user = user
            if str(tx.get('status') or '').lower() == 'completed':
                cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                latest_user = cur.fetchone() or user

        return jsonify(
            {
                'status': str(tx.get('status') or 'pending').lower(),
                'amount': float(tx.get('amount') or 0),
                'paymentMethod': 'mpesa',
                'checkoutRequestId': checkout_request_id,
                'receiptNumber': tx.get('mpesa_receipt_number') or '',
                'resultCode': str(tx.get('result_code') or ''),
                'resultDescription': tx.get('result_desc') or '',
                'user': _safe_user(latest_user, conn) if latest_user else None,
            }
        )
    finally:
        _return_connection(conn)


@app.get('/api/wallet/withdraw/status')
def wallet_withdraw_status():
    payout_code = str(request.args.get('payoutCode') or '').strip()
    if not payout_code:
        return jsonify({'message': 'payoutCode is required.'}), 400

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        with conn.cursor() as cur:
            _ensure_prize_payout_tracking_columns(cur)
            cur.execute(
                '''
                SELECT *
                FROM prize_payouts
                WHERE payout_code = %s AND user_id = %s
                LIMIT 1
                ''',
                (payout_code, user['id']),
            )
            payout = cur.fetchone()
            if not payout:
                return jsonify({'message': 'Withdrawal transaction not found for this user.'}), 404

            latest_user = user
            if str(payout.get('status') or '').lower() in {'completed', 'failed'}:
                cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                latest_user = cur.fetchone() or user

        return jsonify(
            {
                'payoutCode': payout_code,
                'status': str(payout.get('status') or 'pending').lower(),
                'amount': float(payout.get('amount') or 0),
                'fee': float(payout.get('fee_amount') or 0),
                'payoutMethod': payout.get('payout_method') or '',
                'phoneNumber': payout.get('phone_number') or '',
                'resultCode': str(payout.get('result_code') or ''),
                'resultDescription': payout.get('result_desc') or '',
                'user': _safe_user(latest_user, conn) if latest_user else None,
            }
        )
    finally:
        _return_connection(conn)


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
        _return_connection(conn)


@app.post('/api/prizes/payout')
def payout_prize_to_winner():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

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

            if not math.isfinite(amount_value) or amount_value <= 0:
                return jsonify({'message': 'Amount must be greater than zero.'}), 400

            # â”€â”€ Double-payout guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if tournament_id is not None:
                cur.execute(
                    '''
                    SELECT id FROM prize_payouts
                    WHERE user_id = %s AND tournament_id = %s AND status = 'completed'
                    LIMIT 1
                    ''',
                    (user_id_int, tournament_id),
                )
                if cur.fetchone():
                    return jsonify({'message': 'Prize already paid for this tournament.'}), 409

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

            # â”€â”€ Write prize_paid so the winners list shows the correct amount â”€â”€
            if tournament:
                _ensure_tournament_prize_paid_column(cur)
                cur.execute(
                    'UPDATE tournament_joins SET prize_paid = %s WHERE tournament_id = %s AND user_id = %s',
                    (amount_value, tournament_id, user_id_int),
                )
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
        _return_connection(conn)


@app.post('/api/mpesa/callback/b2c-result')
def mpesa_b2c_result_callback():
    payload = request.get_json(silent=True) or {}
    result = payload.get('Result', {}) if isinstance(payload.get('Result'), dict) else {}
    originator_conversation_id = str(result.get('OriginatorConversationID') or '').strip()
    conversation_id = str(result.get('ConversationID') or '').strip()
    result_code = str(result.get('ResultCode') or '').strip()
    result_desc = str(result.get('ResultDesc') or '').strip()

    if not originator_conversation_id and not conversation_id:
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Ignored: missing conversation ids.'})

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_prize_payout_tracking_columns(cur)
            cur.execute(
                '''
                SELECT *
                FROM prize_payouts
                WHERE provider_originator_conversation_id = %s OR provider_conversation_id = %s
                LIMIT 1
                ''',
                (originator_conversation_id, conversation_id),
            )
            payout = cur.fetchone()
            if not payout:
                return jsonify({'ResultCode': 0, 'ResultDesc': 'Ignored: unknown payout reference.'})

            current_status = str(payout.get('status') or '').lower()
            if current_status == 'completed':
                return jsonify({'ResultCode': 0, 'ResultDesc': 'Payout already completed.'})
            if current_status == 'failed':
                return jsonify({'ResultCode': 0, 'ResultDesc': 'Payout already marked failed.'})

            if result_code == '0':
                cur.execute(
                    '''
                    UPDATE prize_payouts
                    SET
                        status='completed',
                        completed_at=%s,
                        result_code=%s,
                        result_desc=%s,
                        provider_originator_conversation_id=%s,
                        provider_conversation_id=%s
                    WHERE id=%s
                    ''',
                    (_now_db(), result_code, result_desc, originator_conversation_id, conversation_id, payout['id']),
                )
            else:
                updated_user = _refund_failed_withdrawal(cur, payout)
                cur.execute(
                    '''
                    UPDATE prize_payouts
                    SET
                        status='failed',
                        failed_at=%s,
                        result_code=%s,
                        result_desc=%s,
                        provider_originator_conversation_id=%s,
                        provider_conversation_id=%s
                    WHERE id=%s
                    ''',
                    (_now_db(), result_code, result_desc, originator_conversation_id, conversation_id, payout['id']),
                )
                if updated_user:
                    pass
        conn.commit()
        return jsonify({'ResultCode': 0, 'ResultDesc': 'B2C result callback processed'})
    finally:
        _return_connection(conn)


@app.post('/api/mpesa/callback/b2c-timeout')
def mpesa_b2c_timeout_callback():
    payload = request.get_json(silent=True) or {}
    originator_conversation_id = str(payload.get('OriginatorConversationID') or '').strip()
    conversation_id = str(payload.get('ConversationID') or '').strip()

    if not originator_conversation_id and not conversation_id:
        return jsonify({'ResultCode': 0, 'ResultDesc': 'Ignored: missing conversation ids.'})

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _ensure_prize_payout_tracking_columns(cur)
            cur.execute(
                '''
                SELECT *
                FROM prize_payouts
                WHERE provider_originator_conversation_id = %s OR provider_conversation_id = %s
                LIMIT 1
                ''',
                (originator_conversation_id, conversation_id),
            )
            payout = cur.fetchone()
            if not payout:
                return jsonify({'ResultCode': 0, 'ResultDesc': 'Ignored: unknown payout reference.'})

            current_status = str(payout.get('status') or '').lower()
            if current_status in {'completed', 'failed'}:
                return jsonify({'ResultCode': 0, 'ResultDesc': 'Payout already finalized.'})

            _refund_failed_withdrawal(cur, payout)
            cur.execute(
                '''
                UPDATE prize_payouts
                SET
                    status='failed',
                    failed_at=%s,
                    result_code=%s,
                    result_desc=%s,
                    provider_originator_conversation_id=%s,
                    provider_conversation_id=%s
                WHERE id=%s
                ''',
                (
                    _now_db(),
                    'TIMEOUT',
                    'M-Pesa B2C timeout callback received before completion.',
                    originator_conversation_id,
                    conversation_id,
                    payout['id'],
                ),
            )
        conn.commit()
        return jsonify({'ResultCode': 0, 'ResultDesc': 'B2C timeout callback processed'})
    finally:
        _return_connection(conn)


@app.get('/api/live-races')
def list_live_races():
    conn = get_connection()
    try:
        viewer = _get_user_from_header(conn)
        viewer_user_id = int(viewer['id']) if viewer else None
        with conn.cursor() as cur:
            rooms = sorted(
                (_serialize_live_room(room, viewer_user_id=viewer_user_id) for room in _list_live_rooms(cur)),
                key=lambda item: item.get('createdAt') or '',
                reverse=True,
            )
        return jsonify(rooms[:20])
    finally:
        _return_connection(conn)


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
            exclude_content_ids = payload.get('excludeContentIds') or []
            stake_amount = 0.0
            winner_takes_all = False

            # Only query store items when actually needed (custom invite code check)
            if is_private and invite_code:
                user_owned_items = set(_owned_store_items_for_user(conn, int(user.get('id') or 0)))
                user_perks = _store_perks_from_owned_items(user_owned_items)
                if not user_perks.get('customInviteCodes'):
                    return jsonify({'message': 'Buy the Signature Invite Pass in the marketplace to create custom private room codes.'}), 400

            content = _generate_live_battle_passage(
                mode,
                language,
                is_private=is_private,
                exclude_content_ids=exclude_content_ids,
            )
            text = content.get('passage') or LIVE_RACE_TEXTS.get(mode, LIVE_RACE_TEXTS['standard'])
            player_snapshot = {
                'userId': user['id'],
                'username': user['username'],
                'progress': 0,
                'currentWpm': 0,
                'currentAccuracy': 100,
            }

            if invite_code:
                room = _get_live_room_by_invite(cur, invite_code, for_update=True)
                if not room and not is_private:
                    return jsonify({'message': 'Friend battle room not found.'}), 404
                if room and room.get('password') and room.get('password') != room_password:
                    return jsonify({'message': 'Private room password is incorrect.'}), 403
                if room and all(existing['userId'] != user['id'] for existing in room['players']) and len(room['players']) >= TOURNAMENT_MATCH_SIZE:
                    return jsonify({'message': 'This private room is already full.'}), 400
                if room and all(existing['userId'] != user['id'] for existing in room['players']):
                    room['players'].append(player_snapshot)
                if room:
                    room['status'] = 'countdown' if len(room['players']) >= TOURNAMENT_MATCH_SIZE else 'waiting'
                    room['startedAt'] = _now_iso() if room['status'] == 'countdown' else room.get('startedAt')
                    _save_live_room(cur, room)
                    conn.commit()
                    return jsonify(
                        {
                            'room': _serialize_live_room(room, viewer_user_id=user['id']),
                            'matched': room['status'] == 'countdown',
                            'user': _safe_user(user, conn),
                            'message': 'Joined private room.',
                        }
                    )

            if not is_private:
                # Filter in SQL â€” avoids deserializing up to 100 rooms in Python.
                # This first pass is a plain (non-locking) read used only to shortlist
                # candidate room ids.
                cur.execute(
                    '''
                    SELECT room_id FROM live_race_rooms
                    WHERE status = 'waiting' AND is_private = 0
                    ORDER BY created_at ASC
                    LIMIT 20
                    ''',
                )
                candidate_ids = [row['room_id'] for row in cur.fetchall()]

                # Bug fix: previously the room found in the unlocked scan above was
                # joined and saved directly. Under concurrent queue requests, two
                # players could both read the same 1-player "waiting" room before
                # either committed, both append themselves, and both save - since
                # _save_live_room is an INSERT...ON DUPLICATE KEY UPDATE, the second
                # commit silently overwrote the first, so one of the two players
                # ended up "matched" on their own client against a room that no
                # longer contained them (a lost/ghost match). Re-fetch each
                # candidate individually WITH a row lock and re-validate it's still
                # actually open right before committing to it, so only one request
                # can ever win a given room.
                for candidate_id in candidate_ids:
                    room = _get_live_room(cur, candidate_id, for_update=True)
                    if not room or room.get('status') != 'waiting':
                        continue
                    if (
                        room.get('mode') != mode
                        or room.get('language') != language
                        or room.get('duration') != duration
                        or room.get('tournamentId') != tournament_id
                    ):
                        continue
                    if any(existing['userId'] == user['id'] for existing in room.get('players', [])):
                        continue
                    if len(room.get('players', [])) >= TOURNAMENT_MATCH_SIZE:
                        continue

                    room['players'].append(player_snapshot)
                    room['status'] = 'countdown'
                    room['startedAt'] = _now_iso()
                    _save_live_room(cur, room)
                    conn.commit()
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
                'countdown': LIVE_RACE_COUNTDOWN_SECONDS,
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
                'contentId': content.get('contentId'),
                'totalContentCount': int(content.get('totalContentCount') or 0),
                'tournamentId': tournament_id,
                'spectators': 0,
                'createdAt': _now_iso(),
                'startedAt': None,
                'completedAt': None,
            }
            _save_live_room(cur, room)
            conn.commit()
            return jsonify(
                {
                    'room': _serialize_live_room(room, viewer_user_id=user['id']),
                    'matched': False,
                    'user': _safe_user(user, conn),
                    'message': 'Private room created.' if is_private else 'Live room created.',
                }
            ), 201
    finally:
        _return_connection(conn)


@app.get('/api/live-races/<room_id>')
def get_live_race(room_id: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room(cur, room_id)
            if not room:
                return jsonify({'message': 'Live race room not found.'}), 404
            expired = _finalize_live_room_if_expired(room)
            viewer = _get_user_from_header(conn)
            viewer_user_id = int(viewer['id']) if viewer else None
            is_spectator = viewer_user_id and viewer_user_id not in {player['userId'] for player in room.get('players', [])}
            if is_spectator:
                room['spectators'] = int(room.get('spectators') or 0) + 1
            # Only persist when something meaningful changed
            if expired or is_spectator:
                _save_live_room(cur, room)
                conn.commit()
            return jsonify(_serialize_live_room(room, viewer_user_id=viewer_user_id))
    finally:
        _return_connection(conn)


@app.get('/api/live-races/invite/<invite_code>')
def get_live_race_by_invite(invite_code: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room_by_invite(cur, invite_code)
            if not room:
                return jsonify({'message': 'Friend battle room not found.'}), 404
            _finalize_live_room_if_expired(room)
            _save_live_room(cur, room)
            conn.commit()
            viewer = _get_user_from_header(conn)
            viewer_user_id = int(viewer['id']) if viewer else None
            return jsonify(_serialize_live_room(room, viewer_user_id=viewer_user_id))
    finally:
        _return_connection(conn)


@app.post('/api/live-races/<room_id>/cancel')
def cancel_live_race(room_id: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room(cur, room_id, for_update=True)
            if not room:
                return jsonify({'message': 'Live race room not found.'}), 404
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        if room.get('status') != 'waiting':
            return jsonify({'message': 'Only rooms still waiting for an opponent can be canceled.'}), 400
        if not any(player['userId'] == user['id'] for player in room.get('players', [])):
            return jsonify({'message': 'You are not part of this room.'}), 403

        if not room.get('isPrivate'):
            # Bug fix: public matchmaking rooms previously had no server-side leave
            # path at all - the "Leave Queue" button only cleared local UI state,
            # so a room the player queued into stayed 'waiting' in the DB forever.
            # A later player could then match into it and race a "ghost" opponent
            # who had already left. Let the sole occupant vacate it. If a second
            # player has already joined by the time this request lands, refuse
            # instead of yanking an active match out from under someone else.
            if len(room.get('players', [])) > 1:
                return jsonify({'message': 'An opponent already joined - this room can no longer be left.'}), 400
            with conn.cursor() as cur:
                _delete_live_room(cur, room_id)
            conn.commit()
            return jsonify(
                {
                    'message': 'Left the matchmaking queue.',
                    'refundedUsers': [],
                    'user': _safe_user(user, conn),
                }
            )

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
            _delete_live_room(cur, room_id)
        conn.commit()

        current_user = next((item for item in refunded_users if item['id'] == user['id']), _safe_user(user))
        return jsonify(
            {
                'message': 'Private room canceled.',
                'refundedUsers': refunded_users,
                'user': current_user,
            }
        )
    finally:
        _return_connection(conn)


@app.post('/api/live-races/<room_id>/heartbeat')
def update_live_race_progress(room_id: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room(cur, room_id, for_update=True)
            if not room:
                return jsonify({'message': 'Live race room not found.'}), 404
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        payload = request.get_json(silent=True) or {}
        if room.get('status') == 'completed':
            return jsonify(_serialize_live_room(room, viewer_user_id=user['id']))
        status_before = room.get('status')
        player = next((item for item in room.get('players', []) if item.get('userId') == user['id']), None)
        if not player:
            return jsonify({'message': 'You are not a participant in this race room.'}), 403
        try:
            progress = float(payload.get('progress') or 0)
            current_wpm = float(payload.get('currentWpm') or 0)
            current_accuracy = float(payload.get('currentAccuracy') or 0)
        except (TypeError, ValueError):
            return jsonify({'message': 'Invalid live race progress.'}), 400
        if (
            not math.isfinite(progress) or not math.isfinite(current_wpm) or not math.isfinite(current_accuracy)
            or progress < 0 or progress > 100 or current_wpm < 0 or current_wpm > 300
            or current_accuracy < 0 or current_accuracy > 100
        ):
            return jsonify({'message': 'Progress, WPM, and accuracy values are out of range.'}), 400
        evidence = player.setdefault('_antiCheat', {'maxProgress': 0.0, 'samples': [], 'lastPersistAt': 0.0})
        evidence['maxProgress'] = max(float(evidence.get('maxProgress') or 0), progress)
        now_ts = datetime.utcnow().timestamp()
        samples = evidence.setdefault('samples', [])
        if not samples or now_ts - float(samples[-1].get('at') or 0) >= 0.75:
            samples.append({'at': now_ts, 'progress': progress})
            del samples[:-40]
        player['progress'] = round(progress, 2)
        player['currentWpm'] = round(current_wpm, 1)
        player['currentAccuracy'] = round(current_accuracy, 1)
        if room['status'] == 'countdown':
            room['status'] = 'racing'
        expired = _finalize_live_room_if_expired(room)
        status_changed = room.get('status') != status_before
        should_persist = status_changed or expired or now_ts - float(evidence.get('lastPersistAt') or 0) >= 1
        if should_persist:
            evidence['lastPersistAt'] = now_ts
            with conn.cursor() as cur:
                _save_live_room(cur, room)
            conn.commit()
        return jsonify(_serialize_live_room(room, viewer_user_id=user['id']))
    finally:
        _return_connection(conn)

@app.post('/api/live-races/<room_id>/submit')
def submit_live_race(room_id: str):
    payload = request.get_json(silent=True) or {}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room(cur, room_id, for_update=True)
            if not room:
                return jsonify({'message': 'Live race room not found.'}), 404
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        if room.get('status') == 'completed':
            return jsonify(_serialize_live_room(room, viewer_user_id=user['id']))

        player_ids = {int(player.get('userId')) for player in room.get('players', []) if player.get('userId') is not None}
        if int(user['id']) not in player_ids:
            return jsonify({'message': 'You are not a participant in this race room.'}), 403
        try:
            wpm = float(payload.get('wpm') or 0)
            accuracy = float(payload.get('accuracy') or 0)
        except (TypeError, ValueError):
            return jsonify({'message': 'Invalid live race result.'}), 400

        if not math.isfinite(wpm) or not math.isfinite(accuracy) or wpm < 0 or wpm > 300 or accuracy < 0 or accuracy > 100:
            return jsonify({'message': 'WPM must be between 0 and 300 and accuracy between 0 and 100.'}), 400

        player = next((item for item in room.get('players', []) if item.get('userId') == user['id']), None)
        evidence = (player or {}).get('_antiCheat') or {}
        max_progress = max(0.0, min(100.0, float(evidence.get('maxProgress') or 0)))
        started_at = _parse_iso_datetime(room.get('startedAt'))
        elapsed_seconds = max(1.0, datetime.utcnow().timestamp() - started_at.timestamp()) if started_at else 1.0
        passage_length = max(1, len(str(room.get('text') or '')))
        observed_chars = passage_length * (max_progress / 100.0)
        evidence_wpm_cap = (observed_chars * 12 / elapsed_seconds) + 80 if observed_chars else 0
        validated_wpm = min(wpm, evidence_wpm_cap)
        room.setdefault('results', {})[user['id']] = {
            'userId': user['id'],
            'username': user['username'],
            'wpm': round(validated_wpm, 1),
            'accuracy': round(accuracy, 1),
            'finishedAt': _now_iso(),
            'finishedAtTs': datetime.utcnow().timestamp(),
        }
        _complete_live_race_if_ready(room, conn=conn)
        with conn.cursor() as cur:
            _save_live_room(cur, room)
        conn.commit()
        return jsonify(_serialize_live_room(room, viewer_user_id=user['id']))
    finally:
        _return_connection(conn)


@app.get('/api/race-content/generate')
def generate_race_content():
    mode = request.args.get('mode', 'business')
    language = request.args.get('language', 'english')
    exclude_content_ids = request.args.getlist('excludeContentIds')
    if len(exclude_content_ids) == 1 and ',' in exclude_content_ids[0]:
        exclude_content_ids = [item.strip() for item in exclude_content_ids[0].split(',') if item.strip()]
    excluded_set = _normalize_exclude_content_ids(exclude_content_ids)
    settings = _current_ai_settings()
    if settings['provider'] == 'local':
        content = _generate_passage(mode, language, exclude_content_ids=exclude_content_ids)
    else:
        try:
            content = _openai_generate_passage(mode, language)
            if excluded_set and str(content.get('contentId') or '') in excluded_set:
                content = _generate_passage(mode, language, exclude_content_ids=exclude_content_ids)
        except ValueError:
            content = _generate_passage(mode, language, exclude_content_ids=exclude_content_ids)
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
        _return_connection(conn)


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
                _ensure_marketplace_revenue_table(cur)
                _ensure_user_equipped_columns(cur)
                updated_user = _debit_user_balance(cur, user_id=user['id'], amount=float(item['price']))
                cur.execute(
                    '''
                    INSERT INTO store_purchases (user_id, item_id, item_name, price_paid)
                    VALUES (%s, %s, %s, %s)
                    ''',
                    (user['id'], item['id'], item['name'], float(item['price'])),
                )
                purchase_id = cur.lastrowid
                revenue_info = _record_marketplace_revenue(
                    cur,
                    buyer_user_id=int(user['id']),
                    purchase_id=int(purchase_id) if purchase_id else None,
                    item=item,
                    amount=float(item['price']),
                )
                equip_field = _equip_field_for_category(item.get('category'))
                if equip_field:
                    cur.execute(f'UPDATE users SET {equip_field}=%s WHERE id=%s', (item['id'], user['id']))
                cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                updated_user = cur.fetchone()
                # A season-points perk (e.g. perk_season_booster) applies to
                # this and future races' point deltas going forward — there's
                # no retroactive recompute of points already banked.
            except ValueError as exc:
                conn.rollback()
                return jsonify({'message': str(exc)}), 400
        conn.commit()
        return jsonify(
            {
                'message': (
                    f'{item["name"]} unlocked and equipped successfully. '
                    f'KES {float(item["price"]):.2f} was recorded as marketplace revenue'
                    + (' and credited to the platform wallet.' if revenue_info.get('destination') == 'admin_wallet' else '.')
                ),
                'item': item,
                'marketplaceRevenue': revenue_info,
                'user': _safe_user(updated_user, conn),
            }
        )
    finally:
        _return_connection(conn)


@app.post('/api/store/bundle-purchase')
def store_bundle_purchase():
    payload = request.get_json(silent=True) or {}
    bundle_id = str(payload.get('bundleId') or '').strip()
    bundle = next((candidate for candidate in STORE_BUNDLES if candidate['id'] == bundle_id), None)
    if not bundle:
        return jsonify({'message': 'Store bundle not found.'}), 404

    item_map = {item['id']: item for item in MARKETPLACE_ITEMS}
    bundle_items = [item_map[item_id] for item_id in bundle['item_ids'] if item_id in item_map]
    if not bundle_items:
        return jsonify({'message': 'This bundle has no valid store items.'}), 400

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401

        owned_item_ids = set(_owned_store_items_for_user(conn, int(user.get('id') or 0)))
        unowned_items = [item for item in bundle_items if item['id'] not in owned_item_ids]
        if not unowned_items:
            return jsonify({'message': 'You already own every item in this bundle.'}), 400

        total_price = sum(float(item.get('price') or 0) for item in bundle_items)
        unowned_total_price = sum(float(item.get('price') or 0) for item in unowned_items)
        discounted_price = round(unowned_total_price * (1 - float(bundle.get('discount_rate') or 0)), 2)

        with conn.cursor() as cur:
            try:
                _ensure_store_purchase_table(cur)
                _ensure_marketplace_revenue_table(cur)
                _ensure_user_equipped_columns(cur)
                updated_user = _debit_user_balance(cur, user_id=user['id'], amount=discounted_price)
                purchase_ids = []
                for item in unowned_items:
                    cur.execute(
                        '''
                        INSERT INTO store_purchases (user_id, item_id, item_name, price_paid)
                        VALUES (%s, %s, %s, %s)
                        ''',
                        (user['id'], item['id'], item['name'], float(item['price'])),
                    )
                    purchase_id = cur.lastrowid
                    purchase_ids.append(int(purchase_id) if purchase_id else None)
                    equip_field = _equip_field_for_category(item.get('category'))
                    if equip_field:
                        cur.execute(f'UPDATE users SET {equip_field}=%s WHERE id=%s', (item['id'], user['id']))

                revenue_info = _record_marketplace_revenue(
                    cur,
                    buyer_user_id=int(user['id']),
                    purchase_id=purchase_ids[-1] if purchase_ids else None,
                    item={
                        'id': bundle['id'],
                        'name': bundle['name'],
                    },
                    amount=discounted_price,
                )
                cur.execute('SELECT * FROM users WHERE id = %s', (user['id'],))
                updated_user = cur.fetchone()
            except ValueError as exc:
                conn.rollback()
                return jsonify({'message': str(exc)}), 400

        conn.commit()
        return jsonify(
            {
                'message': (
                    f'{bundle["name"]} purchased successfully. '
                    f'{len(unowned_items)} item{"s" if len(unowned_items) != 1 else ""} unlocked for '
                    f'KES {discounted_price:.2f}.'
                ),
                'bundle': {
                    'id': bundle['id'],
                    'name': bundle['name'],
                    'discountRate': float(bundle.get('discount_rate') or 0),
                    'itemIds': [item['id'] for item in bundle_items],
                    'regularTotal': total_price,
                    'remainingRegularTotal': unowned_total_price,
                    'chargedTotal': discounted_price,
                },
                'marketplaceRevenue': revenue_info,
                'user': _safe_user(updated_user, conn),
            }
        )
    finally:
        _return_connection(conn)


@app.get('/api/tournaments')
def get_tournaments():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        owned_items = set(_owned_store_items_for_user(conn, int(user.get('id') or 0))) if user else set()
        with conn.cursor() as cur:
            _ensure_tournament_duration_column(cur)
            _sync_tournament_statuses(cur)
            rows = _fetch_all_tournaments(cur)
        conn.commit()
        return jsonify([_serialize_tournament(r, owned_items) for r in rows])
    finally:
        _return_connection(conn)


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
            current_user_owned_items = set(_owned_store_items_for_user(conn, int(user.get('id') or 0)))
            current_user_perks = _store_perks_from_owned_items(current_user_owned_items)
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
                            'tournament': _serialize_tournament(refreshed_tournament, current_user_owned_items),
                            'user': _safe_user(user, conn),
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
                        'tournament': _serialize_tournament(refreshed_tournament, current_user_owned_items),
                        'user': _safe_user(user, conn),
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
                        'tournament': _serialize_tournament(refreshed_tournament, current_user_owned_items),
                        'user': _safe_user(user, conn),
                    }
                )

            if queued_players > match_size:
                return jsonify({'message': 'This tournament is already full.'}), 400

            joined_user_ids = [int(join_row['user_id']) for join_row in tournament_joins]
            joined_users: dict[int, Dict[str, Any]] = {}
            joined_user_owned_items: dict[int, set[str]] = {}
            insufficient_user_ids: list[int] = []
            for joined_user_id in joined_user_ids:
                cur.execute('SELECT * FROM users WHERE id = %s FOR UPDATE', (joined_user_id,))
                joined_user = cur.fetchone()
                if not joined_user:
                    insufficient_user_ids.append(joined_user_id)
                    continue
                joined_users[joined_user_id] = joined_user
                joined_user_owned_items[joined_user_id] = set(_owned_store_items_for_user(conn, joined_user_id))
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
                        'tournament': _serialize_tournament(refreshed_tournament, current_user_owned_items),
                        'user': _safe_user(user, conn),
                    }
                )

            current_user_cashback = 0.0
            for joined_user_id in joined_user_ids:
                cur.execute('UPDATE users SET balance = balance - %s WHERE id = %s', (entry_fee, joined_user_id))
                joined_user_perks = _store_perks_from_owned_items(joined_user_owned_items.get(joined_user_id, set()))
                cashback_amount = round(entry_fee * float(joined_user_perks.get('tournamentCashbackRate') or 0), 2)
                if cashback_amount > 0:
                    cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (cashback_amount, joined_user_id))
                    if joined_user_id == int(user['id']):
                        current_user_cashback = cashback_amount

            cur.execute(
                'UPDATE tournament_joins SET paid_amount=%s WHERE tournament_id=%s AND paid_amount=0',
                (entry_fee, tournament_id),
            )
            # Tournament entry no longer feeds a season-points recompute here —
            # points for this tournament are awarded per-match once results
            # come in (see _persist_completed_live_race / race_category='tournament').
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
        if current_user_cashback > 0:
            message += f' Your Tournament Cashback Pass returned KES {current_user_cashback:.2f} to your wallet.'
        return jsonify(
            {
                'success': True,
                'matched': True,
                'message': message,
                'tournament': _serialize_tournament(updated_tournament, current_user_owned_items),
                'user': _safe_user(updated_user, conn),
            }
        )
    finally:
        _return_connection(conn)


@app.get('/api/season/snapshots')
def season_snapshots():
    """Return archived standings for past seasons, newest first."""
    season = request.args.get('season', '').strip()  # optional filter
    conn = get_connection()
    try:
        _ensure_season_reset(conn)
        with conn.cursor() as cur:
            _ensure_season_tables(cur)
            if season:
                cur.execute(
                    """
                    SELECT * FROM season_snapshots
                    WHERE season_name = %s
                    ORDER BY rank_position ASC
                    """,
                    (season,),
                )
            else:
                cur.execute(
                    """
                    SELECT * FROM season_snapshots
                    ORDER BY snapshotted_at DESC, rank_position ASC
                    LIMIT 500
                    """
                )
            rows = cur.fetchall()
        data = [
            {
                'seasonName':    row['season_name'],
                'userId':        row['user_id'],
                'username':      row['username'],
                'seasonPoints':  row['season_points'],
                'tier':          row['tier'],
                'rank':          row['rank_position'],
                'snapshottedAt': row['snapshotted_at'].isoformat() + 'Z' if row.get('snapshotted_at') else None,
            }
            for row in rows
        ]
        return jsonify(data)
    finally:
        _return_connection(conn)


@app.get('/api/leaderboard')
def leaderboard():
    limit_raw = request.args.get('limit', '100')
    try:
        limit = max(1, min(500, int(limit_raw)))
    except ValueError:
        limit = 100

    cache_key = f'leaderboard:{limit}'
    now_ms = int(time.time() * 1000)
    with _leaderboard_cache_lock:
        if (
            _leaderboard_cache.get('key') == cache_key
            and _leaderboard_cache.get('expires_at', 0) > now_ms
            and _leaderboard_cache.get('payload') is not None
        ):
            return jsonify(_leaderboard_cache['payload'])

    conn = get_connection()
    try:
        _ensure_season_reset(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.*,
                    COALESCE(rh.live_races, 0) AS live_races,
                    COALESCE(rh.live_earnings, 0) AS live_earnings,
                    COALESCE(tj.tournament_entries, 0) AS tournament_entries,
                    COALESCE(pp.tournament_payouts, 0) AS tournament_payouts
                FROM users u
                LEFT JOIN (
                    SELECT user_id, COUNT(*) AS live_races, COALESCE(SUM(earnings), 0) AS live_earnings
                    FROM race_history
                    GROUP BY user_id
                ) rh ON rh.user_id = u.id
                LEFT JOIN (
                    SELECT user_id, COUNT(*) AS tournament_entries
                    FROM tournament_joins
                    WHERE paid_amount > 0
                    GROUP BY user_id
                ) tj ON tj.user_id = u.id
                LEFT JOIN (
                    SELECT user_id, COALESCE(SUM(amount), 0) AS tournament_payouts
                    FROM prize_payouts
                    WHERE status = 'completed' AND tournament_id IS NOT NULL
                    GROUP BY user_id
                ) pp ON pp.user_id = u.id
                -- Tiebreak on this season's wins first (season_wins), not
                -- lifetime career stats — two players tied on season points
                -- should be separated by how they did *this season*. Lifetime
                -- wins/wpm are kept only as a last-resort tiebreak for the
                -- (very rare) case for perfectly tied season stats.
                ORDER BY u.season_points_stored DESC, u.season_wins DESC, u.wins DESC, u.wpm DESC
                LIMIT %s
                """,
                (limit,),
            )
            users = cur.fetchall()

        owned_by_user = _owned_store_items_for_users(conn, [int(u.get('id') or 0) for u in users])
        # Load tier thresholds once for the whole board instead of once per
        # row — this was previously opening a new DB connection per user.
        tier_thresholds = _load_site_settings().get('leaderboardTiers', _default_leaderboard_tiers())
        board = []
        for idx, user in enumerate(users, start=1):
            user_with_rank = dict(user)
            user_with_rank['_season_rank'] = idx
            row = _safe_user_with_owned_items(
                user_with_rank,
                owned_by_user.get(int(user.get('id') or 0), []),
                tier_thresholds,
            )
            row['tournamentEntries'] = int(user.get('tournament_entries') or 0)
            row['tournamentPayouts'] = float(user.get('tournament_payouts') or 0)
            row['liveRaces'] = int(user.get('live_races') or 0)
            row['liveEarnings'] = float(user.get('live_earnings') or 0)
            row['seasonPoints'] = int(user.get('season_points_stored') or 0)
            row['rank'] = idx
            row['weeklyRank'] = idx
            board.append(row)

        with _leaderboard_cache_lock:
            _leaderboard_cache.update(
                {
                    'key': cache_key,
                    'expires_at': int(time.time() * 1000) + LEADERBOARD_CACHE_TTL_MS,
                    'payload': board,
                }
            )
        return jsonify(board)
    finally:
        _return_connection(conn)



# â”€â”€ Chat & Presence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _ensure_chat_tables(cur) -> None:
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS user_presence (
            user_id INT PRIMARY KEY,
            last_seen DATETIME NOT NULL,
            CONSTRAINT fk_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )
    cur.execute(
        '''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sender_id INT NOT NULL,
            recipient_id INT NOT NULL,
            body TEXT NOT NULL,
            sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME NULL,
            KEY idx_chat_thread (sender_id, recipient_id),
            KEY idx_chat_recipient (recipient_id),
            CONSTRAINT fk_chat_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_chat_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        '''
    )


@app.post('/api/presence/ping')
def presence_ping():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        with conn.cursor() as cur:
            cur.execute(
                '''
                INSERT INTO user_presence (user_id, last_seen)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen)
                ''',
                (int(user['id']), _now_db()),
            )
        conn.commit()
        return jsonify({'ok': True})
    finally:
        _return_connection(conn)


@app.get('/api/presence/online')
def presence_online():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        cutoff = (datetime.utcnow() - timedelta(seconds=45)).strftime('%Y-%m-%d %H:%M:%S')
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT u.id, u.username, u.wpm, p.last_seen
                FROM user_presence p
                JOIN users u ON u.id = p.user_id
                WHERE p.last_seen >= %s
                ORDER BY u.username ASC
                ''',
                (cutoff,),
            )
            rows = cur.fetchall()
        online = [
            {
                'id': row['id'],
                'username': row['username'],
                'wpm': float(row['wpm'] or 0),
                'lastSeen': row['last_seen'].isoformat() + 'Z' if row.get('last_seen') else None,
                'isMe': int(row['id']) == int(user['id']),
            }
            for row in rows
        ]
        return jsonify(online)
    finally:
        _return_connection(conn)


@app.get('/api/chat/contacts')
def chat_contacts():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        me = int(user['id'])
        search = str(request.args.get('search') or '').strip()
        contacts = _fetch_chat_contacts(conn, me, search=search)
        return jsonify(contacts)
    finally:
        _return_connection(conn)


def _serialize_chat_message_row(row: Dict[str, Any], me: int) -> Dict[str, Any]:
    return {
        'id': row['id'],
        'senderId': row['sender_id'],
        'recipientId': row['recipient_id'],
        'body': row['body'],
        'sentAt': row['sent_at'].isoformat() + 'Z' if row.get('sent_at') else None,
        'read': row['read_at'] is not None,
        'mine': int(row['sender_id']) == me,
    }


def _serialize_chat_contact_row(user_row: Dict[str, Any], *, unread_count: int = 0, is_online: bool = False, last_seen=None, last_message_at: Optional[str] = None) -> Dict[str, Any]:
    return {
        'id': int(user_row['id']),
        'username': user_row.get('username'),
        'wpm': float(user_row.get('wpm') or 0),
        'lastSeen': last_seen,
        'lastMessageAt': last_message_at,
        'isOnline': bool(is_online),
        'unreadCount': int(unread_count or 0),
        'isMe': False,
    }


def _fetch_chat_unread_counts(conn, me: int) -> Dict[int, int]:
    with conn.cursor() as cur:
        cur.execute(
            '''
            SELECT sender_id, COUNT(*) AS cnt
            FROM chat_messages
            WHERE recipient_id = %s AND read_at IS NULL
            GROUP BY sender_id
            ''',
            (me,),
        )
        rows = cur.fetchall()
    return {int(row['sender_id']): int(row['cnt']) for row in rows}


def _fetch_chat_contacts(
    conn,
    me: int,
    *,
    unread_by_sender: Optional[Dict[int, int]] = None,
    search: str = '',
) -> list[Dict[str, Any]]:
    cutoff_dt = datetime.utcnow() - timedelta(seconds=45)
    cutoff = cutoff_dt.strftime('%Y-%m-%d %H:%M:%S')
    with conn.cursor() as cur:
        cur.execute(
            '''
            SELECT u.id, u.username, u.wpm, p.last_seen
            FROM user_presence p
            JOIN users u ON u.id = p.user_id
            WHERE p.user_id <> %s AND p.last_seen >= %s
            ORDER BY p.last_seen DESC, u.username ASC
            ''',
            (me, cutoff),
        )
        online_rows = cur.fetchall()

        cur.execute(
            '''
            SELECT partner_id, MAX(sent_at) AS last_message_at
            FROM (
                SELECT recipient_id AS partner_id, sent_at
                FROM chat_messages
                WHERE sender_id = %s
                UNION ALL
                SELECT sender_id AS partner_id, sent_at
                FROM chat_messages
                WHERE recipient_id = %s
            ) recent_threads
            GROUP BY partner_id
            ORDER BY last_message_at DESC
            LIMIT 50
            ''',
            (me, me),
        )
        recent_rows = cur.fetchall()

    unread_by_sender = unread_by_sender or _fetch_chat_unread_counts(conn, me)
    contacts_by_id: Dict[int, Dict[str, Any]] = {}

    for row in online_rows:
        user_id = int(row['id'])
        contacts_by_id[user_id] = {
            'id': user_id,
            'username': row['username'],
            'wpm': float(row['wpm'] or 0),
            'lastSeen': row['last_seen'].isoformat() + 'Z' if row.get('last_seen') else None,
            'lastMessageAt': None,
            'isOnline': bool(row.get('last_seen') and row['last_seen'] >= cutoff_dt),
            'unreadCount': unread_by_sender.get(user_id, 0),
            'isMe': False,
        }

    normalized_search = str(search or '').strip()
    if normalized_search:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT u.id, u.username, u.wpm, p.last_seen
                FROM users u
                LEFT JOIN user_presence p ON p.user_id = u.id
                WHERE u.id <> %s AND u.username LIKE %s
                ORDER BY u.username ASC
                LIMIT 50
                ''',
                (me, f'%{normalized_search}%'),
            )
            search_rows = cur.fetchall()
        for row in search_rows:
            user_id = int(row['id'])
            if user_id in contacts_by_id:
                continue
            last_seen = row.get('last_seen')
            contacts_by_id[user_id] = {
                'id': user_id,
                'username': row['username'],
                'wpm': float(row['wpm'] or 0),
                'lastSeen': last_seen.isoformat() + 'Z' if last_seen else None,
                'lastMessageAt': None,
                'isOnline': bool(last_seen and last_seen >= cutoff_dt),
                'unreadCount': unread_by_sender.get(user_id, 0),
                'isMe': False,
            }

    if recent_rows:
        partner_ids = [int(row['partner_id']) for row in recent_rows if row.get('partner_id')]
        if partner_ids:
            placeholders = ', '.join(['%s'] * len(partner_ids))
            with conn.cursor() as cur:
                cur.execute(
                    f'''
                    SELECT id, username, wpm
                    FROM users
                    WHERE id IN ({placeholders})
                    ''',
                    tuple(partner_ids),
                )
                user_rows = cur.fetchall()
            users_by_id = {int(row['id']): row for row in user_rows}
            for row in recent_rows:
                partner_id = int(row['partner_id'])
                partner = users_by_id.get(partner_id)
                if not partner:
                    continue
                last_message_at = row.get('last_message_at')
                existing = contacts_by_id.get(partner_id)
                if existing:
                    existing['lastMessageAt'] = last_message_at.isoformat() + 'Z' if last_message_at else existing.get('lastMessageAt')
                    existing['unreadCount'] = unread_by_sender.get(partner_id, existing.get('unreadCount', 0))
                    continue
                contacts_by_id[partner_id] = {
                    'id': partner_id,
                    'username': partner['username'],
                    'wpm': float(partner['wpm'] or 0),
                    'lastSeen': None,
                    'lastMessageAt': last_message_at.isoformat() + 'Z' if last_message_at else None,
                    'isOnline': False,
                    'unreadCount': unread_by_sender.get(partner_id, 0),
                    'isMe': False,
                }

    contacts = sorted(
        contacts_by_id.values(),
        key=lambda row: (
            -int(row.get('unreadCount') or 0),
            -int(bool(row.get('isOnline'))),
            -(int(datetime.fromisoformat((row.get('lastMessageAt') or '').replace('Z', '+00:00')).timestamp()) if row.get('lastMessageAt') else 0),
            str(row.get('username') or '').lower(),
        ),
    )
    return contacts


def _fetch_chat_state(conn, me: int) -> tuple[list[Dict[str, Any]], Dict[int, int]]:
    unread_by_sender = _fetch_chat_unread_counts(conn, me)
    return _fetch_chat_contacts(conn, me, unread_by_sender=unread_by_sender), unread_by_sender


def _load_user_by_id(cur, user_id: int) -> Optional[Dict[str, Any]]:
    cur.execute('SELECT * FROM users WHERE id = %s', (user_id,))
    return cur.fetchone()


def _load_user_by_token(cur, token: str) -> Optional[Dict[str, Any]]:
    cur.execute('SELECT * FROM users WHERE auth_token = %s', (token,))
    return cur.fetchone()


def _mark_thread_read(cur, other_user_id: int, me: int) -> None:
    cur.execute(
        '''
        UPDATE chat_messages
        SET read_at = %s
        WHERE sender_id = %s AND recipient_id = %s AND read_at IS NULL
        ''',
        (_now_db(), other_user_id, me),
    )


def _fetch_thread_messages(conn, me: int, other_user_id: int, *, limit: int = 200, mark_read: bool = True) -> list[Dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            '''
            SELECT id, sender_id, recipient_id, body, sent_at, read_at
            FROM chat_messages
            WHERE (sender_id = %s AND recipient_id = %s)
               OR (sender_id = %s AND recipient_id = %s)
            ORDER BY sent_at ASC
            LIMIT %s
            ''',
            (me, other_user_id, other_user_id, me, int(limit)),
        )
        rows = cur.fetchall()
        if mark_read:
            _mark_thread_read(cur, other_user_id, me)
    if mark_read:
        conn.commit()
    return [_serialize_chat_message_row(row, me) for row in rows]


def _create_chat_message(
    conn,
    sender: Dict[str, Any],
    recipient_id: int,
    body: str,
    *,
    client_msg_id: Optional[str] = None,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    me = int(sender['id'])
    normalized_body = str(body or '').strip()
    if not normalized_body:
        raise ValueError('Message body is required.')
    if len(normalized_body) > 1000:
        raise ValueError('Message too long (max 1000 chars).')
    if me == recipient_id:
        raise ValueError('Cannot message yourself.')

    with conn.cursor() as cur:
        recipient = _load_user_by_id(cur, recipient_id)
        if not recipient:
            raise LookupError('Recipient not found.')
        cur.execute(
            'INSERT INTO chat_messages (sender_id, recipient_id, body, sent_at) VALUES (%s, %s, %s, %s)',
            (me, recipient_id, normalized_body, _now_db()),
        )
        msg_id = cur.lastrowid
        cur.execute(
            '''
            SELECT id, sender_id, recipient_id, body, sent_at, read_at
            FROM chat_messages
            WHERE id = %s
            ''',
            (msg_id,),
        )
        row = cur.fetchone()
    conn.commit()
    message = _serialize_chat_message_row(row, me)
    if client_msg_id:
        message['clientMsgId'] = str(client_msg_id)
    return message, recipient


@app.get('/api/chat/messages/<int:other_user_id>')
def chat_get_messages(other_user_id: int):
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        me = int(user['id'])
        messages = _fetch_thread_messages(conn, me, other_user_id, limit=200, mark_read=True)
        return jsonify(messages)
    finally:
        _return_connection(conn)


# â”€â”€ Socket.IO chat state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Socket.IO is the single real-time transport for chat. The old raw
# /ws/chat WebSocket route, the long-poll (Condition-variable) fallback,
# and the DB-table event relay used for cross-process fan-out have all
# been removed: they were unused by the frontend and, with the app
# running as a single gunicorn worker, the relay was a no-op anyway.
#
# If this ever needs to run across multiple workers/instances, use
# flask-socketio's built-in Redis message queue instead of reinventing
# one: SocketIO(app, message_queue='redis://...'). That gives you
# cross-process pub/sub for free with no extra polling loop or table.
import threading as _threading

_chat_socket_users: dict[str, int] = {}
_chat_socket_lock = _threading.Lock()


def _emit_socket_payload(user_id: int, event_type: str, payload: Dict[str, Any]) -> None:
    socketio.emit(event_type, payload, to=f'user:{int(user_id)}')


def _push_chat_message_to_clients(message: Dict[str, Any], sender: Dict[str, Any], recipient: Dict[str, Any]) -> None:
    sender_id = int(sender['id'])
    recipient_id = int(recipient['id'])
    sent_at = message.get('sentAt')
    sender_contact = _serialize_chat_contact_row(
        sender,
        is_online=True,
        unread_count=1,
        last_message_at=sent_at,
    )
    recipient_contact = _serialize_chat_contact_row(
        recipient,
        is_online=True,
        unread_count=0,
        last_message_at=sent_at,
    )
    _emit_socket_payload(
        recipient_id,
        'chat_message',
        {
            'type': 'chat_message',
            'message': {**message, 'mine': False},
            'contact': sender_contact,
        },
    )
    _emit_socket_payload(
        sender_id,
        'chat_message',
        {
            'type': 'chat_message',
            'message': {**message, 'mine': True},
            'contact': recipient_contact,
        },
    )


def _socketio_chat_user() -> Optional[Dict[str, Any]]:
    with _chat_socket_lock:
        user_id = _chat_socket_users.get(str(request.sid))
    if not user_id:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            return _load_user_by_id(cur, user_id)
    finally:
        _return_connection(conn)


@socketio.on('connect')
def socketio_chat_connect(auth=None):
    auth = auth if isinstance(auth, dict) else {}
    token = str(auth.get('token') or request.args.get('token') or '').strip()
    if not token:
        return False
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            user = _load_user_by_token(cur, token)
    finally:
        _return_connection(conn)
    if not user:
        return False
    user_id = int(user['id'])
    with _chat_socket_lock:
        _chat_socket_users[str(request.sid)] = user_id
    join_room(f'user:{user_id}')
    emit('connected', {'type': 'connected', 'userId': user_id})
    return True


@socketio.on('disconnect')
def socketio_chat_disconnect():
    with _chat_socket_lock:
        _chat_socket_users.pop(str(request.sid), None)


@socketio.on('ping')
def socketio_chat_ping():
    emit('pong', {'type': 'pong', 'ts': _now_iso()})


@socketio.on('sync_state')
def socketio_chat_sync_state():
    user = _socketio_chat_user()
    if not user:
        return
    conn = get_connection()
    try:
        contacts, unread = _fetch_chat_state(conn, int(user['id']))
    finally:
        _return_connection(conn)
    emit('chat_state', {
        'type': 'chat_state',
        'contacts': contacts,
        'unread': unread,
        'userId': int(user['id']),
        'ts': _now_iso(),
    })


@socketio.on('load_thread')
def socketio_chat_load_thread(payload=None):
    user = _socketio_chat_user()
    payload = payload if isinstance(payload, dict) else {}
    if not user:
        return
    try:
        partner_id = int(payload.get('partnerId'))
    except (TypeError, ValueError):
        emit('error', {'type': 'error', 'message': 'Valid partnerId is required.'})
        return
    conn = get_connection()
    try:
        messages = _fetch_thread_messages(conn, int(user['id']), partner_id, limit=200, mark_read=True)
    finally:
        _return_connection(conn)
    _emit_socket_payload(partner_id, 'chat_read', {
        'type': 'chat_read',
        'partnerId': int(user['id']),
        'readerId': int(user['id']),
        'ts': _now_iso(),
    })
    emit('chat_thread', {
        'type': 'chat_thread',
        'partnerId': partner_id,
        'messages': messages,
        'ts': _now_iso(),
    })


@socketio.on('mark_read')
def socketio_chat_mark_read(payload=None):
    user = _socketio_chat_user()
    payload = payload if isinstance(payload, dict) else {}
    if not user:
        return
    try:
        partner_id = int(payload.get('partnerId'))
    except (TypeError, ValueError):
        emit('error', {'type': 'error', 'message': 'Valid partnerId is required.'})
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            _mark_thread_read(cur, partner_id, int(user['id']))
        conn.commit()
    finally:
        _return_connection(conn)
    _emit_socket_payload(partner_id, 'chat_read', {
        'type': 'chat_read',
        'partnerId': int(user['id']),
        'readerId': int(user['id']),
        'ts': _now_iso(),
    })


@socketio.on('message')
def socketio_chat_message(payload=None):
    user = _socketio_chat_user()
    payload = payload if isinstance(payload, dict) else {}
    if not user:
        return
    try:
        recipient_id = int(payload.get('recipientId'))
    except (TypeError, ValueError):
        emit('error', {'type': 'error', 'message': 'Valid recipientId is required.'})
        return
    conn = get_connection()
    try:
        try:
            message, recipient = _create_chat_message(
                conn,
                user,
                recipient_id,
                str(payload.get('body') or ''),
                client_msg_id=str(payload.get('clientMsgId') or '').strip() or None,
            )
        except (ValueError, LookupError) as exc:
            emit('error', {'type': 'error', 'message': str(exc)})
            return
    finally:
        _return_connection(conn)
    _push_chat_message_to_clients(message, user, recipient)


@app.post('/api/chat/messages')
def chat_send_message():
    payload = request.get_json(silent=True) or {}
    recipient_id = payload.get('recipientId')
    body = str(payload.get('body') or '').strip()
    client_msg_id = str(payload.get('clientMsgId') or '').strip()

    try:
        recipient_id_int = int(recipient_id)
    except (TypeError, ValueError):
        return jsonify({'message': 'Valid recipientId is required.'}), 400

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        try:
            msg_payload, recipient = _create_chat_message(
                conn,
                user,
                recipient_id_int,
                body,
                client_msg_id=client_msg_id or None,
            )
        except ValueError as exc:
            return jsonify({'message': str(exc)}), 400
        except LookupError as exc:
            return jsonify({'message': str(exc)}), 404
        _push_chat_message_to_clients(msg_payload, user, recipient)
        return jsonify(msg_payload), 201
    finally:
        _return_connection(conn)


@app.get('/api/chat/unread')
def chat_unread_counts():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        me = int(user['id'])
        counts = _fetch_chat_unread_counts(conn, me)
        return jsonify(counts)
    finally:
        _return_connection(conn)


@app.post('/api/races/submit')
def submit_race():
    payload = request.get_json(silent=True) or {}
    try:
        wpm = float(payload.get('wpm', 0))
        accuracy = float(payload.get('accuracy', 0))
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid race payload'}), 400

    if not math.isfinite(wpm) or not math.isfinite(accuracy) or wpm < 0 or wpm > 300 or accuracy < 0 or accuracy > 100:
        return jsonify({'message': 'WPM must be between 0 and 300 and accuracy between 0 and 100.'}), 400

    duration = payload.get('duration')

    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401


        race_code = str(payload.get('id') or f"solo_{user['id']}_{int(datetime.utcnow().timestamp() * 1000)}").strip()
        with conn.cursor() as cur:
            cur.execute('SELECT id FROM race_history WHERE race_code=%s AND user_id=%s LIMIT 1', (race_code, user['id']))
            if cur.fetchone():
                return jsonify({'message': 'This race result has already been submitted.'}), 409

        # Solo practice has no opponent, so it is never a competitive "win" —
        # that's reserved for real multiplayer results (see
        # _persist_completed_live_race / did_win=user_id==winner_user_id).
        # We still track whether the player beat their own rolling average,
        # purely as a "personal best this run" signal for the response/UI —
        # it does NOT feed into users.wins or race_history.place_position,
        # which the live-race path also aggregates from. Previously this
        # endpoint wrote its own place_position (1/2) into race_history and
        # recomputed wpm/accuracy with a different formula than live races,
        # so playing both modes corrupted the shared wins/wpm/accuracy stats
        # that the leaderboard sorts and season points are built from.
        beat_own_average = wpm >= float(user.get('wpm') or 0)
        earnings = int(max(50, round(wpm * 3)))
        now_dt = datetime.utcnow()

        with conn.cursor() as cur:
            updated_user = _apply_user_performance_update(
                cur,
                user_id=user['id'],
                username=user['username'],
                race_code=race_code,
                wpm=wpm,
                accuracy=accuracy,
                duration=duration,
                earnings=earnings,
                did_win=False,
                race_category='practice',
            )
            # Solo earnings still credit the player's balance directly here;
            # _apply_user_performance_update intentionally doesn't touch
            # balance since live races pay out prizes separately.
            cur.execute('UPDATE users SET balance = balance + %s WHERE id = %s', (earnings, user['id']))

        conn.commit()

        updated_user = updated_user or {}
        return jsonify(
            {
                'id': race_code,
                'userId': user['id'],
                'username': user['username'],
                'wpm': round(wpm, 1),
                'accuracy': round(accuracy, 1),
                'duration': duration,
                # Kept for backward compatibility with any client reading
                # this field, but it's presentational only now — it no
                # longer drives win-counting.
                'place': 1 if beat_own_average else 2,
                'personalBest': beat_own_average,
                'earnings': earnings,
                'timestamp': now_dt.isoformat() + 'Z',
                'coachTip': _coach_tip_for_user(
                    {
                        'wpm': updated_user.get('wpm', wpm),
                        'accuracy': updated_user.get('accuracy', accuracy),
                        'wins': updated_user.get('wins', user.get('wins')),
                    }
                ),
            }
        ), 201
    finally:
        _return_connection(conn)


@app.get('/api/users/<int:user_id>/races')
def user_races(user_id: int):
    conn = get_connection()
    try:
        auth_user = _get_user_from_header(conn)
        if not auth_user or int(auth_user['id']) != user_id:
            return jsonify({'message': 'Unauthorized'}), 401

        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT race_code, user_id, username, wpm, accuracy, duration, place_position, earnings, race_timestamp, race_category, points_delta
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
                'raceCategory': row.get('race_category') or 'versus',
                'seasonPointsDelta': int(row.get('points_delta') or 0),
            }
            for row in rows
        ]
        return jsonify(data)
    finally:
        _return_connection(conn)


@app.put('/api/users/<int:user_id>')
def update_user(user_id: int):
    payload = request.get_json(silent=True) or {}
    conn = get_connection()
    try:
        auth_user = _get_user_from_header(conn)
        if not auth_user or int(auth_user['id']) != user_id:
            return jsonify({'message': 'Unauthorized'}), 401

        with conn.cursor() as cur:
            cur.execute('SELECT * FROM users WHERE id=%s', (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({'message': 'User not found'}), 404

            username = payload.get('username')
            phone_number = payload.get('phoneNumber')
            if username is not None:
                normalized_username = str(username).strip()
                if not normalized_username or len(normalized_username) > 50:
                    return jsonify({'message': 'Username must be between 1 and 50 characters.'}), 400
                cur.execute('UPDATE users SET username=%s WHERE id=%s', (normalized_username, user_id))
            if phone_number is not None:
                cur.execute('UPDATE users SET phone_number=%s WHERE id=%s', (str(phone_number).strip(), user_id))

            cur.execute('SELECT * FROM users WHERE id=%s', (user_id,))
            updated = cur.fetchone()
        conn.commit()
        return jsonify(_safe_user(updated))
    finally:
        _return_connection(conn)

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
    return jsonify({'message': f'Database unavailable: {exc}'}), 503


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    if isinstance(exc, HTTPException):
        return exc
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


def _bootstrap_db() -> None:
    """Create all required tables and columns once at startup."""
    try:
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                _ensure_chat_tables(cur)
                _ensure_live_race_rooms_table(cur)
                _ensure_typing_content_table(cur)
                _ensure_store_purchase_table(cur)
                _ensure_marketplace_revenue_table(cur)
                _ensure_admin_wallet_transactions_table(cur)
                _ensure_auth_token_column(cur)
                _ensure_user_equipped_columns(cur)
                _ensure_season_tables(cur)
                _ensure_race_history_audit_columns(cur)
                _backfill_legacy_race_history(cur)
            conn.commit()
        finally:
            _return_connection(conn)
    except Exception as exc:  # noqa: BLE001
        app.logger.warning('Bootstrap DB warning (non-fatal): %s', exc)


if __name__ == '__main__':
    _bootstrap_db()
    socketio.run(app, host=APP_HOST, port=APP_PORT, debug=False)
