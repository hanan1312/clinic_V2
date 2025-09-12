from flask import Blueprint, request, jsonify
from src.models.clinic_config import ClinicConfig
from src.models.user import db
from src.routes.user import admin_required

clinic_bp = Blueprint('clinic', __name__)

@clinic_bp.route('/clinic/config', methods=['GET'])
def get_clinic_config():
    """Get clinic configuration"""
    try:
        config = ClinicConfig.get_config()
        return jsonify(config.to_dict()), 200
    except Exception as e:
        print(f"Error in get_clinic_config: {e}")
        return jsonify({'error': str(e)}), 500

@clinic_bp.route('/clinic/config', methods=['PUT'])
@admin_required
def update_clinic_config():
    """Update clinic configuration (admin only)"""
    try:
        data = request.get_json()
        config = ClinicConfig.get_config()
        
        if 'doctor_name' in data:
            config.doctor_name = data['doctor_name'].strip()
        if 'clinic_name' in data:
            config.clinic_name = data['clinic_name'].strip()
        if 'clinic_phone' in data:
            config.clinic_phone = data['clinic_phone'].strip()
        if 'clinic_address' in data:
            config.clinic_address = data['clinic_address'].strip()
        if 'logo_path' in data:
            config.logo_path = data['logo_path'].strip()
        
        db.session.commit()
        
        return jsonify({
            'message': 'Clinic configuration updated successfully',
            'config': config.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error in update_clinic_config: {e}")
        return jsonify({'error': str(e)}), 500

