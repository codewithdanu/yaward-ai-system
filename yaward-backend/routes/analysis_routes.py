import logging
import os
import tempfile
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, Response

from models.yolov8_detector import YAWardDetector
from models.safety_analyzer import SafetyAnalyzer
from services.alert_service import AlertService
from services.image_utils import enhance_night_vision_frame, annotate_frame_with_detections

logger = logging.getLogger(__name__)

analysis_bp = Blueprint("analysis", __name__, url_prefix="/api")

# Singletons (lazy-loaded in first request)
_detector: YAWardDetector = None
_analyzer: SafetyAnalyzer = None
_alert_service: AlertService = AlertService()

# Global cache for last analyzed frame per camera (Key: cctv_id, Value: bytes of JPEG)
LAST_FRAMES = {}


def get_detector() -> YAWardDetector:
    global _detector
    if _detector is None:
        model_path = current_app.config.get("MODEL_PATH", "yolov8m.pt")
        confidence = current_app.config.get("CONFIDENCE_THRESHOLD", 0.5)
        iou = current_app.config.get("IOU_THRESHOLD", 0.45)
        _detector = YAWardDetector(model_path, confidence, iou)
    return _detector


def get_analyzer() -> SafetyAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = SafetyAnalyzer()
    return _analyzer


# ─────────────────────────── ROUTES ─────────────────────────────────────


@analysis_bp.route("/analyze", methods=["POST"])
def analyze_frame():
    """
    POST /api/analyze
    
    Accepts:
      - JSON body: { "image_path": "...", "cctv_id": "..." }
      - OR multipart/form-data with file upload: cctv_id + image file
    
    Returns:
      Detection results + violations found
    """
    global LAST_FRAMES
    cctv_id = None
    image_bytes = None
    image_path = None

    # ── Handle multipart file upload ──
    if request.content_type and "multipart/form-data" in request.content_type:
        cctv_id = request.form.get("cctv_id", "UNKNOWN")
        file = request.files.get("image")
        if not file:
            return jsonify({"error": "No image file provided"}), 400
        image_bytes = file.read()

    # ── Handle JSON body ──
    else:
        data = request.get_json(silent=True) or {}
        cctv_id = data.get("cctv_id", "UNKNOWN")
        image_path = data.get("image_path")

        if not image_path:
            return jsonify({"error": "Missing 'image_path' in request body"}), 400

        if not os.path.exists(image_path):
            return jsonify({"error": f"Image file not found: {image_path}"}), 404

    # ── Run detection ──
    try:
        detector = get_detector()
        analyzer = get_analyzer()

        if image_bytes:
            detections = detector.detect_from_bytes(image_bytes)
            raw_bytes = image_bytes
        else:
            detections = detector.detect(image_path)
            with open(image_path, "rb") as f:
                raw_bytes = f.read()

        violations = analyzer.analyze(detections, cctv_id, image_bytes=raw_bytes)

        # Annotate raw frame with bounding boxes and active warnings before caching
        try:
            annotated_bytes = annotate_frame_with_detections(raw_bytes, detections, violations)
            LAST_FRAMES[cctv_id] = annotated_bytes
        except Exception as drawing_err:
            logger.warning(f"Failed to annotate frame for {cctv_id}: {drawing_err}")
            LAST_FRAMES[cctv_id] = raw_bytes

        # Send email alerts for critical violations
        if violations:
            _alert_service.send_alerts(violations, cctv_id)

        return jsonify({
            "status": "success",
            "cctv_id": cctv_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "detections": {
                "persons": detections["persons"],
                "helmets": detections["helmets"],
                "vests": detections["vests"],
                "counts": detections["raw_count"],
            },
            "violations": violations,
            "alert_triggered": len(violations) > 0,
        }), 200

    except ValueError as e:
        logger.warning(f"Bad image input: {e}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        return jsonify({"error": "Internal analysis error", "detail": str(e)}), 500


@analysis_bp.route("/cameras/<cctv_id>/live", methods=["GET"])
def get_live_frame(cctv_id):
    """
    GET /api/cameras/<cctv_id>/live
    Returns the last analyzed frame for the given camera as a JPEG image.
    """
    global LAST_FRAMES
    image_bytes = LAST_FRAMES.get(cctv_id)
    if not image_bytes:
        return jsonify({"error": "No live feed available. Run simulator script or upload an image."}), 404
        
    return Response(image_bytes, mimetype="image/jpeg")


def check_rtsp_reachable(rtsp_url: str, timeout: float = 1.0) -> bool:
    """
    Parses the IP and port from the RTSP URL and checks if the port is open/reachable.
    Returns True if reachable, False otherwise.
    """
    import socket
    from urllib.parse import urlparse
    
    # Check if RTSP URL is a local webcam index (e.g. "0")
    if rtsp_url.strip().isdigit():
        return True
        
    try:
        parsed = urlparse(rtsp_url)
        netloc = parsed.netloc
        if "@" in netloc:
            netloc = netloc.split("@")[1]
            
        if ":" in netloc:
            ip, port = netloc.split(":")
            port = int(port)
        else:
            ip = netloc
            port = 554 # Default RTSP port
            
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        result = s.connect_ex((ip, port))
        s.close()
        return result == 0
    except Exception as e:
        logger.warning(f"Failed to check RTSP reachability for {rtsp_url}: {e}")
        return False


def gen_live_stream(rtsp_url, cctv_id, detector, analyzer, app):
    """
    Generator that opens an RTSP/webcam stream, runs YOLOv8 PPE detection on frames,
    draws bounding boxes, and streams MJPEG back to the browser.
    """
    global LAST_FRAMES
    import cv2
    import numpy as np
    
    logger.info(f"Starting real-time RTSP stream for {cctv_id} at {rtsp_url}")
    
    # Fast reachability check to prevent thread deadlock in synchronous Gunicorn workers
    if not check_rtsp_reachable(rtsp_url, timeout=1.0):
        logger.error(f"RTSP stream host is unreachable from inside the Docker container: {rtsp_url}")
        return
        
    # Check if RTSP URL is actually a numeric camera index (for local webcam testing)
    try:
        source = int(rtsp_url)
    except ValueError:
        source = rtsp_url
        # Force TCP and set short socket timeout for OpenCV video capture to prevent indefinite blocking
        import os
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;2000000"
        
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        logger.error(f"Cannot open RTSP/video source: {rtsp_url}")
        return
        
    frame_count = 0
    last_detections = {
        "persons": [],
        "helmets": [],
        "vests": []
    }
    
    consecutive_failures = 0
    last_valid_frame = None
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                consecutive_failures += 1
                logger.warning(f"RTSP stream read failed ({consecutive_failures}) for {cctv_id}")
                
                import time
                time.sleep(0.1) # Wait 100ms before retrying
                
                # If we have a previously cached frame, yield it with the "Camera Disconnected" banner overlay
                if last_valid_frame is not None:
                    overlay_frame = last_valid_frame.copy()
                    h_img, w_img = overlay_frame.shape[:2]
                    
                    # Draw a semi-transparent red banner at the top
                    banner_overlay = overlay_frame.copy()
                    cv2.rectangle(banner_overlay, (0, 0), (w_img, 45), (0, 0, 255), -1)
                    cv2.addWeighted(banner_overlay, 0.75, overlay_frame, 0.25, 0, overlay_frame)
                    
                    cv2.putText(overlay_frame, f"WARNING: {cctv_id} DISCONNECTED - RECONNECTING...", (15, 28),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
                                
                    success, jpeg_buf = cv2.imencode('.jpg', overlay_frame)
                    if success:
                        frame_bytes = jpeg_buf.tobytes()
                        LAST_FRAMES[cctv_id] = frame_bytes
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n\r\n')
                
                if consecutive_failures >= 15: # ~1.5 seconds of failure
                    logger.info(f"Attempting to reconnect RTSP stream for {cctv_id}...")
                    cap.release()
                    time.sleep(1.0) # Wait 1 second before trying to open again
                    cap = cv2.VideoCapture(source)
                    if not cap.isOpened():
                        logger.error(f"Reconnection attempt failed for {cctv_id}")
                        if consecutive_failures > 90: # ~1.5 minutes of continuous failure
                            logger.error(f"RTSP connection completely lost for {cctv_id}. Stopping stream.")
                            break
                    else:
                        logger.info(f"RTSP stream successfully reconnected for {cctv_id}!")
                        consecutive_failures = 0
                continue
                
            # If successful, reset failure count
            consecutive_failures = 0
            
            # Optimize resolution for real-time monitoring and AI inference to save CPU and bandwidth
            h_orig, w_orig = frame.shape[:2]
            if w_orig > 960:
                scale = 960.0 / w_orig
                new_h = int(h_orig * scale)
                frame = cv2.resize(frame, (960, new_h))
                
            last_valid_frame = frame.copy()
            
            frame_count += 1
            
            # Run AI detection every 6 frames to keep CPU usage perfectly light (approx. 5 times per sec)
            if frame_count % 6 == 1:
                try:
                    detections = detector.detect(frame)
                    last_detections = detections
                    
                    # Analyze for safety violations within the Flask app context!
                    with app.app_context():
                        success_enc, jpeg_buf = cv2.imencode('.jpg', frame)
                        frame_bytes = jpeg_buf.tobytes() if success_enc else None
                        violations = analyzer.analyze(detections, cctv_id, image_bytes=frame_bytes)
                        if violations:
                            _alert_service.send_alerts(violations, cctv_id)
                        
                        # Explicitly clean up and return the DB connection to the pool
                        from database_models import db
                        db.session.remove()
                except Exception as e:
                    logger.error(f"AI live detection failed: {e}")
            
            # Draw bounding boxes from last_detections on the frame
            # Persons (Blue)
            for p in last_detections.get("persons", []):
                box = p.get("bbox", [0, 0, 0, 0])
                cv2.rectangle(frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (255, 100, 0), 2)
                cv2.putText(frame, f"Worker {p.get('confidence', 0):.2f}", (int(box[0]), int(box[1]) - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 100, 0), 1)
                            
            # Helmets (Green)
            for h in last_detections.get("helmets", []):
                box = h.get("bbox", [0, 0, 0, 0])
                cv2.rectangle(frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (0, 255, 0), 2)
                cv2.putText(frame, "Helmet", (int(box[0]), int(box[1]) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)
                            
            # Vests (Orange/Yellow)
            for v in last_detections.get("vests", []):
                box = v.get("bbox", [0, 0, 0, 0])
                cv2.rectangle(frame, (int(box[0]), int(box[1])), (int(box[2]), int(box[3])), (0, 165, 255), 2)
                cv2.putText(frame, "Vest", (int(box[0]), int(box[1]) - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 165, 255), 1)
 
            # Draw camera overlays for ultra-premium look
            cv2.putText(frame, f"YAWard AI Live: {cctv_id}", (15, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            cv2.putText(frame, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), (15, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                        
            # Compress processed frame as JPEG
            success, jpeg_buf = cv2.imencode('.jpg', frame)
            if not success:
                continue
                
            frame_bytes = jpeg_buf.tobytes()
            
            # Cache the latest processed frame in our global LAST_FRAMES cache
            LAST_FRAMES[cctv_id] = frame_bytes
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n\r\n')
                   
    finally:
        cap.release()
        logger.info(f"Released RTSP stream source for {cctv_id}")
 
 
@analysis_bp.route("/cameras/<cctv_id>/stream", methods=["GET"])
def get_live_stream_feed(cctv_id):
    """
    GET /api/cameras/<cctv_id>/stream?rtsp=<rtsp_url>
    Establishes a real-time MJPEG live stream, decodes the RTSP stream,
    runs YOLOv8 PPE detection on it, and streams the output directly to the browser.
    """
    rtsp_url = request.args.get("rtsp")
    if not rtsp_url:
        return jsonify({"error": "Missing 'rtsp' query parameter"}), 400
        
    # Resolve singletons within Flask active application context
    detector = get_detector()
    analyzer = get_analyzer()
    
    # Get the raw flask application instance
    app = current_app._get_current_object()
    
    return Response(
        gen_live_stream(rtsp_url, cctv_id, detector, analyzer, app),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@analysis_bp.route("/statistics", methods=["GET"])
def get_statistics():
    """
    GET /api/statistics?period=today|week|month|all
    Returns aggregated dashboard statistics.
    """
    period = request.args.get("period", "today")
    valid_periods = ["today", "week", "month", "all"]

    if period not in valid_periods:
        return jsonify({"error": f"Invalid period. Choose from: {valid_periods}"}), 400

    try:
        analyzer = get_analyzer()
        stats = analyzer.get_statistics(period)
        return jsonify({"status": "success", "statistics": stats}), 200
    except Exception as e:
        logger.error(f"Statistics error: {e}", exc_info=True)
        return jsonify({"error": "Failed to compute statistics"}), 500


@analysis_bp.route("/model-info", methods=["GET"])
def model_info():
    """GET /api/model-info — Return model metadata."""
    try:
        detector = get_detector()
        info = detector.get_model_info()
        return jsonify({"status": "success", "model_info": info}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
