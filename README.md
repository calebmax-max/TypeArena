# TypeArena

TypeArena is a React frontend plus a Flask backend that can be deployed together.

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
- The React production build must exist in `build/` on the server because Flask serves the frontend from that folder.
- `public/.htaccess` is included for Apache-style hosting so frontend routes work while `/api/...` stays available to the backend.
- On Render, do not use `npm start` as the service start command. Use the included [render.yaml](/c:/Users/USER/Desktop/type/render.yaml) or set:
  `build command`: `npm install && npm run build && pip install -r requirements.txt`
  `start command`: `gunicorn wsgi:application`

## Required environment variables

- `ALWAYSDATA_DB_HOST`
- `ALWAYSDATA_DB_USER`
- `ALWAYSDATA_DB_PASSWORD`
- `ALWAYSDATA_DB_NAME`
- `TYPEARENA_ADMIN_EMAIL`
- `TYPEARENA_ADMIN_PASSWORD`

Use `.env.example` as the template for the rest of the optional settings.
