from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class User(db.Model):
    """Model for system users (Admin & Staff)."""

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default="staff", nullable=False)  # admin or staff
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "role": self.role,
            "created_at": f"{self.created_at.isoformat()}Z" if self.created_at else None
        }

    def __repr__(self):
        return f"<User {self.username} | {self.role}>"


class SystemSetting(db.Model):
    """Model for application configuration settings (e.g., custom emails)."""

    __tablename__ = "system_settings"

    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "key": self.key,
            "value": self.value
        }

    def __repr__(self):
        return f"<SystemSetting {self.key}>"


class Camera(db.Model):
    """Model for CCTV cameras registered in the system."""

    __tablename__ = "cameras"

    id = db.Column(db.String(50), primary_key=True)  # e.g., CCTV-001
    name = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(100), nullable=False)
    rtsp_url = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), default="online")
    is_danger_zone = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "location": self.location,
            "rtspUrl": self.rtsp_url,
            "status": self.status,
            "isDangerZone": self.is_danger_zone,
            "created_at": f"{self.created_at.isoformat()}Z" if self.created_at else None
        }

    def __repr__(self):
        return f"<Camera {self.id} | {self.name}>"


class Violation(db.Model):
    """Model for safety violations detected by YOLOv8."""

    __tablename__ = "violations"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    type = db.Column(db.String(50), nullable=False)           # NO_HELMET, NO_VEST, INTRUSION, FALL
    severity = db.Column(db.String(20), nullable=False)       # LOW, MEDIUM, HIGH, CRITICAL
    person_id = db.Column(db.String(100), nullable=True)
    cctv_id = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    acknowledged = db.Column(db.Boolean, default=False)
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    acknowledged_by = db.Column(db.String(100), nullable=True)
    message = db.Column(db.Text, nullable=True)
    metadata_ = db.Column("metadata", db.JSON, nullable=True)  # bbox, confidence, etc.
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Indexes
    __table_args__ = (
        db.Index("idx_violations_cctv_timestamp", "cctv_id", "timestamp"),
        db.Index("idx_violations_type", "type"),
        db.Index("idx_violations_acknowledged", "acknowledged"),
    )

    def to_dict(self):
        """Serialize violation to dictionary."""
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "person_id": self.person_id,
            "cctv_id": self.cctv_id,
            "timestamp": f"{self.timestamp.isoformat()}Z" if self.timestamp else None,
            "acknowledged": self.acknowledged,
            "acknowledged_at": f"{self.acknowledged_at.isoformat()}Z" if self.acknowledged_at else None,
            "acknowledged_by": self.acknowledged_by,
            "message": self.message,
            "metadata": self.metadata_,
            "created_at": f"{self.created_at.isoformat()}Z" if self.created_at else None,
        }

    def __repr__(self):
        return f"<Violation {self.id} | {self.type} | {self.cctv_id}>"
