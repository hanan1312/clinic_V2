"""
Error handling utilities for the Pediatric Clinic application.
"""

import logging
import traceback
from functools import wraps
from flask import jsonify, request
from sqlalchemy.exc import SQLAlchemyError
from src.utils.validators import ValidationError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

def handle_errors(f):
    """
    Decorator to handle common errors in API endpoints.
    
    Args:
        f: Function to wrap
        
    Returns:
        Wrapped function with error handling
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValidationError as e:
            logger.warning(f"Validation error in {f.__name__}: {str(e)}")
            return jsonify({'error': str(e)}), 400
        except SQLAlchemyError as e:
            logger.error(f"Database error in {f.__name__}: {str(e)}")
            return jsonify({'error': 'Database operation failed'}), 500
        except ValueError as e:
            logger.warning(f"Value error in {f.__name__}: {str(e)}")
            return jsonify({'error': f'Invalid value: {str(e)}'}), 400
        except KeyError as e:
            logger.warning(f"Key error in {f.__name__}: {str(e)}")
            return jsonify({'error': f'Missing required field: {str(e)}'}), 400
        except Exception as e:
            logger.error(f"Unexpected error in {f.__name__}: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return jsonify({'error': 'An unexpected error occurred'}), 500
    
    return decorated_function

def log_request_info():
    """Log information about the incoming request."""
    logger.info(f"{request.method} {request.path} - IP: {request.remote_addr}")
    if request.is_json and request.get_json():
        # Log request data but exclude sensitive information
        data = request.get_json()
        safe_data = {k: v for k, v in data.items() if k not in ['password', 'password_hash']}
        logger.info(f"Request data: {safe_data}")

def register_error_handlers(app):
    """
    Register global error handlers for the Flask app.
    
    Args:
        app: Flask application instance
    """
    
    @app.errorhandler(400)
    def bad_request(error):
        logger.warning(f"Bad request: {error}")
        return jsonify({'error': 'Bad request'}), 400
    
    @app.errorhandler(401)
    def unauthorized(error):
        logger.warning(f"Unauthorized access: {error}")
        return jsonify({'error': 'Unauthorized access'}), 401
    
    @app.errorhandler(403)
    def forbidden(error):
        logger.warning(f"Forbidden access: {error}")
        return jsonify({'error': 'Access forbidden'}), 403
    
    @app.errorhandler(404)
    def not_found(error):
        logger.warning(f"Resource not found: {error}")
        return jsonify({'error': 'Resource not found'}), 404
    
    @app.errorhandler(405)
    def method_not_allowed(error):
        logger.warning(f"Method not allowed: {error}")
        return jsonify({'error': 'Method not allowed'}), 405
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {error}")
        return jsonify({'error': 'Internal server error'}), 500
    
    @app.before_request
    def before_request():
        """Log request information before processing."""
        if request.endpoint and not request.endpoint.startswith('static'):
            log_request_info()

class APIException(Exception):
    """Custom exception class for API errors."""
    
    def __init__(self, message, status_code=400, payload=None):
        super().__init__()
        self.message = message
        self.status_code = status_code
        self.payload = payload
    
    def to_dict(self):
        """Convert exception to dictionary for JSON response."""
        result = {'error': self.message}
        if self.payload:
            result.update(self.payload)
        return result

def handle_api_exception(e):
    """Handle custom API exceptions."""
    logger.warning(f"API Exception: {e.message}")
    response = jsonify(e.to_dict())
    response.status_code = e.status_code
    return response

