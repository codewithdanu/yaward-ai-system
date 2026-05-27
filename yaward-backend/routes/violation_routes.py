import logging
from flask import Blueprint, request, jsonify, g
from models.safety_analyzer import SafetyAnalyzer
from routes.auth_routes import token_required, admin_required

logger = logging.getLogger(__name__)

violation_bp = Blueprint("violations", __name__, url_prefix="/api")
_analyzer: SafetyAnalyzer = None


def get_analyzer() -> SafetyAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = SafetyAnalyzer()
    return _analyzer


@violation_bp.route("/violations", methods=["GET"])
@token_required
def list_violations():
    """
    GET /api/violations
    
    Query params:
      - limit (int, default=50)
      - page (int, default=1)
      - cctv_id (str, optional)
      - acknowledged (bool, optional: true/false)
      - severity (str, optional: LOW|MEDIUM|HIGH|CRITICAL)
      - start_date (str, optional: YYYY-MM-DD or ISO)
      - end_date (str, optional: YYYY-MM-DD or ISO)
    """
    from database_models import Violation
    try:
        limit = request.args.get("limit", 50, type=int)
        page = request.args.get("page", 1, type=int)
        cctv_id = request.args.get("cctv_id", None)
        severity = request.args.get("severity", None)
        start_date_str = request.args.get("start_date", None)
        end_date_str = request.args.get("end_date", None)

        # Parse acknowledged param
        acknowledged_param = request.args.get("acknowledged", None)
        acknowledged = None
        if acknowledged_param is not None:
            acknowledged = acknowledged_param.lower() == "true"

        # Clamp limit and calculate offset
        limit = min(max(limit, 1), 500)
        page = max(page, 1)
        offset = (page - 1) * limit

        query = Violation.query

        # Apply basic filters
        if cctv_id:
            query = query.filter_by(cctv_id=cctv_id)
        if acknowledged is not None:
            query = query.filter_by(acknowledged=acknowledged)
        if severity:
            query = query.filter_by(severity=severity.upper())
            
        # Apply date filters
        from datetime import datetime
        if start_date_str:
            try:
                if 'T' in start_date_str:
                    start_date = datetime.fromisoformat(start_date_str.replace('Z', ''))
                else:
                    start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
                query = query.filter(Violation.timestamp >= start_date)
            except ValueError:
                return jsonify({"error": f"Invalid start_date format: {start_date_str}. Use YYYY-MM-DD."}), 400

        if end_date_str:
            try:
                if 'T' in end_date_str:
                    end_date = datetime.fromisoformat(end_date_str.replace('Z', ''))
                else:
                    # Include the entire end day (until 23:59:59)
                    end_date = datetime.strptime(end_date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
                query = query.filter(Violation.timestamp <= end_date)
            except ValueError:
                return jsonify({"error": f"Invalid end_date format: {end_date_str}. Use YYYY-MM-DD."}), 400

        # Fetch total count before pagination
        total_count = query.count()

        # Apply ordering and limit/offset
        records = query.order_by(Violation.timestamp.desc()).offset(offset).limit(limit).all()
        violations = [r.to_dict() for r in records]

        return jsonify({
            "status": "success",
            "count": len(violations),
            "total_count": total_count,
            "page": page,
            "limit": limit,
            "violations": violations,
        }), 200

    except Exception as e:
        logger.error(f"Error fetching violations: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch violations"}), 500


@violation_bp.route("/acknowledge-alert", methods=["POST"])
@token_required
def acknowledge_alert():
    """
    POST /api/acknowledge-alert
    Body: { "violation_id": 123, "acknowledged_by": "supervisor_name" }
    """
    data = request.get_json(silent=True) or {}
    violation_id = data.get("violation_id")
    acknowledged_by = data.get("acknowledged_by")
    if not acknowledged_by or acknowledged_by == "supervisor":
        acknowledged_by = g.current_user.username

    if violation_id is None:
        return jsonify({"error": "Missing 'violation_id' in request body"}), 400

    try:
        violation_id = int(violation_id)
    except (ValueError, TypeError):
        return jsonify({"error": "'violation_id' must be an integer"}), 400

    try:
        analyzer = get_analyzer()
        success = analyzer.acknowledge(violation_id, acknowledged_by)

        if not success:
            return jsonify({"error": f"Violation ID {violation_id} not found"}), 404

        return jsonify({
            "status": "success",
            "message": f"Violation {violation_id} acknowledged by {acknowledged_by}",
            "violation_id": violation_id,
        }), 200

    except Exception as e:
        logger.error(f"Error acknowledging violation {violation_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to acknowledge violation"}), 500


@violation_bp.route("/violations/<int:violation_id>", methods=["GET"])
@token_required
def get_violation_detail(violation_id: int):
    """GET /api/violations/:id — Get single violation detail."""
    from database_models import Violation

    v = Violation.query.get(violation_id)
    if not v:
        return jsonify({"error": f"Violation {violation_id} not found"}), 404

    return jsonify({"status": "success", "violation": v.to_dict()}), 200


@violation_bp.route("/violations/<int:violation_id>", methods=["DELETE"])
@admin_required
def delete_violation(violation_id: int):
    """
    DELETE /api/violations/:id
    Deletes a single violation record by ID.
    """
    from database_models import db, Violation
    try:
        v = Violation.query.get(violation_id)
        if not v:
            return jsonify({"error": f"Violation {violation_id} not found"}), 404
            
        db.session.delete(v)
        db.session.commit()
        
        logger.info(f"Violation {violation_id} deleted successfully.")
        return jsonify({
            "status": "success",
            "message": f"Violation {violation_id} deleted successfully",
            "violation_id": violation_id
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting violation {violation_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to delete violation"}), 500


@violation_bp.route("/violations/bulk-delete", methods=["POST"])
@admin_required
def bulk_delete_violations():
    """
    POST /api/violations/bulk-delete
    Body: { "violation_ids": [123, 456, ...] }
    """
    from database_models import db, Violation
    data = request.get_json(silent=True) or {}
    violation_ids = data.get("violation_ids")
    
    if not violation_ids or not isinstance(violation_ids, list):
        return jsonify({"error": "Missing or invalid 'violation_ids' list in request body"}), 400
        
    try:
        # Cast to integers
        ids = [int(v_id) for v_id in violation_ids]
        
        # Batch delete
        deleted_count = Violation.query.filter(Violation.id.in_(ids)).delete(synchronize_session=False)
        db.session.commit()
        
        logger.info(f"Bulk deleted {deleted_count} violations.")
        return jsonify({
            "status": "success",
            "message": f"Successfully deleted {deleted_count} violations",
            "deleted_count": deleted_count
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error bulk deleting violations: {e}", exc_info=True)
        return jsonify({"error": "Failed to bulk delete violations"}), 500


@violation_bp.route("/violations/export", methods=["GET"])
@token_required
def export_violations():
    """
    GET /api/violations/export
    Queries matching violations and returns a dynamic CSV file.
    """
    from database_models import Violation
    import csv
    from io import StringIO
    from flask import Response
    from datetime import datetime, timedelta

    try:
        cctv_id = request.args.get("cctv_id", None)
        severity = request.args.get("severity", None)
        period = request.args.get("period", "all")
        
        # Parse acknowledged param
        acknowledged_param = request.args.get("acknowledged", None)
        acknowledged = None
        if acknowledged_param is not None:
            acknowledged = acknowledged_param.lower() == "true"

        query = Violation.query

        # Apply basic filters
        if cctv_id:
            query = query.filter_by(cctv_id=cctv_id)
        if acknowledged is not None:
            query = query.filter_by(acknowledged=acknowledged)
        if severity:
            query = query.filter_by(severity=severity.upper())

        # Apply period filter
        now = datetime.utcnow()
        if period == "today":
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            query = query.filter(Violation.timestamp >= start_date)
        elif period == "week":
            start_date = now - timedelta(days=7)
            query = query.filter(Violation.timestamp >= start_date)
        elif period == "month":
            start_date = now - timedelta(days=30)
            query = query.filter(Violation.timestamp >= start_date)

        records = query.order_by(Violation.timestamp.desc()).all()

        # Generate CSV in memory
        si = StringIO()
        cw = csv.writer(si)
        # Headers
        cw.writerow([
            "Violation ID",
            "Type",
            "Severity",
            "CCTV ID",
            "Person ID",
            "Timestamp (UTC)",
            "Acknowledged",
            "Acknowledged By",
            "Acknowledged At",
            "Message"
        ])
        
        for r in records:
            cw.writerow([
                r.id,
                r.type,
                r.severity,
                r.cctv_id,
                r.person_id or "N/A",
                r.timestamp.isoformat() if r.timestamp else "",
                "Yes" if r.acknowledged else "No",
                r.acknowledged_by or "",
                r.acknowledged_at.isoformat() if r.acknowledged_at else "",
                r.message or ""
            ])

        response_data = si.getvalue()
        filename = f"yaward_safety_report_{period}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        return Response(
            response_data,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        logger.error(f"Error exporting violations: {e}", exc_info=True)
        return jsonify({"error": "Failed to export safety violations to CSV"}), 500
