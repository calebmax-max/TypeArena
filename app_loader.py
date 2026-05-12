from pathlib import Path
import importlib.util
import os
import sys


BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / '.env'
APP_CANDIDATES = [
    BASE_DIR / 'app_backend.py',
    BASE_DIR / 'backend.py' / 'app.py',
    BASE_DIR / 'backend' / 'app.py',
]


def load_env_file():
    if not ENV_FILE.exists():
        return

    for raw_line in ENV_FILE.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue

        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value


def load_application():
    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))

    load_env_file()

    for app_path in APP_CANDIDATES:
        if not app_path.exists() or not app_path.is_file():
            continue

        spec = importlib.util.spec_from_file_location(f'typearena_backend_{app_path.stem}', app_path)
        if spec is None or spec.loader is None:
            continue

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        application = getattr(module, 'app', None) or getattr(module, 'application', None)
        if application is not None:
            return application

    checked_paths = '\n'.join(str(path) for path in APP_CANDIDATES)
    raise FileNotFoundError(f'Could not locate the backend application. Checked:\n{checked_paths}')
