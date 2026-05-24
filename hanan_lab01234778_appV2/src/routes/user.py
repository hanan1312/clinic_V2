import os
import json
from functools import wraps
from flask import Blueprint, request, jsonify, session, current_app
from src.models.user import User, db

user_bp = Blueprint('user_bp', __name__)

@user_bp.route('/register', methods=['POST'])

def login_required(f):
    """Decorator to require a user to be logged in."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"message": "Authentication required. Please log in."}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to require a user to be logged in AND be an admin."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"message": "Authentication required. Please log in."}), 401
        if session.get('role') != 'admin':
            return jsonify({"message": "Access denied. Admin privileges required."}), 403
        return f(*args, **kwargs)
    return decorated_function
def register():
    """Register a new user."""
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password') or not data.get('email'):
        return jsonify({"message": "Missing username, email, or password"}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({"message": "Username already exists"}), 409
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"message": "Email already exists"}), 409

    role = data.get('role', 'user')
    new_user = User(username=data['username'], email=data['email'], role=role)
    new_user.set_password(data['password'])
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "User registered successfully"}), 201

@user_bp.route('/login', methods=['POST'])
def login():
    """Authenticate a user using prefix-based routing and JSON master accounts."""
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"message": "Missing username or password"}), 400

    username = data['username'].lower()
    password = data['password']

    # 1. Workspace Detection
    if username.startswith('lab_'):
        workspace = 'lab'
    elif username.startswith('clnc_'):
        workspace = 'clinic'
    else:
        return jsonify({"message": "Invalid prefix. Use clnc_ or lab_"}), 401

    # 2. Check the JSON Master Admins file FIRST
    json_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'admins.json')
    try:
        with open(json_path, 'r') as f:
            master_admins = json.load(f)
            
        if username in master_admins and master_admins[username] == password:
            # Login successful as a JSON Master Admin
            session['user_id'] = f"master_{username}" # Special ID for masters
            session['role'] = 'admin'
            session['workspace'] = workspace
            return jsonify({
                "message": "Master Login successful", 
                "user": {"username": username, "role": "admin", "workspace": workspace}
            }), 200
    except FileNotFoundError:
        print("Warning: admins.json not found. Skipping master auth.")

    # 3. If not a master admin, check the actual database
    # Bind to the correct database engine based on the prefix before querying!
    from flask import current_app
    
    # Securely point to the correct engine
    if workspace == 'lab':
        db.session.bind = current_app.lab_engine
    else:
        db.session.bind = current_app.clinic_engine

    # IMPORTANT: Use db.session.query to ensure the bind is respected
    user = db.session.query(User).filter_by(username=username).first()

    if user and user.check_password(password):
        session['user_id'] = user.id
        session['role'] = user.role
        session['workspace'] = workspace 
        
        user_data = user.to_dict()
        user_data['workspace'] = workspace
        return jsonify({"message": "Login successful", "user": user_data}), 200

    return jsonify({"message": "Invalid credentials"}), 401

@user_bp.route('/logout', methods=['POST'])
def logout():
    """Log out the current user by clearing the session."""
    session.clear()
    return jsonify({"message": "Logout successful"}), 200

@user_bp.route('/update_workspace', methods=['POST'])
@login_required
def update_workspace():
    """Update the workspace in the session."""
    data = request.get_json()
    workspace = data.get('workspace')
    
    if workspace not in ['clinic', 'lab']:
        return jsonify({"message": "Invalid workspace"}), 400
        
    session['workspace'] = workspace
    return jsonify({"message": f"Workspace updated to {workspace}"}), 200

@user_bp.route('/current_user', methods=['GET'])
def get_current_user():
    """Get details of the currently logged-in user, supporting master accounts."""
    if 'user_id' in session:
        user_id = str(session['user_id'])
        workspace = session.get('workspace', 'clinic')
        
        # 1. Handle JSON Master Accounts
        if user_id.startswith('master_'):
            username = user_id.replace('master_', '')
            return jsonify({
                'id': user_id,
                'username': username,
                'email': f"{username}@master.local",
                'role': 'admin',
                'workspace': workspace,
                'is_active': True
            }), 200
            
        # 2. Handle Regular Database Users
        # Bind the correct database engine based on their workspace!
        if workspace == 'lab':
            db.session.bind = current_app.lab_engine
        else:
            db.session.bind = current_app.clinic_engine
            
        user = User.query.get(session['user_id'])
        if user:
            user_data = user.to_dict()
            user_data['workspace'] = workspace
            return jsonify(user_data), 200
            
    return jsonify({"message": "Not authenticated"}), 401

@user_bp.route('/master/create-account', methods=['POST'])
def master_create_account():
    """Create a client/user with an enforced prefix in the target database."""
    if not str(session.get('user_id', '')).startswith('master_'):
        return jsonify({"error": "Unauthorized. Master access required."}), 403
        
    data = request.get_json()
    target_workspace = data.get('target_workspace') # 'clinic' or 'lab'
    raw_username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'user')
    
    # 1. Enforce the prefix
    if target_workspace == 'clinic':
        prefix = 'clnc_'
    else:
        prefix = 'lab_'
        
    final_username = f"{prefix}{raw_username}"
    
    # 2. Bind to the target database
    if target_workspace == 'lab':
        db.session.bind = current_app.lab_engine
    else:
        db.session.bind = current_app.clinic_engine    
    # 3. Check and Create
    try:
        if User.query.filter_by(username=final_username).first():
            return jsonify({"error": f"Username '{final_username}' already exists!"}), 400
            
        new_user = User(username=final_username, email=f"{final_username}@local.com", role=role)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        
        return jsonify({"message": f"Successfully created user: {final_username}"}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Database error: {str(e)}"}), 500

@user_bp.route('/master/update-features', methods=['POST'])
def master_update_features():
    """Update which UI features are enabled for a specific workspace."""
    if not str(session.get('user_id', '')).startswith('master_'):
        return jsonify({"error": "Unauthorized. Master access required."}), 403
        
    data = request.get_json()
    target_workspace = data.get('target_workspace')
    active_features = data.get('features', []) # List of strings
    
    # Bind to target database
    from flask import current_app
    from src.models.clinic_config import ClinicConfig
    db.session.bind = current_app.lab_engine if target_workspace == 'lab' else current_app.clinic_engine
    
    config = ClinicConfig.get_config()
    config.active_features = json.dumps(active_features)
    db.session.commit()
    
    return jsonify({"message": f"Successfully updated features for {target_workspace.upper()}"}), 200
