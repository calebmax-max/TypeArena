from pathlib import Path
import importlib.util
import sys


BASE_DIR = Path(__file__).resolve().parent
APP_CANDIDATES = [
    BASE_DIR / 'app_backend.py',
    BASE_DIR / 'backend.py' / 'app.py',
    BASE_DIR / 'backend' / 'app.py',
]


def load_application():
    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))

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
