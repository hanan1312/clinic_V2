from src.models.user import db
from datetime import datetime

class ClinicConfig(db.Model):
    __tablename__ = 'clinic_config'
    
    id = db.Column(db.Integer, primary_key=True)
    doctor_name = db.Column(db.String(200), nullable=False, default='Dr. [Doctor Name]')
    clinic_name = db.Column(db.String(200), nullable=False, default='Pediatric Clinic')
    clinic_phone = db.Column(db.String(50), nullable=False, default='[Clinic Phone Number]')
    clinic_address = db.Column(db.Text)
    logo_path = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @classmethod
    def get_config(cls):
        """Get the clinic configuration, create default if doesn't exist"""
        config = cls.query.first()
        if not config:
            config = cls()
            db.session.add(config)
            db.session.commit()
        return config
    
    def to_dict(self):
        return {
            'id': self.id,
            'doctor_name': self.doctor_name,
            'clinic_name': self.clinic_name,
            'clinic_phone': self.clinic_phone,
            'clinic_address': self.clinic_address,
            'logo_path': self.logo_path,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<ClinicConfig {self.clinic_name}>'

