from __future__ import annotations
import os
from flask_sock import Sock
from dotenv import load_dotenv
load_dotenv()

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
from werkzeug.exceptions import HTTPException
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, static_folder=None)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
BUILD_DIR = BASE_DIR / 'build'
APP_HOST = os.getenv('HOST', '0.0.0.0').strip() or '0.0.0.0'
APP_PORT = int(os.getenv('PORT', '3001'))

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
STRIPE_SUCCESS_URL = os.getenv('STRIPE_SUCCESS_URL', 'http://localhost:3000/profile?checkout=success')
STRIPE_CANCEL_URL = os.getenv('STRIPE_CANCEL_URL', 'http://localhost:3000/profile?checkout=cancel')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET', '')

DEFAULT_ADMIN_EMAIL = 'caleb@gmail.com'
DEFAULT_ADMIN_PASSWORD = 'Caleb123'
ADMIN_EMAIL = os.getenv('TYPEARENA_ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL).strip() or DEFAULT_ADMIN_EMAIL
ADMIN_PASSWORD = os.getenv('TYPEARENA_ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD)
ADMIN_TOKENS: set[str] = set()
TOURNAMENT_MATCH_SIZE = 2
TOURNAMENT_START_DELAY_SECONDS = 30
WINNER_PRIZE_SHARE = 0.60
WITHDRAWAL_FEE = 50.0
LIVE_RACE_COUNTDOWN_SECONDS = 5
LIVE_RACE_ROOMS: dict[str, Dict[str, Any]] = {}

sock = Sock(app)
# 💡 FIX: Grant explicit permission to your React port (typically 3000)
app.config['SOCK_ALLOWED_ORIGINS'] = ['localhost:3000', 'http://localhost:3000']


def _is_admin_email(email: str) -> bool:
    normalized_email = str(email or '').strip().lower()
    return bool(normalized_email and ADMIN_EMAIL and normalized_email == ADMIN_EMAIL.lower())


def _issue_admin_token() -> str:
    token = secrets.token_urlsafe(24)
    ADMIN_TOKENS.add(token)
    return token


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


def _store_perks_from_owned_items(owned_items: list[str] | set[str] | tuple[str, ...]) -> Dict[str, Any]:
    owned = set(owned_items or [])
    season_multiplier = 1.08 if 'perk_season_booster' in owned else 1.0
    tournament_cashback_rate = 0.1 if 'perk_tournament_cashback' in owned else 0.0
    return {
        'seasonPointsMultiplier': season_multiplier,
        'tournamentCashbackRate': tournament_cashback_rate,
        'customInviteCodes': 'perk_signature_invites' in owned,
    }


def _competitive_season_points(
    user: Dict[str, Any],
    *,
    live_races: int = 0,
    tournament_entries: int = 0,
    tournament_payouts: float = 0.0,
    live_earnings: float = 0.0,
    owned_items: list[str] | set[str] | tuple[str, ...] | None = None,
) -> int:
    wpm = float(user.get('wpm') or 0)
    accuracy = float(user.get('accuracy') or 0)
    wins = int(user.get('wins') or 0)
    total_races = int(user.get('total_races') or 0)

    base_points = (wpm * 2.4) + (accuracy * 1.6) + (wins * 24) + (min(total_races, 120) * 0.5)

    consistency_bonus = 0
    if accuracy >= 98:
        consistency_bonus = 45
    elif accuracy >= 95:
        consistency_bonus = 25

    speed_bonus = 0
    if wpm >= 120:
        speed_bonus = 40
    elif wpm >= 100:
        speed_bonus = 20

    activity_points = (min(max(live_races, 0), 60) * 2) + (min(max(tournament_entries, 0), 20) * 5)
    earnings_points = min(120, round(max((tournament_payouts + live_earnings), 0.0) / 60))

    subtotal = base_points + consistency_bonus + speed_bonus + activity_points + earnings_points
    perks = _store_perks_from_owned_items(owned_items or [])
    return int(round(subtotal * float(perks.get('seasonPointsMultiplier') or 1.0)))


def _season_points_for_user(user: Dict[str, Any], owned_items: list[str] | set[str] | tuple[str, ...] | None = None) -> int:
    return _competitive_season_points(user, owned_items=owned_items)


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

    passages = AI_PASSAGE_BANK.get(pool_key) or AI_PASSAGE_BANK['standard']
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


def _generate_live_battle_passage(mode: str, language: str, is_private: bool = False) -> str:
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

    if not passages:
        fallback = _generate_passage(mode, language).get('passage')
        return fallback or LIVE_RACE_TEXTS.get(normalized_mode, LIVE_RACE_TEXTS['standard'])

    base_passage = passages[secrets.randbelow(len(passages))]
    if is_private:
        room_code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
        return f'{base_passage} Private room note: keep code {room_code} and every symbol exactly as shown.'
    return base_passage


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


def _load_site_settings() -> Dict[str, Any]:
    defaults = _default_site_marquee_settings()
    if not SITE_SETTINGS_FILE.exists():
        return defaults

    try:
        raw = json.loads(SITE_SETTINGS_FILE.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return defaults

    return {
        'items': _normalize_site_marquee_items(raw.get('siteMarqueeItems')),
    }


def _save_site_marquee_settings(items: list[str]) -> Dict[str, Any]:
    settings = {'siteMarqueeItems': _normalize_site_marquee_items(items)}
    SITE_SETTINGS_FILE.write_text(json.dumps(settings, indent=2), encoding='utf-8')
    return {'items': list(settings['siteMarqueeItems'])}


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
    stripe_ready = bool(STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET)
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


def _safe_user(user: Dict[str, Any], conn=None) -> Dict[str, Any]:
    total_races = int(user.get('total_races') or 0)
    wins = int(user.get('wins') or 0)
    owned_items = _owned_store_items_for_user(conn, int(user.get('id') or 0)) if conn else []
    perks = _store_perks_from_owned_items(owned_items)
    is_admin = _is_admin_email(user.get('email') or '')
    return {
        'id': user['id'],
        'username': user['username'],
        'email': user['email'],
        'isAdmin': is_admin,
        'phoneNumber': user.get('phone_number') or '',
        'wpm': float(user.get('wpm') or 0),
        'accuracy': float(user.get('accuracy') or 0),
        'totalRaces': total_races,
        'wins': wins,
        'balance': float(user.get('balance') or 0),
        'tier': _tier_for_user(user),
        'season': _season_name(),
        'seasonPoints': _season_points_for_user(user, owned_items),
        'premium': wins >= 10 or float(user.get('balance') or 0) >= 5000,
        'aiCoachTip': _coach_tip_for_user(user),
        'ownedStoreItems': owned_items,
        'storePerks': perks,
        'equippedItems': {
            'avatar': user.get('equipped_avatar') or '',
            'theme': user.get('equipped_theme') or '',
            'skin': user.get('equipped_skin') or '',
            'badge': user.get('equipped_badge') or '',
            'effect': user.get('equipped_effect') or '',
            'frame': user.get('equipped_frame') or '',
        },
    }


def _serialize_tournament(row: Dict[str, Any], user_owned_items: list[str] | set[str] | tuple[str, ...] | None = None) -> Dict[str, Any]:
    entry_fee = float(row.get('entry_fee') or 0)
    prize_pool = float(row.get('prize_pool') or 0)
    match_size = int(row.get('match_size') or row.get('max_participants') or TOURNAMENT_MATCH_SIZE)
    total_player_stake = round(entry_fee * match_size, 2)
    winner_share = WINNER_PRIZE_SHARE
    status = _computed_tournament_status(row)
    start_time = row.get('start_time')
    end_time = start_time + timedelta(seconds=_duration_to_seconds(row.get('duration'))) if start_time else None
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
    
    # NEW GUARD: If the room is already 'completed', we ignore the missing results
    # check and proceed to persist whatever we have collected so far.
    is_completed = str(room.get('status') or '').lower() == 'completed'
    
    if not is_completed:
        if not player_ids or any(player_id not in results for player_id in player_ids):
            return

    winner_user_id = room.get('winnerUserId')
    winner_prize = float(room.get('winnerPrize') or 0)
    
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for player in room.get('players', []):
                user_id = int(player['userId'])
                # Use .get() safely to avoid KeyErrors if a result is missing
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

    # Setup standard metric winner references (Metrics only—No money involved)
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

    room['inviteCode'] = str(room.get('inviteCode') or row.get('invite_code') or '').upper()
    room['status'] = str(room.get('status') or row.get('status') or 'waiting')
    room['isPrivate'] = bool(room.get('isPrivate') if 'isPrivate' in room else row.get('is_private'))
    return _hydrate_live_room(room)


def _save_live_room(cur, room: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_live_race_rooms_table(cur)
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


def _get_live_room(cur, room_id: str) -> Optional[Dict[str, Any]]:
    normalized = str(room_id or '').strip()
    if not normalized:
        return None

    _ensure_live_race_rooms_table(cur)
    cur.execute('SELECT * FROM live_race_rooms WHERE room_id=%s LIMIT 1', (normalized,))
    room = _load_live_room_from_row(cur.fetchone())
    if room:
        return room

    cached = LIVE_RACE_ROOMS.get(normalized)
    if cached:
        return cached
    return None


def _get_live_room_by_invite(cur, invite_code: str) -> Optional[Dict[str, Any]]:
    normalized = str(invite_code or '').strip().upper()
    if not normalized:
        return None

    _ensure_live_race_rooms_table(cur)
    cur.execute('SELECT * FROM live_race_rooms WHERE invite_code=%s LIMIT 1', (normalized,))
    room = _load_live_room_from_row(cur.fetchone())
    if room:
        return room

    cached = _find_live_room_by_invite(normalized)
    if cached:
        return cached
    return None


def _list_live_rooms(cur) -> list[Dict[str, Any]]:
    _ensure_live_race_rooms_table(cur)
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
    _ensure_live_race_rooms_table(cur)
    cur.execute('DELETE FROM live_race_rooms WHERE room_id=%s', (normalized,))
    LIVE_RACE_ROOMS.pop(normalized, None)


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
        conn.close()

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
        conn.close()


@app.post('/api/admin/wallet/topup')
def admin_wallet_topup():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    try:
        amount_value = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid amount'}), 400

    if amount_value <= 0:
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
        conn.close()


@app.post('/api/admin/wallet/withdraw')
def admin_wallet_withdraw():
    if not _is_admin_request():
        return jsonify({'message': 'Unauthorized admin request'}), 401

    payload = request.get_json(silent=True) or {}
    try:
        amount_value = float(payload.get('amount') or 0)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid amount'}), 400

    if amount_value <= 0:
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
        conn.close()


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


@app.get('/api/site-marquee')
def site_marquee_settings():
    return jsonify(_load_site_settings())


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
        safe_user = _safe_user(user, conn)
        if safe_user.get('isAdmin'):
            safe_user['adminEmail'] = ADMIN_EMAIL
            safe_user['adminToken'] = _issue_admin_token()
        return jsonify(safe_user)
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
        conn.close()


@app.post('/api/mpesa_payment')
def mpesa_payment():
    payload = request.get_json(silent=True) or request.form.to_dict() or {}

    try:
        amount_value = float(payload.get('amount'))
    except (TypeError, ValueError):
        return jsonify({'message': 'A valid amount is required.'}), 400

    if amount_value <= 0:
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
        conn.close()


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
        conn.close()


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
        conn.close()


@app.get('/api/live-races')
def list_live_races():
    user_id_raw = request.headers.get('X-User-Id')
    viewer_user_id = int(user_id_raw) if user_id_raw and user_id_raw.isdigit() else None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            rooms = sorted(
                (_serialize_live_room(room, viewer_user_id=viewer_user_id) for room in _list_live_rooms(cur)),
                key=lambda item: item.get('createdAt') or '',
                reverse=True,
            )
        return jsonify(rooms[:20])
    finally:
        conn.close()


@app.post('/api/live-races/queue')
def queue_live_race():
    payload = request.get_json(silent=True) or {}
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        user_owned_items = set(_owned_store_items_for_user(conn, int(user.get('id') or 0)))
        user_perks = _store_perks_from_owned_items(user_owned_items)
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
            _ensure_live_race_rooms_table(cur)

            if is_private and invite_code and not user_perks.get('customInviteCodes'):
                return jsonify({'message': 'Buy the Signature Invite Pass in the marketplace to create custom private room codes.'}), 400

            text = _generate_live_battle_passage(mode, language, is_private=is_private)
            player_snapshot = {
                'userId': user['id'],
                'username': user['username'],
                'progress': 0,
                'currentWpm': 0,
                'currentAccuracy': 100,
            }

            if invite_code:
                room = _get_live_room_by_invite(cur, invite_code)
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
                for room in _list_live_rooms(cur):
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
        conn.close()


@app.get('/api/live-races/<room_id>')
def get_live_race(room_id: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room(cur, room_id)
            if not room:
                return jsonify({'message': 'Live race room not found.'}), 404
            _finalize_live_room_if_expired(room)
            user_id_raw = request.headers.get('X-User-Id')
            viewer_user_id = int(user_id_raw) if user_id_raw and user_id_raw.isdigit() else None
            if viewer_user_id and viewer_user_id not in {player['userId'] for player in room.get('players', [])}:
                room['spectators'] = int(room.get('spectators') or 0) + 1
            _save_live_room(cur, room)
            conn.commit()
            return jsonify(_serialize_live_room(room, viewer_user_id=viewer_user_id))
    finally:
        conn.close()


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
            user_id_raw = request.headers.get('X-User-Id')
            viewer_user_id = int(user_id_raw) if user_id_raw and user_id_raw.isdigit() else None
            return jsonify(_serialize_live_room(room, viewer_user_id=viewer_user_id))
    finally:
        conn.close()


@app.post('/api/live-races/<room_id>/cancel')
def cancel_live_race(room_id: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room(cur, room_id)
            if not room:
                return jsonify({'message': 'Live race room not found.'}), 404
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
        conn.close()


@app.post('/api/live-races/<room_id>/heartbeat')
def update_live_race_progress(room_id: str):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room(cur, room_id)
            if not room:
                return jsonify({'message': 'Live race room not found.'}), 404
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
        payload = request.get_json(silent=True) or {}
        for player in room.get('players', []):
            if player['userId'] == user['id']:
                player['progress'] = max(0, min(100, int(payload.get('progress') or 0)))
                player['currentWpm'] = max(0, float(payload.get('currentWpm') or 0))
                player['currentAccuracy'] = max(0, min(100, float(payload.get('currentAccuracy') or 0)))
                break
        if room['status'] == 'countdown':
            room['status'] = 'racing'
        _finalize_live_room_if_expired(room)
        with conn.cursor() as cur:
            _save_live_room(cur, room)
        conn.commit()
        return jsonify(_serialize_live_room(room, viewer_user_id=user['id']))
    finally:
        conn.close()


@app.post('/api/live-races/<room_id>/submit')
def submit_live_race(room_id: str):
    payload = request.get_json(silent=True) or {}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            room = _get_live_room(cur, room_id)
            if not room:
                return jsonify({'message': 'Live race room not found.'}), 404
        user = _get_user_from_header(conn)
        if not user:
            return jsonify({'message': 'Unauthorized'}), 401
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
        with conn.cursor() as cur:
            _save_live_room(cur, room)
        conn.commit()
        return jsonify(_serialize_live_room(room, viewer_user_id=user['id']))
    finally:
        conn.close()


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
        conn.close()


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
        conn.close()


@app.get('/api/tournaments')
def get_tournaments():
    conn = get_connection()
    try:
        user = _get_user_from_header(conn)
        owned_items = set(_owned_store_items_for_user(conn, int(user.get('id') or 0))) if user else set()
        with conn.cursor() as cur:
            _sync_tournament_statuses(cur)
            rows = _fetch_all_tournaments(cur)
        conn.commit()
        return jsonify([_serialize_tournament(r, owned_items) for r in rows])
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
            owned_items = _owned_store_items_for_user(conn, int(u.get('id') or 0))
            row = _safe_user(u, conn)
            tournament_entries = int(u.get('tournament_entries') or 0)
            tournament_payouts = float(u.get('tournament_payouts') or 0)
            live_races = int(u.get('live_races') or 0)
            live_earnings = float(u.get('live_earnings') or 0)
            row['tournamentEntries'] = tournament_entries
            row['tournamentPayouts'] = tournament_payouts
            row['liveRaces'] = live_races
            row['liveEarnings'] = live_earnings
            row['seasonPoints'] = _competitive_season_points(
                u,
                live_races=live_races,
                tournament_entries=tournament_entries,
                tournament_payouts=tournament_payouts,
                live_earnings=live_earnings,
                owned_items=owned_items,
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


if __name__ == '__main__':
    app.run(host=APP_HOST, port=APP_PORT, debug=False)
