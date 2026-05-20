from app_loader import load_application


app = load_application()


if __name__ == '__main__':
    import os

    host = os.getenv('HOST', '0.0.0.0').strip() or '0.0.0.0'
    port = int(os.getenv('PORT', '3001'))
    app.run(host=host, port=port, debug=False, use_reloader=False)
