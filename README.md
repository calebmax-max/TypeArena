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
python -m py_compile app_backend.py app_loader.py wsgi.py passenger_wsgi.py
```

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
- `start command`: `gunicorn --worker-class gthread --threads 4 --timeout 120 --graceful-timeout 30 --keep-alive 5 wsgi:application`
- `health check path`: `/api/health`

Add the required backend environment variables in Render:

- `ALWAYSDATA_DB_HOST`
- `ALWAYSDATA_DB_USER`
- `ALWAYSDATA_DB_PASSWORD`
- `ALWAYSDATA_DB_NAME`
- `TYPEARENA_ADMIN_EMAIL`
- `TYPEARENA_ADMIN_PASSWORD`

Keep any payment or AI variables you need there too.

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

Use [.env.example](/c:/Users/USER/Desktop/type/.env.example) as the template for the rest of the optional settings.
