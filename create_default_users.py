#!/usr/bin/env python3
"""
Script to create default users for the Pediatric Doctor Management System
"""

import os
import sys

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.models.user import db, User
from src.main import app

def create_default_users():
    """Create default admin and user accounts"""
    with app.app_context():
        # Check if users already exist
        existing_admin = User.query.filter_by(username='admin').first()
        existing_user = User.query.filter_by(username='user').first()
        
        if existing_admin and existing_user:
            print("Default users already exist.")
            return
        
        # Create admin user
        if not existing_admin:
            admin = User(
                username='admin',
                email='admin@clinic.com',
                role='admin'
            )
            admin.set_password('admin123')  # Default password
            db.session.add(admin)
            print("Created admin user: username='admin', password='admin123'")
        
        # Create regular user
        if not existing_user:
            user = User(
                username='user',
                email='user@clinic.com',
                role='user'
            )
            user.set_password('user123')  # Default password
            db.session.add(user)
            print("Created user: username='user', password='user123'")
        
        db.session.commit()
        print("Default users created successfully!")
        print("\nLogin credentials:")
        print("Admin - Username: admin, Password: admin123")
        print("User - Username: user, Password: user123")
        print("\nPlease change these default passwords after first login!")

if __name__ == '__main__':
    create_default_users()

