"""
process_stream.py — Main per-camera inference loop.

Reads frames from an RTSP/camera stream, runs YOLO inference, then dispatches
to the appropriate detector module based on model_type.
"""

import time
import threading
from urllib.parse import quote_plus

import cv2
import torch
import ultralytics
from ultralytics import YOLO

from config import (
    ai_logger, _trackers_lock, object_trackers,
    EVENT_COOLDOWN,
)
from rules import (
    config_cache, get_config_lock, is_within_schedule,
)
from model_hub import get_model_path as hub_get_model_path

# Import all detector modules
from detectors import dress_code, crowd, tamper, loitering, fall, fight
from detectors import abandoned, parking, face, plate, standard


def process_stream(camera, model, stop_event):
    """Main processing loop for a single camera + model pair."""
    model_name = model.get('name', 'Unknown Model')
    model_type = model.get('model_type', 'other')

    ai_logger.info(f"[{camera['name']}] Starting {model_name} ({model_type})")

    # Use model_hub to resolve the correct weights for this model type
    local_model_path = hub_get_model_path(model_type, model.get('model_path', '') or '')
    if not local_model_path:
        local_model_path = None

    if local_model_path is None and model_type not in ('camera_tamper_detection', 'motion_detection', 'flood_detection'):
        ai_logger.error(f"[{model_name}] No model path resolved — aborting.")
        return

    ai_model = None

    # Stage 1: attempt safe load (PyTorch ≥ 2.6 default)
    try:
        torch.serialization.add_safe_globals([
            ultralytics.nn.tasks.DetectionModel,
            ultralytics.nn.tasks.SegmentationModel,
            ultralytics.nn.tasks.PoseModel,
        ])
        ai_model = YOLO(local_model_path)
    except Exception as _e1:
        # Stage 2: fallback — allow arbitrary globals for trusted local model files
        # Needed for HuggingFace weights (face, plate, weapon, PPE) that contain
        # extra serialised classes not in the safe-globals whitelist.
        ai_logger.warning(
            f"[{model_name}] Safe load failed ({type(_e1).__name__}), "
            f"retrying with weights_only=False…"
        )
        _orig_load = torch.load
        try:
            torch.load = lambda *a, **kw: _orig_load(  # type: ignore[assignment]
                *a, **{**kw, "weights_only": False}
            )
            ai_model = YOLO(local_model_path)
            ai_logger.info(f"[{model_name}] Model loaded with weights_only=False fallback.")
        except Exception as _e2:
            ai_logger.error(f"[{model_name}] Failed to load model: {_e2}")
            return
        finally:
            torch.load = _orig_load  # always restore


    # Use the real RTSP URL (location field) for direct camera access
    stream_source = (camera.get('location') or camera.get('stream_url') or '').strip()

    # Inject credentials if provided and not already in URL
    username = camera.get('username')
    password = camera.get('password')
    if username and password and '@' not in stream_source:
        try:
            scheme, address = stream_source.split('://', 1)
            stream_source = f"{scheme}://{quote_plus(username)}:{quote_plus(password)}@{address}"
        except ValueError:
            pass

    _config_lock = get_config_lock()

    # --- RETRY LOOP ---
    while not stop_event.is_set():
        ai_logger.info(f"[{camera['name']}] Connecting to stream ({model_type})…")

        # Force FFMPEG backend with TCP transport and generous timeout
        # to prevent ~70s RTSP disconnects during heavy inference (e.g. plate detection)
        import os as _os
        _os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|stimeout;30000000'
        cap = cv2.VideoCapture(stream_source, cv2.CAP_FFMPEG)

        if not cap.isOpened():
            ai_logger.warning(f"[{camera['name']}] Failed to open stream — retrying in 10s…")
            time.sleep(10)
            continue

        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        ai_logger.info(f"[{camera['name']}] Stream OK — inference started ({model_type})")

        frame_count = 0
        skip_frames = 3
        consecutive_failures = 0
        last_event_time = 0

        # --- Frame-drain thread: keeps the RTSP buffer fresh so it never overflows ---
        # Heavy model types (plate, face) run two YOLO models + OCR per frame,
        # which can take 500ms+.  Without draining, buffered frames go stale and
        # the camera's RTSP server closes the connection after ~60-70 s.
        _latest_frame = [None]
        _frame_lock = threading.Lock()
        _drain_stop = threading.Event()

        def _drain_frames():
            while not _drain_stop.is_set() and not stop_event.is_set():
                grabbed, f = cap.read()
                if grabbed:
                    with _frame_lock:
                        _latest_frame[0] = f
                else:
                    time.sleep(0.005)

        use_drain = model_type in (
            'license_plate_detection', 'face_detection', 'face_recognition',
            'unknown_face_detection',
        )
        if use_drain:
            drain_thread = threading.Thread(target=_drain_frames, daemon=True)
            drain_thread.start()
            ai_logger.info(f"[{camera['name']}] Frame-drain thread active (heavy model: {model_type})")

        # Reset tracker on every (re)connect
        with _trackers_lock:
            object_trackers[camera['id']] = {}
        tracker = object_trackers[camera['id']]

        # Read initial config from shared cache
        with _config_lock:
            settings    = config_cache.settings.copy()
            zones_map   = dict(config_cache.zones_map)
            alert_rules = dict(config_cache.alert_rules)
        camera_zones = zones_map.get(camera['id'], [])

        while not stop_event.is_set():
            # Sync settings from shared cache
            with _config_lock:
                settings    = config_cache.settings.copy()
                zones_map   = dict(config_cache.zones_map)
                alert_rules = dict(config_cache.alert_rules)
            camera_zones = zones_map.get(camera['id'], [])

            # Read frame: use drain thread if active, else direct read
            if use_drain:
                with _frame_lock:
                    frame = _latest_frame[0]
                if frame is None:
                    consecutive_failures += 1
                    if consecutive_failures > 200:
                        ai_logger.warning(f"[{camera['name']}] Stream lost (drain). Reconnecting…")
                        break
                    time.sleep(0.05)
                    continue
                ret = True
            else:
                ret, frame = cap.read()
                if not ret:
                    consecutive_failures += 1
                    if consecutive_failures > 50:
                        ai_logger.warning(f"[{camera['name']}] Stream lost. Reconnecting…")
                        break
                    time.sleep(0.05)
                    continue

            consecutive_failures = 0
            frame_count += 1

            if frame_count % (skip_frames * 20) == 0:
                ai_logger.info(f"[{camera['name']}] Still processing ({model_type}, Frame {frame_count})")

            if frame_count % skip_frames != 0:
                continue

            # Run Inference
            try:
                results = ai_model(frame, verbose=False)

                cam_rule = alert_rules['cameras'].get(camera['id']) or alert_rules['global']
                conf_threshold = float(cam_rule.get('confidence_threshold', 0.28)) if cam_rule else 0.28

                # Schedule check
                if cam_rule and not is_within_schedule(cam_rule):
                    if frame_count % (skip_frames * 60) == 0:
                        print(f"[{camera['name']}] Outside schedule window — AI detection paused")
                    continue

                # ── Dispatch to specialized detector ──
                detected = False

                if model_type == 'dress_code_detection':
                    detected = dress_code.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames)

                elif model_type == 'crowd_detection':
                    detected = crowd.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames)

                elif model_type == 'camera_tamper_detection':
                    detected = tamper.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames)

                elif model_type == 'loitering_detection':
                    detected = loitering.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames)

                elif model_type == 'fall_detection':
                    detected, last_event_time = fall.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames,
                        last_event_time=last_event_time)

                elif model_type == 'fight_detection':
                    detected, last_event_time = fight.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames,
                        last_event_time=last_event_time)

                elif model_type == 'abandoned_object_detection':
                    detected = abandoned.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames)

                elif model_type == 'illegal_parking_detection':
                    detected = parking.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames)

                elif model_type in ('face_detection', 'face_recognition', 'unknown_face_detection'):
                    detected = face.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames,
                        model_type=model_type)

                elif model_type == 'license_plate_detection':
                    detected = plate.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames)

                else:
                    # Standard per-box detection (person, vehicle, weapon, fire, PPE, etc.)
                    detected = standard.handle(
                        frame, results, camera, model, ai_model, conf_threshold,
                        settings, camera_zones, alert_rules, tracker, frame_count, skip_frames,
                        model_type=model_type)

                # Clean up tracks not seen for 10s
                current_time = time.time()
                tracker_cleaned = {
                    k: v for k, v in tracker.items()
                    if (not isinstance(v, dict)) or (current_time - v.get('last_seen', 0) < 10)
                }
                with _trackers_lock:
                    object_trackers[camera['id']] = tracker_cleaned
                tracker = tracker_cleaned

                if detected:
                    last_event_time = time.time()

            except Exception as e:
                print(f"Inference error [{camera['name']}]: {e}")
                ai_logger.error(f"[{camera['name']}] Inference error: {e}")

            # Honour per-event cooldown without disconnecting the stream
            if time.time() - last_event_time < EVENT_COOLDOWN:
                time.sleep(0.5)
                continue

            time.sleep(0.01)

        # Stop drain thread before releasing capture
        if use_drain:
            _drain_stop.set()
            try:
                drain_thread.join(timeout=3)
            except Exception:
                pass
        cap.release()
        if stop_event.is_set():
            break

    print(f"Stopped {model_name} on {camera['name']}")
