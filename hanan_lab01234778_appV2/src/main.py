import os
import sys
from sqlalchemy import create_engine

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, send_from_directory, redirect, session, request
from flask_cors import CORS

from config import DevelopmentConfig, ProductionConfig, DB_DIR 
from src.models.user import db, User
from src.models.client import Client
from src.models.test_result import TestResult
from src.models.lab_config import LabConfig
from src.routes.user import user_bp
from src.routes.patient import patient_bp
from src.routes.clinic import clinic_bp
from src.routes.client import client_bp
from src.routes.test_result import test_result_bp
from src.routes.lab import lab_bp
from src.routes.financial import financial_bp
from src.utils.error_handlers import register_error_handlers

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))

# --- CONFIGURATION UPGRADE ---
env = os.environ.get('FLASK_ENV', 'development')
if env == 'production':
    app.config.from_object(ProductionConfig)
else:
    app.config.from_object(DevelopmentConfig)

# Ensure secret key is strictly set for session security
app.config['SECRET_KEY'] = 'asdf#FGSgvasgf$5$WGT'
# -----------------------------

CORS(app, supports_credentials=True)
register_error_handlers(app)

app.register_blueprint(user_bp, url_prefix='/api/auth')
app.register_blueprint(patient_bp, url_prefix='/api')
app.register_blueprint(clinic_bp, url_prefix='/api')
app.register_blueprint(client_bp, url_prefix='/api')
app.register_blueprint(test_result_bp, url_prefix='/api')
app.register_blueprint(lab_bp, url_prefix='/api')
app.register_blueprint(financial_bp, url_prefix='/api/financial')

db.init_app(app)

# --- DYNAMIC DATABASE ENGINES ---
with app.app_context():
    # Fetch URIs
    clinic_uri = app.config.get('SQLALCHEMY_DATABASE_URI')
    lab_db_path = os.path.join(DB_DIR, 'lab.db').replace('\\', '/')
    lab_uri = f"sqlite:///{lab_db_path}"
    
    # Store engines globally so our interceptor can access them
    app.clinic_engine = create_engine(clinic_uri)
    app.lab_engine = create_engine(lab_uri)

# --- REQUEST INTERCEPTOR ---
@app.before_request
def bind_database():
    """Intercept API requests and bind the correct database engine."""
    if request.path.startswith('/api/') and request.path != '/api/auth/login':
        workspace = session.get('workspace', 'clinic')
        
        if workspace == 'lab':
            db.session.bind = app.lab_engine
        else:
            db.session.bind = app.clinic_engine

# --- FEATURE FLAGS ---
def is_workspace_switcher_enabled():
    """
    Check if the workspace switcher should be enabled.
    It's enabled if the user is a master admin from admins.json.
    """
    user_id = str(session.get('user_id', ''))
    return user_id.startswith('master_')

@app.route('/api/features')
def get_features():
    """Endpoint to provide feature flags to the frontend."""
    return {"workspace_switcher": is_workspace_switcher_enabled()}

# --- ROUTES ---

@app.route('/login')
def login_page():
    # Smart session check to prevent infinite loops and handle master accounts!
    if 'user_id' in session:
        user_id = str(session['user_id'])
        
        # If it's a master account, they are valid, send them to dashboard
        if user_id.startswith('master_'):
            return redirect('/')
            
        # If it's a regular user, bind the correct database before checking
        workspace = session.get('workspace', 'clinic')
        if workspace == 'lab':
            db.session.bind = app.lab_engine
        else:
            db.session.bind = app.clinic_engine 
            
        # Verify the database user actually exists
        if User.query.get(session['user_id']):
            return redirect('/') 
        else:
            session.pop('user_id', None) 

    return send_from_directory(app.static_folder, 'login.html')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_app(path):
    if path == "":
        workspace = session.get('workspace', 'clinic')
        path = "index_lab.html" if workspace == 'lab' else "index.html"
    
    # FIX: Prevent the dashboard "flash" by checking the session on the backend
    # before we ever send the index.html/index_lab.html file to the browser!
    if (path == "index.html" or path == "index_lab.html") and 'user_id' not in session:
        return redirect('/login')
    
    requested_path = os.path.join(app.static_folder, path)

    # Serve static files natively (CSS, JS, Images)
    if os.path.exists(requested_path):
        return send_from_directory(app.static_folder, path)
    
    # Fallback routing
    if 'user_id' in session:
        workspace = session.get('workspace', 'clinic')
        return send_from_directory(app.static_folder, "index_lab.html" if workspace == 'lab' else "index.html")
    return redirect('/login')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7000)