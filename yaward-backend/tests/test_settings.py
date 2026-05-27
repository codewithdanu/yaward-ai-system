import json
from database_models import db, User, SystemSetting
from routes.auth_routes import generate_token
from services.alert_service import AlertService


def test_get_settings_by_admin(client, app):
    """GET /api/settings/emails by an admin should return 200 with email lists."""
    with app.app_context():
        admin = User.query.filter_by(username="admin").first()
        token = generate_token(admin.id)

    response = client.get(
        "/api/settings/emails",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "success"
    assert "emails" in data
    assert "available_staff_emails" in data


def test_get_settings_by_staff_denied(client, app):
    """GET /api/settings/emails by a staff user should return 403 (Access Denied)."""
    with app.app_context():
        staff = User.query.filter_by(username="staff").first()
        token = generate_token(staff.id)

    response = client.get(
        "/api/settings/emails",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


def test_save_settings_by_admin(client, app):
    """POST /api/settings/emails by an admin should save successfully."""
    with app.app_context():
        admin = User.query.filter_by(username="admin").first()
        token = generate_token(admin.id)

    payload = {"emails": ["custom_mgr@yaward.com", "staff@yaward.com"]}
    response = client.post(
        "/api/settings/emails",
        data=json.dumps(payload),
        content_type="application/json",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "success"
    assert "emails" in data
    assert "custom_mgr@yaward.com" in data["emails"]

    # Verify database persistence
    with app.app_context():
        setting = SystemSetting.query.filter_by(key="alert_emails").first()
        assert setting is not None
        assert "custom_mgr@yaward.com" in setting.value


def test_save_settings_by_staff_denied(client, app):
    """POST /api/settings/emails by a staff user should return 403."""
    with app.app_context():
        staff = User.query.filter_by(username="staff").first()
        token = generate_token(staff.id)

    payload = {"emails": ["staff@yaward.com"]}
    response = client.post(
        "/api/settings/emails",
        data=json.dumps(payload),
        content_type="application/json",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


def test_alert_service_dynamic_recipients(app):
    """AlertService should load dynamic email lists from database or fallback to env."""
    alert_service = AlertService()
    
    with app.app_context():
        # Clean any existing alert settings
        SystemSetting.query.filter_by(key="alert_emails").delete()
        db.session.commit()
        
        # Scenario 1: Empty settings -> fallback to env/empty list
        recipients = alert_service._get_dynamic_recipients()
        assert isinstance(recipients, list)
        
        # Scenario 2: With db settings -> load those emails
        new_setting = SystemSetting(key="alert_emails", value="dynamic1@test.com,dynamic2@test.com")
        db.session.add(new_setting)
        db.session.commit()
        
        recipients = alert_service._get_dynamic_recipients()
        assert "dynamic1@test.com" in recipients
        assert "dynamic2@test.com" in recipients
        assert len(recipients) == 2
