"""Quick smoke-test for the new explicit-signal-only violation rules."""
import sys
sys.path.insert(0, '/app')

from models.safety_analyzer import SafetyAnalyzer

analyzer = SafetyAnalyzer()

PERSON = [{'id': 'person_0', 'bbox': [100, 100, 200, 400], 'confidence': 0.85, 'center': [150, 250], 'class': 'person'}]
PERSON_BBOX = PERSON[0]['bbox']

NO_HELMET_BOX = [{'id': 'no-hardhat_1', 'bbox': [120, 100, 180, 150], 'confidence': 0.75, 'center': [150, 125], 'class': 'no-hardhat'}]
NO_VEST_BOX   = [{'id': 'no-safety vest_2', 'bbox': [110, 150, 190, 300], 'confidence': 0.71, 'center': [150, 225], 'class': 'no-safety vest'}]

def make_det(no_helmets=None, no_vests=None):
    return {
        'persons': PERSON,
        'helmets': [], 'no_helmets': no_helmets or [],
        'vests':   [], 'no_vests':   no_vests   or [],
        'masks': [], 'no_masks': [],
        'cones': [], 'machinery': [], 'vehicles': [],
        'image_shape': {'width': 640, 'height': 480},
    }

# Case 1: civilian — person detected but NO model PPE-violation signals
v = analyzer._get_violations_for_test(make_det(), 'TEST-001')
assert len(v) == 0, f"FAIL: civilian got {len(v)} violations: {[x['type'] for x in v]}"
print("PASS: Civilian (no model signals) → 0 violations")

# Case 2: worker with no helmet signal from model
v = analyzer._get_violations_for_test(make_det(no_helmets=NO_HELMET_BOX), 'TEST-001')
types = [x['type'] for x in v]
assert 'NO_HELMET' in types, f"FAIL: expected NO_HELMET, got {types}"
assert 'NO_VEST'   not in types, f"FAIL: NO_VEST should not fire without signal"
print(f"PASS: No-Helmet signal → {types}")

# Case 3: worker with both signals
v = analyzer._get_violations_for_test(make_det(no_helmets=NO_HELMET_BOX, no_vests=NO_VEST_BOX), 'TEST-001')
types = [x['type'] for x in v]
assert 'NO_HELMET' in types, f"FAIL: missing NO_HELMET"
assert 'NO_VEST'   in types, f"FAIL: missing NO_VEST"
print(f"PASS: Both signals     → {types}")

print("\nAll tests passed ✅")
