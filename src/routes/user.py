from flask import Blueprint, jsonify, request, session
from src.models.user import User, db
from datetime import datetime
from functools import wraps

user_bp = Blueprint('user', __name__)

def login_required(f):
    """Decorator to require login for protected routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to require admin role for protected routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        
        user = User.query.get(session['user_id'])
        if not user or not user.is_admin():
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

@user_bp.route('/auth/login', methods=['POST'])
def login():
    """User login endpoint"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password) and user.is_active:
            session['user_id'] = user.id
            session['username'] = user.username
            session['role'] = user.role
            
            # Update last login
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            return jsonify({
                'message': 'Login successful',
                'user': user.to_dict()
            }), 200
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
            
    except Exception as e:
        print(f"Error in login: {e}")
        return jsonify({'error': str(e)}), 500

@user_bp.route('/auth/logout', methods=['POST'])
@login_required
def logout():
    """User logout endpoint"""
    session.clear()
    return jsonify({'message': 'Logout successful'}), 200

@user_bp.route('/auth/current-user', methods=['GET'])
@login_required
def get_current_user():
    """Get current logged-in user"""
    try:
        user = User.query.get(session['user_id'])
        if user:
            return jsonify(user.to_dict()), 200
        else:
            session.clear()
            return jsonify({'error': 'User not found'}), 404
    except Exception as e:
        print(f"Error in get_current_user: {e}")
        return jsonify({'error': str(e)}), 500

@user_bp.route('/auth/check-session', methods=['GET'])
def check_session():
    """Check if user is logged in"""
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user and user.is_active:
            return jsonify({
                'authenticated': True,
                'user': user.to_dict()
            }), 200
    
    return jsonify({'authenticated': False}), 200

@user_bp.route('/users', methods=['GET'])
@admin_required
def get_users():
    """Get all users (admin only)"""
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])

@user_bp.route('/users', methods=['POST'])
@admin_required
def create_user():
    """Create new user (admin only)"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['username', 'email', 'password']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Check if username or email already exists
        existing_user = User.query.filter(
            (User.username == data['username']) | (User.email == data['email'])
        ).first()
        
        if existing_user:
            return jsonify({'error': 'Username or email already exists'}), 400
        
        user = User(
            username=data['username'],
            email=data['email'],
            role=data.get('role', 'user')
        )
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify(user.to_dict()), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Error in create_user: {e}")
        return jsonify({'error': str(e)}), 500

@user_bp.route('/users/<int:user_id>', methods=['GET'])
@admin_required
def get_user(user_id):
    """Get specific user (admin only)"""
    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict())

@user_bp.route('/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Update user (admin only)"""
    try:
        user = User.query.get_or_404(user_id)
        data = request.get_json()
        
        if 'username' in data:
            # Check if new username already exists
            existing_user = User.query.filter(
                User.username == data['username'],
                User.id != user_id
            ).first()
            if existing_user:
                return jsonify({'error': 'Username already exists'}), 400
            user.username = data['username']
        
        if 'email' in data:
            # Check if new email already exists
            existing_user = User.query.filter(
                User.email == data['email'],
                User.id != user_id
            ).first()
            if existing_user:
                return jsonify({'error': 'Email already exists'}), 400
            user.email = data['email']
        
        if 'password' in data and data['password']:
            user.set_password(data['password'])
        
        if 'role' in data:
            user.role = data['role']
        
        if 'is_active' in data:
            user.is_active = data['is_active']
        
        db.session.commit()
        return jsonify(user.to_dict())
        
    except Exception as e:
        db.session.rollback()
        print(f"Error in update_user: {e}")
        return jsonify({'error': str(e)}), 500

@user_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete user (admin only)"""
    try:
        user = User.query.get_or_404(user_id)
        
        # Prevent deleting the last admin
        if user.is_admin():
            admin_count = User.query.filter_by(role='admin', is_active=True).count()
            if admin_count <= 1:
                return jsonify({'error': 'Cannot delete the last admin user'}), 400
        
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': 'User deleted successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error in delete_user: {e}")
        return jsonify({'error': str(e)}), 500

@user_bp.route('/auth/change-password', methods=['POST'])
@login_required
def change_password():
    """Change current user's password"""
    try:
        data = request.get_json()
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        if not current_password or not new_password:
            return jsonify({'error': 'Current password and new password are required'}), 400
        
        user = User.query.get(session['user_id'])
        
        if not user.check_password(current_password):
            return jsonify({'error': 'Current password is incorrect'}), 400
        
        user.set_password(new_password)
        db.session.commit()
        
        return jsonify({'message': 'Password changed successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error in change_password: {e}")
        return jsonify({'error': str(e)}), 500
