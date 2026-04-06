from app_loader import load_application


app = load_application()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3001, debug=True)
