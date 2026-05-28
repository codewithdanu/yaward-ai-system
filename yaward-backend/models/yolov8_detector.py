import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)


class YAWardDetector:
    """
    YOLOv8-based object detector for YAWard safety monitoring system.
    
    Detects:
      - persons (workers)
      - helmets (hard hats)
      - vests (safety vests)
    """

    def __init__(self, model_path: str = "yolov8m.pt", confidence_threshold: float = 0.7, iou_threshold: float = 0.45):
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
                logger.info("YOLOv8 model loaded successfully.")
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
            dict with keys: persons, helmets, vests, image_shape, raw_count
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

        # Run inference with a lower base threshold so class-specific thresholds can filter them afterwards
        base_conf = min(self.confidence_threshold, 0.55)
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
        persons = []
        helmets = []
        vests = []
        masks = []
        no_masks = []
        cones = []
        machinery = []
        vehicles = []

        for r in results:
            boxes = r.boxes
            for i, box in enumerate(boxes):
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                bbox = box.xyxy[0].tolist()  # [x1, y1, x2, y2] absolute pixels

                class_name = self._model.names[cls_id].lower()

                # ── Class-specific confidence thresholds filter ──
                class_thresholds = {
                    "person": 0.80,
                    "helmet": 0.65,
                    "hard hat": 0.65,
                    "hardhat": 0.65,
                    "vest": 0.65,
                    "safety vest": 0.65,
                    "safety-vest": 0.65,
                }
                # Fallback to the configured model's base confidence threshold or 0.65
                min_conf = class_thresholds.get(class_name, max(self.confidence_threshold, 0.65))
                if conf < min_conf:
                    logger.debug(f"Skipping {class_name} detection due to confidence below class-specific threshold: {conf:.2f} < {min_conf:.2f}")
                    continue

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

                if class_name == "person":
                    # ── Anti false-positive filters for person detections ──
                    bbox_w = bbox[2] - bbox[0]
                    bbox_h = bbox[3] - bbox[1]
                    area = bbox_w * bbox_h

                    # 1. Minimum area: ignore tiny blobs (< 3000 px²)
                    if area < 3000:
                        logger.debug(f"Skipping tiny person bbox (area={area:.0f}px²)")
                        continue

                    # 2. Aspect ratio guard: a real person is taller than wide
                    #    but not an absurdly thin vertical sliver (railings, poles)
                    aspect = bbox_w / max(bbox_h, 1)
                    if aspect > 1.5:
                        # Too wide — looks like a horizontal object, not a person
                        logger.debug(f"Skipping wide person bbox (aspect={aspect:.2f})")
                        continue
                    if aspect < 0.10:
                        # Extremely thin vertical sliver — likely a pole/railing
                        logger.debug(f"Skipping ultra-thin person bbox (aspect={aspect:.2f})")
                        continue

                    persons.append(obj_data)
                elif class_name in ("helmet", "hard hat", "hardhat"):
                    helmets.append(obj_data)
                elif class_name in ("vest", "safety vest", "safety-vest"):
                    vests.append(obj_data)
                elif class_name in ("mask", "no-hardhat", "no-hardhat_"):
                    # Treat 'no-hardhat' class similarly if needed, or focus on mask
                    if class_name == "mask":
                        masks.append(obj_data)
                elif class_name == "no-mask":
                    no_masks.append(obj_data)
                elif class_name in ("safety cone", "safety-cone", "cone"):
                    cones.append(obj_data)
                elif class_name == "machinery":
                    machinery.append(obj_data)
                elif class_name == "vehicle":
                    vehicles.append(obj_data)

        return {
            "persons": persons,
            "helmets": helmets,
            "vests": vests,
            "masks": masks,
            "no_masks": no_masks,
            "cones": cones,
            "machinery": machinery,
            "vehicles": vehicles,
            "image_shape": {"width": w, "height": h},
            "raw_count": {
                "persons": len(persons),
                "helmets": len(helmets),
                "vests": len(vests),
                "masks": len(masks),
                "no_masks": len(no_masks),
                "cones": len(cones),
                "machinery": len(machinery),
                "vehicles": len(vehicles),
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
