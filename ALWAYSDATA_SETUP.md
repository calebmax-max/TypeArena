# Alwaysdata Setup

This project can run on Alwaysdata with:

- a React frontend built into `build/`
- a Python WSGI backend served by `passenger_wsgi.py`
- a MySQL database configured through Alwaysdata environment variables

## 1. Upload the project

Upload these parts of the repo to your Alwaysdata app directory:

- `build/`
- `app_backend.py`
- `app_loader.py`
- `passenger_wsgi.py`
- `wsgi.py`
- `requirements.txt`
- `site_settings.json`

If you are rebuilding on your local machine before upload, use:

```bash
npm run build
```

## 2. Configure the Python app

In Alwaysdata:

1. Create a Python WSGI site/app.
2. Point the app root to this project directory.
3. Use `passenger_wsgi.py` as the entry file.
4. Install Python dependencies from `requirements.txt`.

## 3. Set environment variables

Create environment variables in Alwaysdata using `.env.example` as the template.

Minimum required values:

- `ALWAYSDATA_DB_HOST`
- `ALWAYSDATA_DB_USER`
- `ALWAYSDATA_DB_PASSWORD`
- `ALWAYSDATA_DB_NAME`
- `TYPEARENA_ADMIN_EMAIL`
- `TYPEARENA_ADMIN_PASSWORD`

Recommended for production frontend/backend on the same domain:

- `REACT_APP_API_URL=/api`

Example admin credentials used by this project setup:

- `TYPEARENA_ADMIN_EMAIL=caleb@gmail.com`
- `TYPEARENA_ADMIN_PASSWORD=Caleb123`

## 4. Initialize or update the database schema

Run the schema migrator on the same environment variables used by the app:

```bash
python backend.py/init_alwaysdata_schema.py
```

This will:

- create missing tables
- add missing columns, indexes, and foreign keys on existing tables
- normalize a few default values for older rows

It manages these tables:

- `users`
- `tournaments`
- `tournament_joins`
- `race_history`
- `mpesa_transactions`
- `prize_payouts`
- `store_purchases`

Chat and presence tables are also now bootstrapped automatically when the WSGI app starts:

- `user_presence`
- `chat_messages`

## 5. Frontend hosting

The React app expects API requests under `/api`.

The included `build/.htaccess` does two things:

- keeps `/api/...` requests away from the React router
- rewrites all other unknown paths to `index.html` so routes like `/profile` and `/marketplace` work after refresh

## 6. Important note

The active backend entrypoint is `app_backend.py`. Older helper folders still exist in the repo for compatibility, but deployment should use the root files listed above.
