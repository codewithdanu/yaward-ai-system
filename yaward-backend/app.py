import os
import logging
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def create_app(config_name: str = None) -> Flask:
    """Application factory pattern for YAWard Flask backend."""
    app = Flask(__name__)

    # Load config
    env = config_name or os.getenv("FLASK_ENV", "development")
    from config import config
    app.config.from_object(config.get(env, config["default"]))

    # Setup CORS - allow NextJS frontend
    CORS(app, origins=app.config["ALLOWED_ORIGINS"])

    # Initialize database
    from database_models import db
    db.init_app(app)

    # Create tables if they don't exist
    with app.app_context():
        db.create_all()
        logger.info("Database tables initialized.")
        
        # Seed default cameras
        from database_models import Camera
        if Camera.query.count() == 0:
            DEFAULT_CAMS = [
                Camera(id='CCTV-001', name='Mine Entrance Gate', location='Zone A - Pit Entry', status='online'),
                Camera(id='CCTV-002', name='Blasting Zone Perimeter', location='Zone B - Restricted', status='online'),
                Camera(id='CCTV-003', name='Heavy Equipment Bay', location='Zone C - Machinery', status='online'),
                Camera(id='CCTV-004', name='Worker Assembly Point', location='Zone D - Common', status='online'),
                Camera(id='CCTV-005', name='Tunnel Entrance', location='Zone E - Underground', status='online'),
                Camera(id='CCTV-006', name='Admin Building Perimeter', location='Zone F - Office', status='online'),
            ]
            db.session.bulk_save_objects(DEFAULT_CAMS)
            db.session.commit()
            logger.info("Seeded default cameras in database.")

        # Seed default users
        from database_models import User
        if User.query.count() == 0:
            admin_user = User(username="admin", email="admin@yaward.com", role="admin")
            admin_user.set_password("admin123")
            
            staff_user = User(username="staff", email="staff@yaward.com", role="staff")
            staff_user.set_password("staff123")
            
            db.session.add(admin_user)
            db.session.add(staff_user)
            db.session.commit()
            logger.info("Seeded default Admin and Staff users in database.")

    # Register blueprints
    from routes.health_routes import health_bp
    from routes.analysis_routes import analysis_bp
    from routes.violation_routes import violation_bp
    from routes.camera_routes import camera_bp
    from routes.auth_routes import auth_bp
    from routes.settings_routes import settings_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(violation_bp)
    app.register_blueprint(camera_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(settings_bp)

    # Global error handlers
    @app.errorhandler(404)
    def not_found(error):
        return {"error": "Endpoint not found", "status": 404}, 404

    @app.errorhandler(500)
    def server_error(error):
        logger.error(f"Internal server error: {error}")
        return {"error": "Internal server error", "status": 500}, 500

    @app.errorhandler(400)
    def bad_request(error):
        return {"error": "Bad request", "status": 400}, 400

    logger.info(f"YAWard backend started in '{env}' mode on port {app.config['PORT']}.")
    return app


# Create app instance
app = create_app()

if __name__ == "__main__":
    app.run(
        host=app.config["HOST"],
        port=app.config["PORT"],
        debug=app.config["DEBUG"],
    )
