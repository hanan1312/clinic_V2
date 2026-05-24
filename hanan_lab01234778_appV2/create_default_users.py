#!/usr/bin/env python3
"""
Script to initialize databases and create default users for the 
Clinic and Lab Management System by parsing admins.json.
"""

import os
import sys
import json

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.models.user import db, User
from src.main import app

def init_databases_and_users():
    """Create tables and default users parsed from admins.json"""
    
    # 1. Locate the JSON file in the main directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Support both 'admin.json' or 'admins.json' just in case!
    json_path = os.path.join(base_dir, 'admins.json')
    if not os.path.exists(json_path):
        json_path = os.path.join(base_dir, 'admin.json')
        
    # Default fallback credentials just in case the file gets deleted
    clinic_admin_username = 'clnc_admin'
    clinic_admin_password = 'admin123'
    lab_admin_username = 'lab_admin'
    lab_admin_password = 'admin123'

    # 2. Parse the JSON file to get the master credentials
    if os.path.exists(json_path):
        print(f"Reading credentials from {os.path.basename(json_path)}...")
        with open(json_path, 'r') as f:
            admin_data = json.load(f)
            
            # Extract the clinic admin (starts with clnc_)
            for username, password in admin_data.items():
                if username.startswith('clnc_'):
                    clinic_admin_username = username
                    clinic_admin_password = password
                    break
                    
            # Extract the lab admin (starts with lab_)
            for username, password in admin_data.items():
                if username.startswith('lab_'):
                    lab_admin_username = username
                    lab_admin_password = password
                    break
    else:
        print("Warning: admins.json not found! Using fallback default credentials.")

    with app.app_context():
        print("\nStarting Database Initialization...\n")
        
        clinic_engine = app.clinic_engine
        lab_engine = app.lab_engine
        
        # ---------------------------------------------------------
        # SETUP CLINIC DATABASE (app.db)
        # ---------------------------------------------------------
        print(f"--- Setting up Clinic Database (app.db) ---")
        db.Model.metadata.create_all(clinic_engine)
        db.session.bind = clinic_engine
        
        # Check if the clinic user exists
        existing_clinic_admin = User.query.filter_by(username=clinic_admin_username).first()
        
        if not existing_clinic_admin:
            # Create new user based on JSON data
            admin = User(
                username=clinic_admin_username, 
                email=f'{clinic_admin_username}@clinic.local', 
                role='admin'
            )
            admin.set_password(clinic_admin_password)
            db.session.add(admin)
            db.session.commit()
            print(f"✅ Created Clinic Admin (username: '{clinic_admin_username}')")
        else:
            # SYNC FEATURE: If user exists, update their password to match the JSON file!
            existing_clinic_admin.set_password(clinic_admin_password)
            db.session.commit()
            print(f"ℹ️ Clinic Admin '{clinic_admin_username}' already exists. Password synced with JSON.")

        # ---------------------------------------------------------
        # SETUP LAB DATABASE (lab.db)
        # ---------------------------------------------------------
        print("\n--- Setting up Lab Database (lab.db) ---")
        db.Model.metadata.create_all(lab_engine)
        db.session.bind = lab_engine
        
        # Check if the lab user exists
        existing_lab_admin = User.query.filter_by(username=lab_admin_username).first()
        
        if not existing_lab_admin:
            # Create new user based on JSON data
            admin_lab = User(
                username=lab_admin_username, 
                email=f'{lab_admin_username}@lab.local', 
                role='admin'
            )
            admin_lab.set_password(lab_admin_password)
            db.session.add(admin_lab)
            db.session.commit()
            print(f"✅ Created Lab Admin (username: '{lab_admin_username}')")
        else:
            # SYNC FEATURE: If user exists, update their password to match the JSON file!
            existing_lab_admin.set_password(lab_admin_password)
            db.session.commit()
            print(f"ℹ️ Lab Admin '{lab_admin_username}' already exists. Password synced with JSON.")
            
        print("\n🎉 Database initialization complete! You can now start your server.")

if __name__ == '__main__':
    init_databases_and_users()