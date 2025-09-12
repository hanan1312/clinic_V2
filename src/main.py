import os
import sys
from functools import wraps
# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, send_from_directory, redirect, session
from flask_cors import CORS
from src.models.user import db
from src.routes.user import user_bp
from src.routes.patient import patient_bp
from src.routes.clinic import clinic_bp
from src.routes.financial import financial_bp
from src.utils.error_handlers import register_error_handlers

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))
app.config['SECRET_KEY'] = 'asdf#FGSgvasgf$5$WGT'

# Enable CORS for all routes, supporting credentials
CORS(app, supports_credentials=True)

# Register error handlers
register_error_handlers(app)

app.register_blueprint(user_bp, url_prefix='/api')
app.register_blueprint(patient_bp, url_prefix='/api')
app.register_blueprint(clinic_bp, url_prefix='/api')
app.register_blueprint(financial_bp, url_prefix='/api/financial')

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'database', 'app.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)
with app.app_context():
    db.create_all()

# --- ROUTES ---

@app.route('/login')
def login_page():
    """Serve the login page."""
    # If user is already logged in, redirect them to the app
    if 'user_id' in session:
        return redirect('/')
    return send_from_directory(app.static_folder, 'login.html')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_app(path):
    """
    Serve the main application and its static assets.
    Protects the main index.html page and handles serving other files.
    """
    # If the user is requesting the root, they want the main application.
    if path == "":
        path = "index.html"

    # Secure the main application page.
    if path == "index.html":
        if 'user_id' not in session:
            return redirect('/login')

    # Construct the full path to the requested file.
    requested_path = os.path.join(app.static_folder, path)

    # If the path exists, serve the file (e.g., CSS, JS, images).
    if os.path.exists(requested_path):
        return send_from_directory(app.static_folder, path)
    
    # If the path does NOT exist (e.g., for client-side routing deep links),
    # and the user is authenticated, serve the main app as a fallback.
    if 'user_id' in session:
        return send_from_directory(app.static_folder, 'index.html')
    else:
        # Otherwise, the user is unauthenticated and requesting a non-existent file.
        return redirect('/login')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7000, debug=True)

