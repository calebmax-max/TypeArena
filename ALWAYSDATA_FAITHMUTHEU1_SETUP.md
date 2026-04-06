## Faithmutheu1 Alwaysdata Setup

Use these Alwaysdata details for this project:

- Site/domain: `faithmutheu1.alwaysdata.net`
- WebDAV host: `webdav-faithmutheu1.alwaysdata.net`
- MySQL host: `mysql-faithmutheu1.alwaysdata.net`
- Database name: `faithmutheu1_db`

### Files to upload

Upload these from this project to your Alwaysdata app directory:

- `build/`
- `backend.py/`
- `passenger_wsgi.py`
- `requirements.txt`

If you rebuild locally first, run:

```powershell
npm run build
```

### Python app settings in Alwaysdata

Create a Python WSGI application and set:

- App root: the directory where you uploaded the files
- Entry file: `passenger_wsgi.py`

The included WSGI loader starts the Flask app from `backend.py/app.py`.

### Environment variables

Set these in Alwaysdata:

```env
ALWAYSDATA_DB_HOST=mysql-faithmutheu1.alwaysdata.net
ALWAYSDATA_DB_USER=your_mysql_username
ALWAYSDATA_DB_PASSWORD=your_mysql_password
ALWAYSDATA_DB_NAME=faithmutheu1_db

TYPEARENA_ADMIN_EMAIL=caleb@gmail.com
TYPEARENA_ADMIN_PASSWORD=Caleb123

REACT_APP_API_URL=/api
```

Add the payment and API keys from `.env.example` only if you plan to use those features.

### Database update

After uploading and configuring environment variables, run the schema migrator:

```powershell
python backend.py/init_alwaysdata_schema.py
```

This command is safe to run on an existing live database. It will create missing tables and add missing schema pieces needed by the current website in `faithmutheu1_db`.

### Frontend routing

The built frontend already includes `.htaccess` so:

- `/api/...` stays available for backend routes
- React routes like `/profile` and `/marketplace` keep working on refresh

### Upload method

If you use WebDAV, connect with:

- Host: `webdav-faithmutheu1.alwaysdata.net`
- Username: your Alwaysdata account or WebDAV login
- Password: your Alwaysdata password

Then upload the project files into the directory used by the Python app.
