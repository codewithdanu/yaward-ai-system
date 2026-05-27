import logging
import cv2
import numpy as np

logger = logging.getLogger(__name__)


def enhance_night_vision_frame(frame):
    """
    Auto-enhance dark / infrared night-vision frames so they are clearly visible.
    Applies CLAHE per luminance channel + gamma correction to lift shadows.
    Only activates when mean brightness < 80.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_brightness = gray.mean()

    if mean_brightness >= 80:
        return frame  # Already bright enough

    # Enhance luminance channel via CLAHE in LAB space
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_ch)

    # Gamma < 1 brightens dark pixels
    gamma = 0.55
    lut = np.array([min(255, int((i / 255.0) ** gamma * 255)) for i in range(256)], dtype=np.uint8)
    l_enhanced = cv2.LUT(l_enhanced, lut)

    lab_enhanced = cv2.merge([l_enhanced, a_ch, b_ch])
    enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
    logger.debug(f"Night-vision enhancement applied (mean brightness was {mean_brightness:.1f})")
    return enhanced


def annotate_frame_with_detections(image_bytes: bytes, detections: dict, violations: list) -> bytes:
    """
    Decodes image bytes, auto-enhances dark/IR frames, draws annotated bounding boxes
    for all detections and per-violation warning overlays, then re-encodes to JPEG.
    """
    # Decode image bytes to OpenCV frame
    nparr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return image_bytes

    # ── Auto-enhance night-vision / dark IR frames ─────────────────────
    frame = enhance_night_vision_frame(frame)

    persons = detections.get("persons", [])
    helmets = detections.get("helmets", [])
    vests   = detections.get("vests", [])
    masks   = detections.get("masks", [])
    cones   = detections.get("cones", [])
    machinery = detections.get("machinery", [])
    vehicles  = detections.get("vehicles", [])

    # 1. Draw Persons (Workers) ─ cyan box with label
    for p in persons:
        box = p.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        conf = p.get('confidence', 0)
        person_id = p.get("id")

        has_no_helmet = any(v.get("type") == "NO_HELMET" and v.get("person_id") == person_id for v in violations)
        has_no_vest   = any(v.get("type") == "NO_VEST"   and v.get("person_id") == person_id for v in violations)
        has_intrusion = any(v.get("type") == "INTRUSION" and v.get("person_id") == person_id for v in violations)
        has_no_mask   = any(v.get("type") == "NO_MASK"   and v.get("person_id") == person_id for v in violations)
        has_unsafe_pr = any(v.get("type") == "MACHINERY_PROXIMITY" and v.get("person_id") == person_id for v in violations)
        has_violation = has_no_helmet or has_no_vest or has_intrusion or has_no_mask or has_unsafe_pr

        box_color = (0, 0, 255) if has_violation else (0, 200, 255)  # Red if violation, cyan otherwise
        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)

        # Label with background
        label = f"Worker  {conf:.0%}"
        (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame, (x1, y1 - lh - 8), (x1 + lw + 6, y1), box_color, -1)
        cv2.putText(frame, label, (x1 + 3, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

        # Violation warning text inside box
        warn_y = y1 + 24
        if has_no_helmet:
            cv2.putText(frame, "! NO HELMET", (x1 + 6, warn_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 50, 255), 2)
            warn_y += 22
        if has_no_vest:
            cv2.putText(frame, "! NO SAFETY VEST", (x1 + 6, warn_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 50, 255), 2)
            warn_y += 22
        if has_intrusion:
            cv2.putText(frame, "! DANGER ZONE", (x1 + 6, warn_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            warn_y += 22
        if has_no_mask:
            cv2.putText(frame, "! NO FACE MASK", (x1 + 6, warn_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 100, 0), 2)
            warn_y += 22
        if has_unsafe_pr:
            cv2.putText(frame, "! MACHINERY HAZARD", (x1 + 6, warn_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 2)

    # 2. Draw Helmets (Bright Green)
    for h in helmets:
        box = h.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 80), 2)
        cv2.putText(frame, "Helmet", (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 80), 1)

    # 3. Draw Vests (Orange)
    for vest in vests:
        box = vest.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 165, 255), 2)
        cv2.putText(frame, "Vest", (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 165, 255), 1)

    # 4. Draw Masks (Yellow/Cyan)
    for mask in masks:
        box = mask.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 0), 2)
        cv2.putText(frame, "Mask", (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1)

    # 5. Draw Safety Cones (Yellow/Orange)
    for cone in cones:
        box = cone.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
        cv2.putText(frame, "Cone", (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

    # 6. Draw Machinery & Vehicles (Purple/Pink)
    for mach in machinery + vehicles:
        box = mach.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 255), 2)
        cv2.putText(frame, mach["class"].capitalize(), (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 255), 1)

    # Watermark overlay
    cv2.putText(frame, "YAWard AI PPE Monitor", (15, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 128), 2)

    # Re-encode to JPEG (quality 90 keeps bounding box crisp)
    success, jpeg_buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        return image_bytes

    return jpeg_buf.tobytes()
