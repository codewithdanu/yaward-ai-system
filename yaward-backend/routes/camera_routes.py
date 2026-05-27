import logging
from flask import Blueprint, request, jsonify
from routes.auth_routes import token_required, admin_required

logger = logging.getLogger(__name__)

camera_bp = Blueprint("cameras", __name__, url_prefix="/api")


@camera_bp.route("/cameras", methods=["GET"])
@token_required
def list_cameras():
    """GET /api/cameras — Retrieve list of registered cameras."""
    from database_models import Camera
    try:
        records = Camera.query.order_by(Camera.created_at.asc()).all()
        cameras = [r.to_dict() for r in records]
        return jsonify({"status": "success", "count": len(cameras), "cameras": cameras}), 200
    except Exception as e:
        logger.error(f"Error listing cameras: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch cameras"}), 500


@camera_bp.route("/cameras", methods=["POST"])
@admin_required
def register_camera():
    """
    POST /api/cameras — Register a new camera.
    Body: { "id": "CCTV-007", "name": "...", "location": "...", "rtspUrl": "..." }
    """
    from database_models import db, Camera
    data = request.get_json(silent=True) or {}
    cam_id = data.get("id")
    name = data.get("name")
    location = data.get("location")
    rtsp_url = data.get("rtspUrl")
    is_danger_zone = data.get("isDangerZone", False)

    if not cam_id or not name or not location:
        return jsonify({"error": "Missing required fields: id, name, location"}), 400

    cam_id = cam_id.strip().upper()

    try:
        # Check if ID already exists
        existing = Camera.query.get(cam_id)
        if existing:
            return jsonify({"error": f"Camera with ID '{cam_id}' already registered"}), 400

        new_cam = Camera(
            id=cam_id,
            name=name.strip(),
            location=location.strip(),
            rtsp_url=rtsp_url.strip() if rtsp_url else None,
            is_danger_zone=bool(is_danger_zone),
            status="online"
        )
        db.session.add(new_cam)
        db.session.commit()

        logger.info(f"Registered new camera: {cam_id}")
        return jsonify({"status": "success", "camera": new_cam.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error registering camera: {e}", exc_info=True)
        return jsonify({"error": "Failed to register camera"}), 500


@camera_bp.route("/cameras/<string:camera_id>", methods=["PUT"])
@admin_required
def update_camera(camera_id: str):
    """
    PUT /api/cameras/<id> — Update camera info.
    Body: { "name": "...", "location": "...", "rtspUrl": "..." }
    """
    from database_models import db, Camera
    camera_id = camera_id.strip().upper()
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    location = data.get("location")
    rtsp_url = data.get("rtspUrl")
    is_danger_zone = data.get("isDangerZone")

    try:
        cam = Camera.query.get(camera_id)
        if not cam:
            return jsonify({"error": f"Camera '{camera_id}' not found"}), 404

        if name:
            cam.name = name.strip()
        if location:
            cam.location = location.strip()
        if rtsp_url is not None:
            cam.rtsp_url = rtsp_url.strip() if rtsp_url else None
        if is_danger_zone is not None:
            cam.is_danger_zone = bool(is_danger_zone)

        db.session.commit()
        logger.info(f"Updated camera: {camera_id}")
        return jsonify({"status": "success", "camera": cam.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating camera {camera_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to update camera"}), 500


@camera_bp.route("/cameras/<string:camera_id>", methods=["DELETE"])
@admin_required
def delete_camera(camera_id: str):
    """DELETE /api/cameras/<id> — Delete camera register."""
    from database_models import db, Camera
    camera_id = camera_id.strip().upper()

    try:
        cam = Camera.query.get(camera_id)
        if not cam:
            return jsonify({"error": f"Camera '{camera_id}' not found"}), 404

        db.session.delete(cam)
        db.session.commit()

        logger.info(f"Deleted camera register: {camera_id}")
        return jsonify({"status": "success", "message": f"Camera {camera_id} deleted successfully", "id": camera_id}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting camera {camera_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to delete camera"}), 500
