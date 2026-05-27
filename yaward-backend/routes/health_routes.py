from flask import Blueprint, jsonify
from datetime import datetime
import platform
import sys

health_bp = Blueprint("health", __name__, url_prefix="/api")


@health_bp.route("/health", methods=["GET"])
def health_check():
    """
    GET /api/health
    Returns system health status, model info, and runtime metadata.
    """
    try:
        # Check database connectivity
        from database_models import db
        db.session.execute(db.text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return jsonify({
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": "YAWard Backend",
        "version": "1.0.0",
        "runtime": {
            "python": sys.version,
            "platform": platform.system(),
        },
        "database": db_status,
    }), 200
