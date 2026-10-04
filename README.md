# TypeArena

TypeArena is a React frontend plus a Flask backend. The recommended free deployment is:

- frontend on Netlify
- backend API on Render

## Local checks

Frontend build:

```powershell
npm.cmd run build
```

Backend compile check:

```powershell
python -m py_compile app_backend.py foundation_features.py school_features.py app_loader.py wsgi.py passenger_wsgi.py
python -m unittest tests.test_foundation_features
```

## School mode

Signed-in users can create an organisation, create classes, and invite teachers from **School**. Organisation admins can set whether learner class-code joins require staff approval, manage organisation roles, and remove members. Teachers and admins can review class progress, approve or suspend learners, create assignments, and start class-only private races. Platform admins can inspect organisations and enable or disable organisations and classes in the admin panel.

Learners can join with a class code or accept an invitation after signing in with the invited email address. CSV imports immediately add existing accounts and create pending invitations for unknown emails; recipients must create their own TypeArena account before accepting. Invitation emails are not sent automatically.

Assignment races submit results on completion. Learners can view current status and attempt history in School mode. Certificates and advanced analytics are not part of this release.

## Phase 0 foundation

The backend bootstraps account roles/plans, subscription payments, and race-stat schema at startup. Global account roles (`free`, `pro`, `employer`, `admin`) remain separate from organisation-scoped teacher/student membership. The configured platform-admin email controls the `admin` role; only platform admins can assign `employer`.

Daraja subscription checkout uses its own payment and callback flow and never credits wallet balance. Configure `MPESA_SUBSCRIPTION_CALLBACK_URL` as the public HTTPS URL ending in `/api/mpesa/callback/subscription`, along with the standard Daraja credentials. The monetization layer now supports a monthly + annual Pro pass. The default plan keys are `pro_monthly` and `pro_annual`, with the legacy `pro` alias still accepted for compatibility. The full Pro package includes no ads, private rooms, custom race lengths, custom text, advanced analytics, and a Pro badge. Platform admins can configure and activate a plan through `PUT /api/admin/subscription-plans/<planKey>` with `amount`, `billingPeriodDays`, and `active`. The amount must be a whole KES value and the billing period is expressed in days. Until configured and activated, checkout returns a clear unavailable response. Purchases are confirmed by the server callback, checked against the recorded checkout and amount, and processed once; renewals currently require another user-initiated STK Push.

Authenticated clients can read `GET /api/entitlements`, `GET /api/subscriptions/current`, and `GET /api/subscription-payments/<transactionId>`. `POST /api/subscriptions/pro/checkout` starts checkout with a `phoneNumber`. Public `GET /api/subscription-plans` lists plans available for purchase. Role and entitlement resolution is centralized in `foundation_features.py`; Pro access requires a currently active subscription.

Every verified solo or live race now stores WPM, accuracy, timestamp, and a server-derived per-key error map with its history row. Legacy submissions without replayable typed text retain an empty per-key error map.

## Progression foundation

Every server-recorded race awards XP once, with an optional all-time WPM personal-best bonus. The initial defaults are 50 XP per race, 25 for a personal best, 50 at a 3-day streak, and 150 at a 7-day streak; platform admins can read or update these amounts through `GET`/`PUT /api/admin/progression/rewards`. XP, levels, daily streaks, streak-freeze balances, and both transaction ledgers are stored server-side. Levels follow the increasing threshold curve (500 XP for level 2, 1,100 for level 3, 1,800 for level 4); players receive a freeze at each fifth level, up to three stored freezes. Streak dates use `Africa/Nairobi`; missed days are automatically covered only when the balance can cover the full gap.

Authenticated clients can read progression with `GET /api/progression`, read recent XP/freeze ledger entries with `GET /api/progression/history`, and safely retry an award for their own recorded race with `POST /api/progression/races/<raceCode>/award`. Race completion awards are also applied automatically by the shared race persistence path. Paid/ad-earned freezes, XP boosts, cosmetics, and progression UI are not included in this backend foundation phase.

## Verified typing certificates

The certification assessment uses the current passage configured by platform admins in Admin Panel → Content → Certification Test Passage. An attempt pins that exact passage and uses it for the three-minute test, even if an admin later edits the configured text. An attempt requires a signed-in account, is limited to one start every 30 days, and is scored on the server; passing requires at least 40 WPM, 95% accuracy, and 600 typed characters. Copy/paste, passage changes, missing telemetry, window switching, and other anti-cheat signals are recorded; flagged attempts do not issue certificates unless a platform admin approves them after review. Public verification uses `GET /api/certificates/verify/<certificateId>` and exposes only the certificate ID, player display name, WPM, accuracy, test date, and validity statement. The test UI is available at `/certification`; certificate verification pages are at `/verify/<certificateId>`. Payment and downloadable PDF/QR generation are deferred.

## Sponsored tournaments

Platform admins can create and manage sponsor-funded, free-entry tournaments in Admin Panel → Sponsor Events. Each event includes sponsor branding, its schedule, eligibility and rules, top-three prize details, and manually recorded pledged/received funding. Only signed-in players can enter after accepting the current event rules. Sponsored event races have a 90-second maximum; players may finish the passage or press Finish to end early. Only verified attempts on a signed 90-second event race with at least 95% accuracy qualify, and their WPM uses actual elapsed time. Each player's event points are their single best qualifying WPM, not a sum across attempts. Ties go to the player who first achieved that best score. Admins finalize the podium after the event and review/record prize payments manually; TypeArena does not automatically pay prizes. Participants can dispute results for seven days after close. Sponsor reports contain aggregate participant, race, page-view, results-view, and sponsor-impression counts; no individual participant data is included in that report.

Backend health check:

```powershell
python wsgi.py
```

Then open `http://127.0.0.1:3001/api/health`.

## Deployment notes

- The Flask app is loaded through `wsgi.py` or `passenger_wsgi.py`.
- The backend now reads `HOST` and `PORT` from the environment, so it can run on hosts that assign a dynamic port.
- `public/.htaccess` is included for Apache-style hosting so frontend routes work while `/api/...` stays available to the backend.

## Free split deploy

### 1. Deploy the backend on Render

Use the included [render.yaml](/c:/Users/USER/Desktop/type/render.yaml).

Backend settings:

- `build command`: `pip install -r requirements.txt`
- `start command`: `gunicorn --workers 1 --threads 100 --timeout 120 --graceful-timeout 30 --keep-alive 5 wsgi:application`
- `health check path`: `/api/health`

Add the required backend environment variables in Render:

- `ALWAYSDATA_DB_HOST`
- `ALWAYSDATA_DB_USER`
- `ALWAYSDATA_DB_PASSWORD`
- `ALWAYSDATA_DB_NAME`
- `TYPEARENA_ADMIN_EMAIL`
- `TYPEARENA_ADMIN_PASSWORD`
- `TYPEARENA_ADMIN_TOKEN_SECRET`
- TYPEARENA_ADMIN_TOTP_SECRET (optional Base32 secret; when set, admin sign-in requires a 6-digit authenticator code)
- `TYPEARENA_ALLOWED_ORIGINS` — comma-separated frontend origins, for example
  `https://your-site.netlify.app,https://www.yourdomain.com`. Set it in the
  **Render service's Environment**; a local `.env` is not deployed to Render.
  If omitted, the backend allows public origins so Socket.IO remains available.

Keep any payment or AI variables you need there too, including public HTTPS callback and Stripe redirect URLs.

### 2. Deploy the frontend on Netlify

This repo includes [netlify.toml](/c:/Users/USER/Desktop/type/netlify.toml) for a Create React App static deploy.

Frontend settings:

- `build command`: `npm run build`
- `publish directory`: `build`

Set this frontend environment variable in Netlify:

- `REACT_APP_API_BASE_URL=https://typearena.onrender.com`

If your Render backend URL changes, update that value.

### 3. Netlify routing

`netlify.toml` already handles:

- SPA route fallback to `index.html`
- proxying `/api/*` to `https://typearena.onrender.com/api/*`

That means the frontend can stay on one origin while forwarding API requests to Render.

## Required environment variables

- `ALWAYSDATA_DB_HOST`
- `ALWAYSDATA_DB_USER`
- `ALWAYSDATA_DB_PASSWORD`
- `ALWAYSDATA_DB_NAME`
- `TYPEARENA_ADMIN_EMAIL`
- `TYPEARENA_ADMIN_PASSWORD`
- `TYPEARENA_ADMIN_TOKEN_SECRET`
- TYPEARENA_ADMIN_TOTP_SECRET (optional Base32 secret; when set, admin sign-in requires a 6-digit authenticator code)
- `TYPEARENA_ALLOWED_ORIGINS` — comma-separated frontend origins, for example
  `https://your-site.netlify.app,https://www.yourdomain.com`. Set it in the
  **Render service's Environment**; a local `.env` is not deployed to Render.
  If omitted, the backend allows public origins so Socket.IO remains available.

Use [.env.example](/c:/Users/USER/Desktop/type/.env.example) as the template for the rest of the optional settings.
