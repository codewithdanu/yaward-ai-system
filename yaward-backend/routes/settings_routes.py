import logging
from flask import Blueprint, request, jsonify
from database_models import db, SystemSetting, User
from routes.auth_routes import admin_required

logger = logging.getLogger(__name__)
settings_bp = Blueprint("settings", __name__)


@settings_bp.route("/api/settings/emails", methods=["GET"])
@admin_required
def get_email_settings():
    """Retrieve saved email notification settings and list of all available staff emails."""
    setting = SystemSetting.query.filter_by(key="alert_emails").first()
    emails = []
    if setting and setting.value:
        emails = [e.strip() for e in setting.value.split(",") if e.strip()]

    # Also list all user emails for selection in dropdown
    users = User.query.all()
    staff_emails = [u.email for u in users if u.email]

    return jsonify({
        "status": "success",
        "emails": emails,
        "available_staff_emails": staff_emails
    }), 200


@settings_bp.route("/api/settings/emails", methods=["POST"])
@admin_required
def save_email_settings():
    """Save email notification list."""
    data = request.get_json() or {}
    emails = data.get("emails", [])

    if not isinstance(emails, list):
        return jsonify({"error": "Emails must be a list of strings", "status": 400}), 400

    # Sanitize and join with comma
    sanitized_emails = [e.strip() for e in emails if isinstance(e, str) and e.strip()]
    email_string = ",".join(sanitized_emails)

    setting = SystemSetting.query.filter_by(key="alert_emails").first()
    if not setting:
        setting = SystemSetting(key="alert_emails", value=email_string)
        db.session.add(setting)
    else:
        setting.value = email_string

    db.session.commit()
    logger.info(f"Email notification settings updated: {sanitized_emails}")

    return jsonify({
        "status": "success",
        "message": "Email settings saved successfully",
        "emails": sanitized_emails
    }), 200
