from pathlib import Path
import importlib.util


BASE_DIR = Path(__file__).resolve().parent.parent
PRIMARY_APP_PATH = BASE_DIR / 'app_backend.py'

if not PRIMARY_APP_PATH.exists():
    raise FileNotFoundError(f'Expected backend implementation at {PRIMARY_APP_PATH}')

spec = importlib.util.spec_from_file_location('typearena_root_backend_app', PRIMARY_APP_PATH)
if spec is None or spec.loader is None:
    raise ImportError(f'Unable to load backend implementation from {PRIMARY_APP_PATH}')

module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

app = module.app
application = app
