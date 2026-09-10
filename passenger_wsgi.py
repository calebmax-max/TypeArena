from gevent import monkey

monkey.patch_all()

from app_loader import load_application


application = load_application()
app = application
