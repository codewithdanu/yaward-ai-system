import json
from database_models import db, User
from routes.auth_routes import generate_token


def test_default_seeded_users(client, app):
    """Verify that app startup seeds admin and staff users if none exist."""
    with app.app_context():
        admin = User.query.filter_by(username="admin").first()
        staff = User.query.filter_by(username="staff").first()
        
        assert admin is not None
        assert admin.role == "admin"
        assert admin.email == "admin@yaward.com"
        
        assert staff is not None
        assert staff.role == "staff"
        assert staff.email == "staff@yaward.com"


def test_login_success(client):
    """POST /api/auth/login with correct credentials should return 200 with token."""
    response = client.post(
        "/api/auth/login",
        data=json.dumps({"username": "admin", "password": "admin123"}),
        content_type="application/json"
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "success"
    assert "token" in data
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "admin"


def test_login_invalid_password(client):
    """POST /api/auth/login with invalid password should return 401."""
    response = client.post(
        "/api/auth/login",
        data=json.dumps({"username": "admin", "password": "wrongpassword"}),
        content_type="application/json"
    )
    assert response.status_code == 401
    data = response.get_json()
    assert "error" in data


def test_login_missing_fields(client):
    """POST /api/auth/login with missing fields should return 400."""
    response = client.post(
        "/api/auth/login",
        data=json.dumps({"username": "admin"}),
        content_type="application/json"
    )
    assert response.status_code == 400


def test_get_me_success(client, app):
    """GET /api/auth/me with valid Bearer token should return 200 with user profile."""
    # Obtain admin user ID
    with app.app_context():
        user = User.query.filter_by(username="admin").first()
        token = generate_token(user.id)

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "success"
    assert data["user"]["username"] == "admin"


def test_get_me_missing_token(client):
    """GET /api/auth/me with missing token should return 401."""
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_get_me_invalid_token(client):
    """GET /api/auth/me with invalid token should return 401."""
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer invalidtoken123"}
    )
    assert response.status_code == 401


def test_get_staff_list(client, app):
    """GET /api/users/staff with valid token should return 200 and list of all users."""
    with app.app_context():
        user = User.query.filter_by(username="staff").first()
        token = generate_token(user.id)

    response = client.get(
        "/api/users/staff",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "success"
    assert isinstance(data["users"], list)
    assert len(data["users"]) >= 2
