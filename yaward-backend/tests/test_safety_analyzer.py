"""Unit tests for SafetyAnalyzer rule engine."""
import pytest
from models.safety_analyzer import SafetyAnalyzer


@pytest.fixture
def analyzer():
    return SafetyAnalyzer()


@pytest.fixture
def sample_detections():
    """Sample detections with 1 person, no helmet, no vest."""
    return {
        "persons": [
            {
                "id": "person_0",
                "bbox": [100, 100, 300, 500],
                "confidence": 0.95,
                "center": [200, 300],
            }
        ],
        "helmets": [],
        "vests": [],
        "image_shape": {"width": 1920, "height": 1080},
        "raw_count": {"persons": 1, "helmets": 0, "vests": 0},
    }


def test_no_helmet_violation(analyzer, sample_detections):
    """Person without helmet should trigger NO_HELMET violation."""
    violations = analyzer._get_violations_for_test(sample_detections, "CCTV_001")
    types = [v["type"] for v in violations]
    assert "NO_HELMET" in types


def test_no_vest_violation(analyzer, sample_detections):
    """Person without vest should trigger NO_VEST violation."""
    violations = analyzer._get_violations_for_test(sample_detections, "CCTV_001")
    types = [v["type"] for v in violations]
    assert "NO_VEST" in types


def test_no_violation_with_all_ppe(analyzer):
    """Person with both helmet and vest should not trigger violations."""
    detections = {
        "persons": [{"id": "person_0", "bbox": [100, 100, 300, 500], "confidence": 0.9, "center": [200, 300]}],
        "helmets": [{"id": "helmet_0", "bbox": [120, 80, 280, 180], "confidence": 0.88, "center": [200, 130]}],
        "vests": [{"id": "vest_0", "bbox": [110, 200, 290, 400], "confidence": 0.85, "center": [200, 300]}],
        "image_shape": {"width": 1920, "height": 1080},
        "raw_count": {"persons": 1, "helmets": 1, "vests": 1},
    }
    violations = analyzer._get_violations_for_test(detections, "CCTV_001")
    # No NO_HELMET or NO_VEST (intrusion check depends on bbox position)
    types = [v["type"] for v in violations]
    assert "NO_HELMET" not in types
    assert "NO_VEST" not in types


def test_danger_zone_intrusion(analyzer):
    """Person inside danger zone polygon should trigger INTRUSION."""
    # Place person center at (850, 550) - inside default blasting_zone [(500,300),(1200,300),(1200,800),(500,800)]
    detections = {
        "persons": [{"id": "person_0", "bbox": [700, 400, 1000, 700], "confidence": 0.9, "center": [850, 550]}],
        "helmets": [{"id": "helmet_0", "bbox": [720, 380, 980, 480], "confidence": 0.85, "center": [850, 430]}],
        "vests": [{"id": "vest_0", "bbox": [710, 490, 990, 680], "confidence": 0.82, "center": [850, 585]}],
        "image_shape": {"width": 1920, "height": 1080},
        "raw_count": {"persons": 1, "helmets": 1, "vests": 1},
    }
    violations = analyzer._get_violations_for_test(detections, "CCTV_001")
    types = [v["type"] for v in violations]
    assert "INTRUSION" in types


def test_severity_levels(analyzer, sample_detections):
    """Violations should have correct severity levels."""
    violations = analyzer._get_violations_for_test(sample_detections, "CCTV_001")
    for v in violations:
        assert v["severity"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def test_polygon_check_inside(analyzer):
    """_is_in_polygon should return True for point inside polygon."""
    polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]
    # bbox where center is (50, 50)
    bbox = [25, 25, 75, 75]
    assert analyzer._is_in_polygon(bbox, polygon) is True


def test_polygon_check_outside(analyzer):
    """_is_in_polygon should return False for point outside polygon."""
    polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]
    # bbox where center is (150, 150) - outside
    bbox = [125, 125, 175, 175]
    assert analyzer._is_in_polygon(bbox, polygon) is False


def test_has_protection_overlap(analyzer):
    """_has_protection should return True when PPE overlaps with person."""
    person_bbox = [100, 100, 300, 500]
    helmets = [{"bbox": [120, 80, 280, 200], "confidence": 0.9}]
    assert analyzer._has_protection(person_bbox, helmets) is True


def test_has_protection_no_overlap(analyzer):
    """_has_protection should return False when PPE doesn't overlap."""
    person_bbox = [100, 100, 300, 500]
    helmets = [{"bbox": [500, 500, 700, 700], "confidence": 0.9}]
    assert analyzer._has_protection(person_bbox, helmets) is False


def test_no_mask_violation_medium(analyzer):
    """Person without face mask should trigger NO_MASK violation with MEDIUM severity."""
    detections = {
        "persons": [{"id": "person_0", "bbox": [100, 100, 300, 500], "confidence": 0.9, "center": [200, 300]}],
        "helmets": [{"id": "helmet_0", "bbox": [120, 80, 280, 180], "confidence": 0.88, "center": [200, 130]}],
        "vests": [{"id": "vest_0", "bbox": [110, 200, 290, 400], "confidence": 0.85, "center": [200, 300]}],
        "masks": [],
        "cones": [],
        "machinery": [],
        "vehicles": [],
        "image_shape": {"width": 1920, "height": 1080},
        "raw_count": {"persons": 1, "helmets": 1, "vests": 1, "masks": 0, "cones": 0, "machinery": 0, "vehicles": 0},
    }
    violations = analyzer._get_violations_for_test(detections, "CCTV_001")
    types = [v["type"] for v in violations]
    severities = [v["severity"] for v in violations]
    assert "NO_MASK" in types
    assert "MEDIUM" in severities


def test_machinery_proximity_violation_low(analyzer):
    """Person near active machinery without safety cone should trigger MACHINERY_PROXIMITY violation with LOW severity."""
    detections = {
        "persons": [{"id": "person_0", "bbox": [100, 100, 300, 500], "confidence": 0.9, "center": [200, 300]}],
        "helmets": [{"id": "helmet_0", "bbox": [120, 80, 280, 180], "confidence": 0.88, "center": [200, 130]}],
        "vests": [{"id": "vest_0", "bbox": [110, 200, 290, 400], "confidence": 0.85, "center": [200, 300]}],
        "masks": [{"id": "mask_0", "bbox": [120, 110, 180, 150], "confidence": 0.9, "center": [200, 130]}],
        "cones": [],
        "machinery": [{"id": "machinery_0", "bbox": [300, 300, 400, 400], "confidence": 0.9, "center": [350, 350]}],
        "vehicles": [],
        "image_shape": {"width": 1920, "height": 1080},
        "raw_count": {"persons": 1, "helmets": 1, "vests": 1, "masks": 1, "cones": 0, "machinery": 1, "vehicles": 0},
    }
    # distance is math.sqrt((200-350)**2 + (300-350)**2) = math.sqrt(150**2 + 50**2) = math.sqrt(22500+2500) = 158 < 250
    violations = analyzer._get_violations_for_test(detections, "CCTV_001")
    types = [v["type"] for v in violations]
    severities = [v["severity"] for v in violations]
    assert "MACHINERY_PROXIMITY" in types
    assert "LOW" in severities


def test_bypass_no_vest_for_head_shoulders_only(analyzer):
    """Person with only head/shoulders visible (relative to helmet height) should bypass NO_VEST violation."""
    detections = {
        "persons": [{"id": "person_0", "bbox": [100, 100, 300, 200], "confidence": 0.9, "center": [200, 150]}],
        "helmets": [{"id": "helmet_0", "bbox": [120, 80, 280, 150], "confidence": 0.88, "center": [200, 115]}],
        "vests": [],
        "masks": [{"id": "mask_0", "bbox": [120, 110, 180, 150], "confidence": 0.9, "center": [200, 130]}],
        "cones": [],
        "machinery": [],
        "vehicles": [],
        "image_shape": {"width": 1920, "height": 1080},
        "raw_count": {"persons": 1, "helmets": 1, "vests": 0, "masks": 1, "cones": 0, "machinery": 0, "vehicles": 0},
    }
    # Person bbox height is 200 - 100 = 100.
    # Helmet bbox height is 150 - 80 = 70.
    # 100 < 3.0 * 70 (210), so torso is deemed not visible.
    violations = analyzer._get_violations_for_test(detections, "CCTV_001")
    types = [v["type"] for v in violations]
    
    # Helmet is worn, so no NO_HELMET.
    # Vest is missing, but torso is not visible, so NO_VEST should be bypassed.
    assert "NO_VEST" not in types
    assert "NO_HELMET" not in types


