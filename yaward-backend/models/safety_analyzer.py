import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Danger zones defined as bounding polygons (default: blasting area)
DEFAULT_DANGER_ZONES = [
    {
        "id": "blasting_zone",
        "name": "Blasting Area",
        # Polygon vertices (x, y) - configurable per CCTV
        "polygon": [(500, 300), (1200, 300), (1200, 800), (500, 800)],
    },
    {
        "id": "heavy_machinery_zone",
        "name": "Heavy Machinery Area",
        "polygon": [(0, 600), (400, 600), (400, 1080), (0, 1080)],
    },
]


class SafetyAnalyzer:
    """
    Rule-based safety analysis engine.
    
    Rules:
      1. NO_HELMET: Worker detected without helmet
      2. NO_VEST:   Worker detected without safety vest
      3. INTRUSION: Worker detected in danger zone
    """

    def __init__(self, danger_zones: List[Dict] = None):
        self.danger_zones = danger_zones or DEFAULT_DANGER_ZONES

    # ─────────────────────────── PUBLIC API ────────────────────────────

    def analyze(self, detections: dict, cctv_id: str, image_bytes: bytes = None) -> List[Dict]:
        """
        Analyze detection results and generate violation records.

        Args:
            detections: output from YAWardDetector.detect()
            cctv_id: camera identifier string
            image_bytes: raw bytes of the current video frame

        Returns:
            List of violation dicts (already saved to DB)
        """
        from database_models import db, Violation

        violations: List[Dict] = []
        persons = detections.get("persons", [])
        helmets = detections.get("helmets", [])
        vests = detections.get("vests", [])
        masks = detections.get("masks", [])
        cones = detections.get("cones", [])
        machinery = detections.get("machinery", [])
        vehicles = detections.get("vehicles", [])

        # Rate-limiting / Cooldown mechanism (e.g. 60 seconds per violation type per camera)
        cooldown_seconds = 60
        cooldown_limit = datetime.utcnow() - timedelta(seconds=cooldown_seconds)
        
        recent_violations = Violation.query.filter(
            Violation.cctv_id == cctv_id,
            Violation.timestamp >= cooldown_limit
        ).all()
        
        recent_types = {v.type for v in recent_violations}

        # Check if this camera is globally flagged as a danger zone in the database
        from database_models import Camera
        camera = Camera.query.get(cctv_id)
        is_camera_danger = False
        camera_name = "Danger Zone"
        if camera and camera.is_danger_zone:
            is_camera_danger = True
            camera_name = camera.name

        for person in persons:
            person_id = person["id"]
            person_bbox = person["bbox"]

            # Rule 1: Helmet check
            has_helmet = self._has_protection(person_bbox, helmets)
            if not has_helmet and "NO_HELMET" not in recent_types:
                violations.append(self._create_violation(
                    type_="NO_HELMET",
                    severity="HIGH",
                    person_id=person_id,
                    cctv_id=cctv_id,
                    message=f"Worker {person_id} detected without helmet",
                    metadata={"person_bbox": person_bbox, "confidence": person["confidence"]},
                ))
                recent_types.add("NO_HELMET") # Prevent duplicate in same analysis tick

            # Rule 2: Vest check
            has_vest = self._has_protection(person_bbox, vests)
            if not has_vest and "NO_VEST" not in recent_types:
                violations.append(self._create_violation(
                    type_="NO_VEST",
                    severity="HIGH",
                    person_id=person_id,
                    cctv_id=cctv_id,
                    message=f"Worker {person_id} detected without safety vest",
                    metadata={"person_bbox": person_bbox, "confidence": person["confidence"]},
                ))
                recent_types.add("NO_VEST")

            # Rule 3: Danger zone intrusion
            if is_camera_danger:
                if "INTRUSION" not in recent_types:
                    violations.append(self._create_violation(
                        type_="INTRUSION",
                        severity="CRITICAL",
                        person_id=person_id,
                        cctv_id=cctv_id,
                        message=f"Pekerja {person_id} terdeteksi di Area Berbahaya ({camera_name})",
                        metadata={
                            "person_bbox": person_bbox,
                            "zone_id": "camera_global_danger",
                            "zone_name": camera_name,
                            "confidence": person["confidence"],
                        },
                    ))
                    recent_types.add("INTRUSION")
            else:
                for zone in self.danger_zones:
                    if self._is_in_polygon(person_bbox, zone["polygon"]):
                        if "INTRUSION" not in recent_types:
                            violations.append(self._create_violation(
                                type_="INTRUSION",
                                severity="CRITICAL",
                                person_id=person_id,
                                cctv_id=cctv_id,
                                message=f"Worker {person_id} entered {zone['name']}",
                                metadata={
                                    "person_bbox": person_bbox,
                                    "zone_id": zone["id"],
                                    "zone_name": zone["name"],
                                    "confidence": person["confidence"],
                                },
                            ))
                            recent_types.add("INTRUSION")

            # Rule 4: Mask check (MEDIUM severity)
            has_mask = self._has_protection(person_bbox, masks)
            if not has_mask and "NO_MASK" not in recent_types:
                violations.append(self._create_violation(
                    type_="NO_MASK",
                    severity="MEDIUM",
                    person_id=person_id,
                    cctv_id=cctv_id,
                    message=f"Worker {person_id} detected without face mask",
                    metadata={"person_bbox": person_bbox, "confidence": person["confidence"]},
                ))
                recent_types.add("NO_MASK")

            # Rule 5: Machinery proximity check (LOW severity)
            near_machinery = False
            for mach in machinery + vehicles:
                dist = self._get_distance(person["center"], mach["center"])
                if dist < 250:  # Within 250 pixels
                    near_machinery = True
                    break

            if near_machinery:
                has_cone = False
                for cone in cones:
                    if self._get_distance(person["center"], cone["center"]) < 300:
                        has_cone = True
                        break

                if not has_cone and "MACHINERY_PROXIMITY" not in recent_types:
                    violations.append(self._create_violation(
                        type_="MACHINERY_PROXIMITY",
                        severity="LOW",
                        person_id=person_id,
                        cctv_id=cctv_id,
                        message=f"Worker {person_id} detected near active machinery/vehicle without safety cone barrier",
                        metadata={"person_bbox": person_bbox, "confidence": person["confidence"]},
                    ))
                    recent_types.add("MACHINERY_PROXIMITY")

        # ── Generate & Embed Base64 Annotated Snapshot ────────────────────
        if violations and image_bytes:
            try:
                import base64
                from services.image_utils import annotate_frame_with_detections
                
                annotated = annotate_frame_with_detections(image_bytes, detections, violations)
                snapshot_b64 = "data:image/jpeg;base64," + base64.b64encode(annotated).decode("utf-8")
                
                for v in violations:
                    if "metadata" not in v or v["metadata"] is None:
                        v["metadata"] = {}
                    v["metadata"]["snapshot_image"] = snapshot_b64
            except Exception as snap_err:
                logger.error(f"Failed to generate snapshot base64 for violations: {snap_err}")

        # Persist to DB
        if violations:
            try:
                for v in violations:
                    record = Violation(
                        type=v["type"],
                        severity=v["severity"],
                        person_id=v["person_id"],
                        cctv_id=v["cctv_id"],
                        timestamp=v["timestamp"],
                        message=v["message"],
                        metadata_=v.get("metadata"),
                        acknowledged=False,
                    )
                    db.session.add(record)
                db.session.commit()
                logger.info(f"Saved {len(violations)} violation(s) for {cctv_id}.")
            except Exception as e:
                db.session.rollback()
                logger.error(f"Failed to save violations: {e}")

        return violations

    def acknowledge(self, violation_id: int, acknowledged_by: str = "supervisor") -> bool:
        """Mark a violation as acknowledged."""
        from database_models import db, Violation

        v = db.session.get(Violation, violation_id)
        if v:
            v.acknowledged = True
            v.acknowledged_at = datetime.utcnow()
            v.acknowledged_by = acknowledged_by
            db.session.commit()
            logger.info(f"Violation {violation_id} acknowledged by {acknowledged_by}.")
            return True
        return False

    def get_violations(
        self,
        limit: int = 50,
        cctv_id: Optional[str] = None,
        acknowledged: Optional[bool] = None,
        severity: Optional[str] = None,
    ) -> List[Dict]:
        """Fetch violations from database with optional filters."""
        from database_models import Violation

        query = Violation.query

        if cctv_id:
            query = query.filter_by(cctv_id=cctv_id)
        if acknowledged is not None:
            query = query.filter_by(acknowledged=acknowledged)
        if severity:
            query = query.filter_by(severity=severity.upper())

        records = query.order_by(Violation.timestamp.desc()).limit(limit).all()
        return [r.to_dict() for r in records]

    def get_statistics(self, period: str = "today") -> dict:
        """Compute dashboard statistics for a given time period."""
        from database_models import Violation
        from sqlalchemy import func

        now = datetime.utcnow()
        period_map = {
            "today": now.replace(hour=0, minute=0, second=0, microsecond=0),
            "week": now - timedelta(days=7),
            "month": now - timedelta(days=30),
            "all": None,
        }

        cutoff = period_map.get(period)
        query = Violation.query
        if cutoff:
            query = query.filter(Violation.timestamp >= cutoff)

        all_violations = query.all()
        total = len(all_violations)

        by_type: Dict[str, int] = {}
        by_severity: Dict[str, int] = {}
        by_cctv: Dict[str, int] = {}
        unacknowledged = 0

        for v in all_violations:
            by_type[v.type] = by_type.get(v.type, 0) + 1
            by_severity[v.severity] = by_severity.get(v.severity, 0) + 1
            by_cctv[v.cctv_id] = by_cctv.get(v.cctv_id, 0) + 1
            if not v.acknowledged:
                unacknowledged += 1

        return {
            "total_violations": total,
            "unacknowledged": unacknowledged,
            "violations_by_type": by_type,
            "violations_by_severity": by_severity,
            "violations_by_cctv": by_cctv,
            "period": period,
        }

    # ─────────────────────────── PRIVATE HELPERS ────────────────────────

    def _has_protection(self, person_bbox: list, protection_list: list) -> bool:
        """Check if any protection item overlaps with the person bounding box."""
        p_x1, p_y1, p_x2, p_y2 = person_bbox

        for prot in protection_list:
            px1, py1, px2, py2 = prot["bbox"]
            # IoU-style overlap check
            if (p_x1 < px2 and p_x2 > px1 and p_y1 < py2 and p_y2 > py1):
                return True

        return False

    def _is_in_polygon(self, bbox: list, polygon_points: list) -> bool:
        """Check if person center point is inside a polygon (ray casting)."""
        center_x = (bbox[0] + bbox[2]) / 2
        center_y = (bbox[1] + bbox[3]) / 2

        x, y = center_x, center_y
        n = len(polygon_points)
        inside = False
        j = n - 1

        for i in range(n):
            xi, yi = polygon_points[i]
            xj, yj = polygon_points[j]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i

        return inside

    def _get_distance(self, p1: list, p2: list) -> float:
        """Compute Euclidean distance between two center points."""
        import math
        return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

    def _create_violation(
        self,
        type_: str,
        severity: str,
        person_id: str,
        cctv_id: str,
        message: str,
        metadata: dict = None,
    ) -> dict:
        """Build a violation dictionary."""
        return {
            "type": type_,
            "severity": severity,
            "person_id": person_id,
            "cctv_id": cctv_id,
            "timestamp": datetime.utcnow(),
            "message": message,
            "metadata": metadata or {},
            "acknowledged": False,
        }

    def _get_violations_for_test(self, detections: dict, cctv_id: str) -> List[Dict]:
        """
        Test-only helper: generate violations without persisting to DB.
        Mirrors the logic in analyze() but skips database writes.
        """
        violations: List[Dict] = []
        persons = detections.get("persons", [])
        helmets = detections.get("helmets", [])
        vests = detections.get("vests", [])
        masks = detections.get("masks", [])
        cones = detections.get("cones", [])
        machinery = detections.get("machinery", [])
        vehicles = detections.get("vehicles", [])

        for person in persons:
            person_id = person["id"]
            person_bbox = person["bbox"]

            if not self._has_protection(person_bbox, helmets):
                violations.append(self._create_violation(
                    type_="NO_HELMET", severity="HIGH",
                    person_id=person_id, cctv_id=cctv_id,
                    message=f"Worker {person_id} detected without helmet",
                ))

            if not self._has_protection(person_bbox, vests):
                violations.append(self._create_violation(
                    type_="NO_VEST", severity="HIGH",
                    person_id=person_id, cctv_id=cctv_id,
                    message=f"Worker {person_id} detected without safety vest",
                ))

            for zone in self.danger_zones:
                if self._is_in_polygon(person_bbox, zone["polygon"]):
                    violations.append(self._create_violation(
                        type_="INTRUSION", severity="CRITICAL",
                        person_id=person_id, cctv_id=cctv_id,
                        message=f"Worker {person_id} entered {zone['name']}",
                    ))

            if not self._has_protection(person_bbox, masks):
                violations.append(self._create_violation(
                    type_="NO_MASK", severity="MEDIUM",
                    person_id=person_id, cctv_id=cctv_id,
                    message=f"Worker {person_id} detected without face mask",
                ))

            near_machinery = False
            for mach in machinery + vehicles:
                dist = self._get_distance(person["center"], mach["center"])
                if dist < 250:
                    near_machinery = True
                    break

            if near_machinery:
                has_cone = False
                for cone in cones:
                    if self._get_distance(person["center"], cone["center"]) < 300:
                        has_cone = True
                        break

                if not has_cone:
                    violations.append(self._create_violation(
                        type_="MACHINERY_PROXIMITY", severity="LOW",
                        person_id=person_id, cctv_id=cctv_id,
                        message=f"Worker {person_id} detected near active machinery/vehicle without safety cone barrier",
                    ))

        return violations
