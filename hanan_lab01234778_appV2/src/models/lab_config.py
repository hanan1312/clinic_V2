from src.models.user import db
import json

class LabConfig(db.Model):
    """Configuration for the laboratory management system."""
    __tablename__ = 'lab_config'

    id = db.Column(db.Integer, primary_key=True)
    lab_name = db.Column(db.String(200), default='Medical Analysis Laboratory')
    lab_director = db.Column(db.String(200), default='Lab Director')
    lab_phone = db.Column(db.String(20))
    lab_address = db.Column(db.String(500))
    logo_path = db.Column(db.String(500), default='/shtk.png')
    
    # Feature toggles
    active_features = db.Column(db.Text, default=json.dumps([
        'dashboard',
        'new-test-order',
        'clients',
        'add-client',
        'pending-samples',
        'completed-tests',
        'client-history',
        'sample-status-manager',
        'reports',
        'financial'
    ]))

    @staticmethod
    def get_config():
        """Get or create the lab configuration."""
        config = LabConfig.query.first()
        if not config:
            config = LabConfig()
            db.session.add(config)
            db.session.commit()
        return config

    def to_dict(self):
        try:
            features = json.loads(self.active_features) if isinstance(self.active_features, str) else self.active_features
        except (json.JSONDecodeError, TypeError):
            features = []
        
        return {
            'id': self.id,
            'lab_name': self.lab_name,
            'lab_director': self.lab_director,
            'lab_phone': self.lab_phone,
            'lab_address': self.lab_address,
            'logo_path': self.logo_path,
            'active_features': features
        }
