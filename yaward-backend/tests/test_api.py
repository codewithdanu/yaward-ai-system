"""Tests for health check and analysis API endpoints."""
import json


def test_health_check(client):
    """GET /api/health should return 200 with status ok."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ok"
    assert "timestamp" in data
    assert "service" in data


def test_health_check_db_status(client):
    """Health check should include database status."""
    response = client.get("/api/health")
    data = response.get_json()
    assert "database" in data


def test_analyze_missing_image_path(client):
    """POST /api/analyze without image_path should return 400."""
    response = client.post(
        "/api/analyze",
        data=json.dumps({"cctv_id": "CCTV_001"}),
        content_type="application/json",
    )
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data


def test_analyze_nonexistent_image(client):
    """POST /api/analyze with nonexistent image path should return 404."""
    response = client.post(
        "/api/analyze",
        data=json.dumps({
            "image_path": "/nonexistent/image.jpg",
            "cctv_id": "CCTV_001",
        }),
        content_type="application/json",
    )
    assert response.status_code == 404


def test_violations_list(client, auth_headers):
    """GET /api/violations should return 200 with violations list."""
    response = client.get("/api/violations", headers=auth_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "success"
    assert "violations" in data
    assert isinstance(data["violations"], list)


def test_violations_limit_param(client, auth_headers):
    """GET /api/violations?limit=5 should respect limit."""
    response = client.get("/api/violations?limit=5", headers=auth_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["violations"]) <= 5


def test_statistics_today(client):
    """GET /api/statistics?period=today should return 200."""
    response = client.get("/api/statistics?period=today")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "success"
    assert "statistics" in data


def test_statistics_invalid_period(client):
    """GET /api/statistics?period=invalid should return 400."""
    response = client.get("/api/statistics?period=invalid_period")
    assert response.status_code == 400


def test_acknowledge_missing_violation_id(client, auth_headers):
    """POST /api/acknowledge-alert without violation_id should return 400."""
    response = client.post(
        "/api/acknowledge-alert",
        data=json.dumps({}),
        content_type="application/json",
        headers=auth_headers
    )
    assert response.status_code == 400


def test_acknowledge_nonexistent_violation(client, auth_headers):
    """POST /api/acknowledge-alert with nonexistent ID should return 404."""
    response = client.post(
        "/api/acknowledge-alert",
        data=json.dumps({"violation_id": 99999}),
        content_type="application/json",
        headers=auth_headers
    )
    assert response.status_code == 404
