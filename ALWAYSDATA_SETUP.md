# Alwaysdata Setup

This project can run on Alwaysdata with:

- a static frontend built from React
- a Python WSGI backend served by `passenger_wsgi.py`
- a MySQL database configured through Alwaysdata environment variables

## 1. Upload the project

Upload these parts of the repo to your Alwaysdata app directory:

- `build/`
- `backend.py/`
- `passenger_wsgi.py`
- `requirements.txt`

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

## 5. Frontend hosting

The React app expects API requests under `/api`.

The included `public/.htaccess` does two things:

- keeps `/api/...` requests away from the React router
- rewrites all other unknown paths to `index.html` so routes like `/profile` and `/marketplace` work after refresh

## 6. Important note

This repo currently contains mixed Alwaysdata defaults in source from earlier work. The safest setup is to ignore those old defaults and define the real values only in Alwaysdata environment variables.
