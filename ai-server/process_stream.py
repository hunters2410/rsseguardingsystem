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

    print(f"Starting {model_name} analysis on {camera['name']}")

    # Use model_hub to resolve the correct weights for this model type
    local_model_path = hub_get_model_path(model_type, model.get('model_path', '') or '')
    if not local_model_path:
        local_model_path = None

    if local_model_path is None and model_type not in ('camera_tamper_detection', 'motion_detection', 'flood_detection'):
        print(f"[{model_name}] No model path resolved. Aborting.")
        return

    try:
        torch.serialization.add_safe_globals([ultralytics.nn.tasks.DetectionModel])
        ai_model = YOLO(local_model_path)
    except Exception as e:
        print(f"Error loading YOLO model: {e}")
        return

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
        print(f"[{camera['name']}] Connecting to stream...")
        cap = cv2.VideoCapture(stream_source)

        if not cap.isOpened():
            print(f"[{camera['name']}] Failed to open stream. Retrying in 10s...")
            time.sleep(10)
            continue

        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        print(f"[{camera['name']}] Stream OK. Starting inference...")

        frame_count = 0
        skip_frames = 3
        consecutive_failures = 0
        last_event_time = 0

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

            ret, frame = cap.read()
            if not ret:
                consecutive_failures += 1
                if consecutive_failures > 50:
                    print(f"[{camera['name']}] Stream lost. Reconnecting...")
                    break
                time.sleep(0.05)
                continue

            consecutive_failures = 0
            frame_count += 1

            if frame_count % (skip_frames * 20) == 0:
                print(f"[{camera['name']}] Still processing (Frame {frame_count})...")

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
                print(f"Inference error: {e}")

            # Honour per-event cooldown without disconnecting the stream
            if time.time() - last_event_time < EVENT_COOLDOWN:
                time.sleep(0.5)
                continue

            time.sleep(0.01)

        cap.release()
        if stop_event.is_set():
            break

    print(f"Stopped {model_name} on {camera['name']}")
