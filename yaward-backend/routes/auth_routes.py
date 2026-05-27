import logging
from functools import wraps
from flask import Blueprint, request, jsonify, g, current_app
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature
from database_models import db, User

logger = logging.getLogger(__name__)
auth_bp = Blueprint("auth", __name__)


def get_serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def generate_token(user_id):
    s = get_serializer()
    return s.dumps({"user_id": user_id})


def verify_token(token, max_age=86400):  # Token is valid for 1 day
    s = get_serializer()
    try:
        data = s.loads(token, max_age=max_age)
        return data["user_id"]
    except (SignatureExpired, BadSignature):
        return None


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        # Standard Bearer token authorization header
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

        if not token:
            return jsonify({"error": "Token is missing", "status": 401}), 401

        user_id = verify_token(token)
        if not user_id:
            return jsonify({"error": "Token is invalid or expired", "status": 401}), 401

        current_user = User.query.get(user_id)
        if not current_user:
            return jsonify({"error": "User not found", "status": 401}), 401

        # Store current user in Flask request context global variable
        g.current_user = current_user
        return f(*args, **kwargs)

    return decorated


def admin_required(f):
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if g.current_user.role != "admin":
            return jsonify({"error": "Admin permission required", "status": 403}), 403
        return f(*args, **kwargs)

    return decorated


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    """Authenticate credentials and return a session token."""
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Username and password are required", "status": 400}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid username or password", "status": 401}), 401

    token = generate_token(user.id)
    return jsonify({
        "status": "success",
        "token": token,
        "user": user.to_dict()
    }), 200


@auth_bp.route("/api/auth/me", methods=["GET"])
@token_required
def get_me():
    """Retrieve details for the authenticated user session."""
    return jsonify({
        "status": "success",
        "user": g.current_user.to_dict()
    }), 200


@auth_bp.route("/api/users/staff", methods=["GET"])
@token_required
def get_staff_emails():
    """List details of all registered users."""
    users = User.query.all()
    return jsonify({
        "status": "success",
        "users": [u.to_dict() for u in users]
    }), 200
