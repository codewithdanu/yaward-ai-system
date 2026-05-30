import logging
import numpy as np
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Actual model class names (lowercased from yolov8_ppe.pt) ──────────────────
# {0: 'Excavator', 1: 'Gloves', 2: 'Hardhat', 3: 'Ladder', 4: 'Mask',
#  5: 'NO-Hardhat', 6: 'NO-Mask', 7: 'NO-Safety Vest', 8: 'Person',
#  9: 'SUV', 10: 'Safety Cone', 11: 'Safety Vest', 12: 'bus', 13: 'dump truck',
#  14: 'fire hydrant', 15: 'machinery', 16: 'mini-van', 17: 'sedan',
#  18: 'semi', 19: 'trailer', 20: 'truck', 21: 'truck and trailer',
#  22: 'van', 23: 'vehicle', 24: 'wheel loader'}
#
# After .lower():
#   "person", "hardhat", "safety vest", "mask", "gloves", "ladder",
#   "no-hardhat", "no-mask", "no-safety vest",
#   "safety cone", "machinery", "excavator", "wheel loader",
#   "suv", "bus", "dump truck", "mini-van", "sedan", "semi",
#   "trailer", "truck", "truck and trailer", "van", "vehicle"

# ── Daytime hours (06:00 – 18:00 local) → high confidence mode ───────────────
# Nighttime  (18:00 – 06:00 local) → relaxed confidence mode
DAYTIME_START_HOUR = 6    # 06:00
DAYTIME_END_HOUR   = 18   # 18:00

# Base thresholds per time-of-day
DAYTIME_BASE  = 0.80   # pagi-sore : minimum 80 %
NIGHTTIME_BASE = 0.70  # malam     : minimum 70 %

# Per-class offsets applied ON TOP of the base threshold.
# Negative offset  → allow slightly lower confidence (e.g. direct violation signals).
# Zero             → use base threshold directly.
# Classes not listed here fall back to the base threshold (strictest).
CLASS_OFFSETS = {
    # Workers — must be very confident before applying safety rules
    "person":            0.00,
    # PPE present — slightly below base is fine, false-positives less harmful
    "hardhat":          -0.05,
    "safety vest":      -0.05,
    "mask":             -0.05,
    "gloves":           -0.05,
    # PPE absent (direct violation) — allow a bit more sensitivity
    "no-hardhat":       -0.10,
    "no-safety vest":   -0.10,
    "no-mask":          -0.10,
    # Site equipment
    "ladder":           -0.05,
    "safety cone":      -0.05,
    "machinery":        -0.05,
    "excavator":        -0.05,
    "wheel loader":     -0.05,
    # Vehicles
    "suv":              -0.05,
    "bus":              -0.05,
    "dump truck":       -0.05,
    "mini-van":         -0.05,
    "sedan":            -0.05,
    "semi":             -0.05,
    "trailer":          -0.05,
    "truck":            -0.05,
    "truck and trailer":-0.05,
    "van":              -0.05,
    "vehicle":          -0.05,
    "fire hydrant":      0.00,
}


def _is_daytime() -> bool:
    """Return True if current local time is within daytime hours."""
    hour = datetime.now().hour
    return DAYTIME_START_HOUR <= hour < DAYTIME_END_HOUR


def get_class_threshold(class_name: str) -> float:
    """
    Return the confidence threshold for *class_name* based on current time of day.

    Daytime  (06:00–18:00): base = 0.80
    Nighttime(18:00–06:00): base = 0.70

    Per-class offsets are added to the base (can be negative to allow
    slightly lower confidence for specific classes such as direct
    violation signals like 'no-hardhat').
    """
    base   = DAYTIME_BASE if _is_daytime() else NIGHTTIME_BASE
    offset = CLASS_OFFSETS.get(class_name, 0.0)
    return max(0.30, base + offset)  # never drop below 30 % floor


class YAWardDetector:
    """
    YOLOv8-based object detector for YAWard safety monitoring system.

    Detects (from yolov8_ppe.pt):
      - persons (workers)
      - helmets / no-helmets (hardhats)
      - vests / no-vests (safety vests)
      - masks / no-masks
      - site machinery, vehicles, safety cones
    """

    def __init__(self, model_path: str = "yolov8m.pt", confidence_threshold: float = 0.5, iou_threshold: float = 0.45):
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self._model = None
        self._initialized = False

    def _ensure_model(self):
        """Lazy-load the YOLOv8 model on first use."""
        if not self._initialized:
            try:
                from ultralytics import YOLO
                import torch

                device = "cuda" if torch.cuda.is_available() else "cpu"
                logger.info(f"Loading YOLOv8 model '{self.model_path}' on device: {device}")
                self._model = YOLO(self.model_path)
                self._model.to(device)
                self._initialized = True
                logger.info(f"YOLOv8 model loaded. Classes: {list(self._model.names.values())}")
            except ImportError:
                logger.error("ultralytics not installed. Run: pip install ultralytics")
                raise
            except Exception as e:
                logger.error(f"Failed to load YOLOv8 model: {e}")
                raise

    def detect(self, image_input) -> dict:
        """
        Detect objects in image.

        Args:
            image_input: file path (str/Path), or numpy array (BGR)

        Returns:
            dict with keys: persons, helmets, no_helmets, vests, no_vests,
                            masks, no_masks, cones, machinery, vehicles,
                            image_shape, raw_count
        """
        self._ensure_model()

        import cv2

        # Load image
        if isinstance(image_input, (str, Path)):
            image = cv2.imread(str(image_input))
            if image is None:
                raise ValueError(f"Cannot read image: {image_input}")
        elif isinstance(image_input, np.ndarray):
            image = image_input
        else:
            raise TypeError(f"Unsupported image type: {type(image_input)}")

        # Collect raw candidates at low base confidence; per-class time-aware
        # filtering (70–80%) is applied in _parse_results after time-of-day check.
        base_conf = 0.25
        results = self._model(
            image,
            conf=base_conf,
            iou=self.iou_threshold,
            verbose=False,
        )

        return self._parse_results(results, image.shape)

    def detect_from_bytes(self, image_bytes: bytes) -> dict:
        """
        Detect from raw image bytes (useful for API uploads).

        Args:
            image_bytes: raw JPEG/PNG bytes

        Returns:
            dict with detection results
        """
        import cv2
        import numpy as np

        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Cannot decode image bytes.")
        return self.detect(image)

    def _parse_results(self, results, image_shape: tuple) -> dict:
        """Parse YOLOv8 results into YAWard structured format."""
        h, w = image_shape[:2]

        persons   = []
        helmets   = []   # "hardhat"
        no_helmets = []  # "no-hardhat"
        vests     = []   # "safety vest"
        no_vests  = []   # "no-safety vest"
        masks     = []   # "mask"
        no_masks  = []   # "no-mask"
        cones     = []
        machinery = []
        vehicles  = []

        for r in results:
            boxes = r.boxes
            for i, box in enumerate(boxes):
                cls_id = int(box.cls[0])
                conf   = float(box.conf[0])
                bbox   = box.xyxy[0].tolist()  # [x1, y1, x2, y2]

                # Lowercase to normalise (model uses Title Case)
                class_name = self._model.names[cls_id].lower()

                # ── Per-class, time-aware confidence gate ────────────────
                # Daytime  (06–18): base 80 % | Nighttime (18–06): base 70 %
                min_conf = get_class_threshold(class_name)
                if conf < min_conf:
                    logger.debug(f"Skip {class_name} conf={conf:.2f} < {min_conf:.2f} ({'day' if _is_daytime() else 'night'})")
                    continue

                logger.info(f"Detection [{('day' if _is_daytime() else 'night')}]: class={class_name}, conf={conf:.3f}")

                obj_data = {
                    "id": f"{class_name}_{i}",
                    "bbox": bbox,
                    "confidence": round(conf, 4),
                    "center": [
                        round((bbox[0] + bbox[2]) / 2, 2),
                        round((bbox[1] + bbox[3]) / 2, 2),
                    ],
                    "class": class_name,
                }

                # ── Route to the correct bucket ───────────────────────────
                if class_name == "person":
                    bbox_w = bbox[2] - bbox[0]
                    bbox_h = bbox[3] - bbox[1]
                    area   = bbox_w * bbox_h

                    # Reject tiny blobs
                    if area < 750:
                        logger.debug(f"Skip tiny person (area={area:.0f}px²)")
                        continue

                    # Reject implausible aspect ratios
                    aspect = bbox_w / max(bbox_h, 1)
                    if aspect > 1.5 or aspect < 0.10:
                        logger.debug(f"Skip person bad aspect ({aspect:.2f})")
                        continue

                    persons.append(obj_data)

                elif class_name == "hardhat":
                    helmets.append(obj_data)

                elif class_name == "no-hardhat":
                    no_helmets.append(obj_data)

                elif class_name == "safety vest":
                    vests.append(obj_data)

                elif class_name == "no-safety vest":
                    no_vests.append(obj_data)

                elif class_name == "mask":
                    masks.append(obj_data)

                elif class_name == "no-mask":
                    no_masks.append(obj_data)

                elif class_name == "safety cone":
                    cones.append(obj_data)

                elif class_name in ("machinery", "excavator", "wheel loader"):
                    machinery.append(obj_data)

                elif class_name in (
                    "suv", "bus", "dump truck", "mini-van", "sedan",
                    "semi", "trailer", "truck", "truck and trailer",
                    "van", "vehicle",
                ):
                    vehicles.append(obj_data)

                # Other classes (ladder, gloves, fire hydrant) are logged but not bucketed

        return {
            "persons":    persons,
            "helmets":    helmets,
            "no_helmets": no_helmets,
            "vests":      vests,
            "no_vests":   no_vests,
            "masks":      masks,
            "no_masks":   no_masks,
            "cones":      cones,
            "machinery":  machinery,
            "vehicles":   vehicles,
            "image_shape": {"width": w, "height": h},
            "raw_count": {
                "persons":    len(persons),
                "helmets":    len(helmets),
                "no_helmets": len(no_helmets),
                "vests":      len(vests),
                "no_vests":   len(no_vests),
                "masks":      len(masks),
                "no_masks":   len(no_masks),
                "cones":      len(cones),
                "machinery":  len(machinery),
                "vehicles":   len(vehicles),
            },
        }

    def get_model_info(self) -> dict:
        """Return model metadata."""
        self._ensure_model()
        return {
            "model": self.model_path,
            "confidence_threshold": self.confidence_threshold,
            "iou_threshold": self.iou_threshold,
            "classes": list(self._model.names.values()),
        }
