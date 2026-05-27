import pytest
from app import create_app


@pytest.fixture
def app():
    """Create test Flask app."""
    app = create_app("testing")
    yield app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def runner(app):
    """Create test CLI runner."""
    return app.test_cli_runner()


@pytest.fixture
def auth_headers(app):
    """Token auth headers for standard staff user."""
    from database_models import User
    from routes.auth_routes import generate_token
    with app.app_context():
        user = User.query.filter_by(username="staff").first()
        token = generate_token(user.id)
        return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(app):
    """Token auth headers for admin user."""
    from database_models import User
    from routes.auth_routes import generate_token
    with app.app_context():
        user = User.query.filter_by(username="admin").first()
        token = generate_token(user.id)
        return {"Authorization": f"Bearer {token}"}
