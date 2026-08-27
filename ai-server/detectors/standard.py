"""
detectors/standard.py — Standard per-box detection for all remaining model types.

Handles:
  - TYPE_MAPPING class filter (person, vehicle, weapon, animal, fire, PPE, mask, etc.)
  - Object tracking + movement
  - Zone crossing (tripwire) + zone entry (polygon)
  - Whitelist / blacklist enforcement
  - Snapshot annotation + upload
  - License plate OCR via PaddleOCR
"""

import re
import time
import threading

import cv2
import numpy as np

from config import supabase, plate_cooldowns, ocr_reader
from zones import check_zone_crossing, check_zone_containment, has_active_polygon_zones
from rules import should_trigger_alert
from alerts import send_email_alert, send_sms_alert


# Mapping of model types to YOLO classes
TYPE_MAPPING = {
    'person_detection':          ['person'],
    'person_detection_balanced': ['person'],
    'person_detection_accurate': ['person'],
    'intrusion_detection':       ['person', 'bicycle', 'car', 'motorcycle', 'dog', 'bus', 'truck'],
    'vehicle_detection':         ['bicycle', 'car', 'motorcycle', 'bus', 'truck'],
    'weapon_detection':          ['weapon', 'gun', 'pistol', 'rifle', 'firearm', 'knife', 'handgun', 'Pistol', 'Gun', 'Knife'],
    'animal_detection':          ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'],
    'face_detection':            ['face', 'person'],
    'face_recognition':          ['face', 'person'],
    'unknown_face_detection':    ['face', 'person'],
    'fire_detection':            ['fire', 'smoke', 'Fire', 'Smoke'],
    'smoke_detection':           ['smoke', 'fire', 'Smoke', 'Fire'],
    'ppe_detection':             ['NO-Hardhat', 'NO-Safety Vest', 'NO-Mask', 'NO-Gloves',
                                  'Hardhat', 'Safety Vest', 'Mask', 'Gloves',
                                  'helmet', 'vest', 'no-helmet', 'no-vest'],
    'mask_detection':            ['with_mask', 'without_mask', 'mask', 'no_mask', 'Mask', 'No-Mask'],
    'license_plate_detection':   ['license_plate', 'license-plate', 'number_plate', 'plate'],
    'vandalism_detection':       ['person'],
    'running_detection':         ['person'],
    'tailgating_detection':      ['person'],
}

DEFAULT_ALLOWED = [
    'person', 'bicycle', 'car', 'motorcycle', 'dog', 'bus', 'truck',
    'weapon', 'gun', 'pistol', 'rifle', 'firearm', 'knife', 'handgun',
    'helmet', 'vest', 'glove', 'glasses', 'mask', 'no-helmet', 'no-vest', 'no-glove', 'no-glasses', 'no-mask',
    'NO-Hardhat', 'NO-Mask', 'NO-Safety Vest', 'Hardhat', 'Mask', 'Safety Vest'
]


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames,
           model_type='person_detection'):
    """
    Standard per-box detection handler for all remaining model types.
    Returns True if a detection event was fired (for cooldown purposes).
    """
    allowed_classes = TYPE_MAPPING.get(model_type) or DEFAULT_ALLOWED

    detected = False
    for r in results:
        for box in r.boxes:
            crossed_zone = None  # Initialize per-box so snapshot logic is always safe
            conf = float(box.conf[0])
            cls_idx = int(box.cls[0])
            label = ai_model.names[cls_idx]

            if label not in allowed_classes:
                continue

            # Strict confidence threshold for weapons to reduce false positives
            current_threshold = conf_threshold
            if label in ['weapon', 'gun', 'pistol', 'rifle', 'firearm', 'knife', 'handgun']:
                current_threshold = 0.55

            if conf < current_threshold:
                continue

            # ── STEP 1: capture the raw YOLO label BEFORE any suffixes ──
            original_label = label

            # ── STEP 2: apply_to_zones_only shortcut ──
            cam_rule_check = alert_rules['cameras'].get(camera['id']) or alert_rules['global']
            _apply_zones_only = cam_rule_check.get('apply_to_zones_only', False) if cam_rule_check else False
            if _apply_zones_only and not camera_zones:
                continue

            # ── STEP 3: whitelist / blacklist filter ──
            _allowed, _reason = should_trigger_alert(camera['id'], original_label, alert_rules)
            if not _allowed and not camera_zones:
                if frame_count % (skip_frames * 20) == 0:
                    print(f"[{camera['name']}] FILTER: {original_label} blocked — {_reason}")
                continue

            # ── STEP 4: log every detection that passed ──
            if frame_count % (skip_frames * 10) == 0:
                print(f"[{camera['name']}] DETECTED: {label} ({conf:.2f}) | {_reason}")

            # Tracking logic
            xyxy = box.xyxy[0].tolist()
            center_x, center_y = (xyxy[0] + xyxy[2]) / 2, (xyxy[1] + xyxy[3]) / 2
            current_position = (center_x, center_y)
            obj_id = f"{label}_{int(center_x // 40)}_{int(center_y // 40)}"

            should_trigger = False
            current_time = time.time()

            if obj_id in tracker and isinstance(tracker[obj_id], dict):
                last_pos = tracker[obj_id]['last_position']

                crossed_zone = None
                # Zone Crossing Detection
                for zone in camera_zones:
                    if zone.get('type') == 'line' and len(zone.get('points', [])) >= 2:
                        h, w = frame.shape[:2]
                        zpts = zone['points']
                        start_pt = (zpts[0][0] * w, zpts[0][1] * h)
                        end_pt = (zpts[1][0] * w, zpts[1][1] * h)

                        if check_zone_crossing(last_pos, current_position, [start_pt, end_pt]):
                            print(f"[{camera['name']}] ZONE CROSSING: {label}")
                            should_trigger = True
                            label = f"{label}_crossing"
                            tracker[obj_id]['alerted'] = False
                            tracker[obj_id]['seen_count'] = 999
                            crossed_zone = (start_pt, end_pt)

                movement = ((center_x - last_pos[0])**2 + (center_y - last_pos[1])**2)**0.5
                tracker[obj_id].update({
                    'total_movement': tracker[obj_id]['total_movement'] + movement,
                    'last_seen': current_time,
                    'seen_count': tracker[obj_id]['seen_count'] + 1,
                    'last_position': current_position
                })

                # Zone containment (polygon)
                if camera_zones and not should_trigger:
                    if has_active_polygon_zones(camera_zones):
                        was_in_zone = check_zone_containment(last_pos, camera_zones, frame.shape)
                        is_in_zone  = check_zone_containment(current_position, camera_zones, frame.shape)

                        if not was_in_zone and is_in_zone:
                            should_trigger = True
                            tracker[obj_id]['alerted'] = False
                            label = f"{label}_entry"
                            print(f"[{camera['name']}] ZONE BREACH: {label} crossed INTO polygon zone")
                        elif was_in_zone and not is_in_zone:
                            tracker[obj_id]['alerted'] = False
                            print(f"[{camera['name']}] Zone exit: {label} left polygon zone")
                elif not camera_zones:
                    should_trigger = True
            else:
                tracker[obj_id] = {
                    'last_position': current_position,
                    'last_seen': current_time,
                    'total_movement': 0,
                    'seen_count': 1,
                    'alerted': False,
                }

            # ── STEP 5: final trigger gate ──
            if should_trigger and not tracker[obj_id].get('alerted') and tracker[obj_id]['seen_count'] >= 2:

                is_zone_event = "_crossing" in label or "_entry" in label

                if is_zone_event:
                    allowed, reason = should_trigger_alert(camera['id'], original_label, alert_rules)
                    if not allowed:
                        print(f"[{camera['name']}] Zone event BLOCKED for '{original_label}' — {reason}")
                        continue
                    print(f"[{camera['name']}] Zone event ALLOWED: {label} — {reason}")
                else:
                    if _apply_zones_only and camera_zones:
                        print(f"[{camera['name']}] Blocked: '{label}' — apply_to_zones_only=True, not a zone event")
                        continue
                    if settings.get('boundary_alerts_only', False):
                        print(f"[{camera['name']}] Blocked: '{label}' — boundary_alerts_only is ON")
                        continue
                    allowed, reason = should_trigger_alert(camera['id'], original_label, alert_rules)
                    if not allowed:
                        print(f"[{camera['name']}] Blocked: '{label}' — {reason}")
                        continue
                    print(f"[{camera['name']}] Alert ALLOWED: '{label}' — {reason}")

                if "_crossing" in label:
                    print(f"[{camera['name']}] Zone Crossing Event (Allowed): {label}")

                print(f"[{camera['name']}] SECURITY ALERT: {label.upper()} ({conf:.2f})")

                # Build annotated snapshot
                snapshot_frame = frame.copy()
                x1, y1, x2, y2 = map(int, xyxy)
                cv2.rectangle(snapshot_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)

                header_text = "SECURITY BREACH" if is_zone_event else "DETECTION"
                cv2.rectangle(snapshot_frame, (x1, y1 - 35), (x1 + 200, y1), (0, 0, 255), -1)
                cv2.putText(snapshot_frame, f"{header_text}: {original_label.upper()}", (x1 + 5, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

                if is_zone_event and crossed_zone:
                    pt1 = (int(crossed_zone[0][0]), int(crossed_zone[0][1]))
                    pt2 = (int(crossed_zone[1][0]), int(crossed_zone[1][1]))
                    cv2.line(snapshot_frame, pt1, pt2, (0, 0, 255), 5)
                    cv2.putText(snapshot_frame, "BREACH POINT", (pt1[0], pt1[1] - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 3)

                ret, buffer = cv2.imencode('.jpg', snapshot_frame)
                if ret:
                    file_name = f"events/{camera['id']}_{int(time.time())}.jpg"
                    try:
                        supabase.storage.from_("event-snapshots").upload(file_name, buffer.tobytes(), {"content-type": "image/jpeg"})
                        snapshot_url = supabase.storage.from_("event-snapshots").get_public_url(file_name)
                        if hasattr(snapshot_url, 'publicUrl'):
                            snapshot_url = snapshot_url.publicUrl

                        supabase.table('events').insert({
                            "camera_id": camera['id'], "ai_model_id": model['id'],
                            "event_type": label, "confidence": conf * 100,
                            "snapshot_url": snapshot_url, "metadata": {"box": box.xywhn.tolist()[0]},
                            "acknowledged": False
                        }).execute()

                        print(f"[{camera['name']}] Event INSERTED with Highlights: {label}")

                        # OCR FOR LICENSE PLATES
                        if original_label in ['license_plate', 'license-plate', 'number_plate'] and ocr_reader is not None:
                            _do_plate_ocr(frame, x1, y1, x2, y2, camera, conf, snapshot_url, current_time)

                        tracker[obj_id]['alerted'] = True
                        detected = True

                        threading.Thread(target=send_email_alert, args=(settings, {"event_type": label, "confidence": conf * 100, "camera_name": camera['name'], "snapshot_url": snapshot_url})).start()
                        threading.Thread(target=send_sms_alert,   args=(settings, {"event_type": label, "confidence": conf * 100, "camera_name": camera['name'], "snapshot_url": snapshot_url})).start()
                    except Exception as e:
                        print(f"[{camera['name']}] Event Upload Error: {e}")

    return detected


def _do_plate_ocr(frame, x1, y1, x2, y2, camera, conf, snapshot_url, current_time):
    """Run advanced ALPR OCR on a license plate crop and insert into number_plates table."""
    plate_crop = frame[y1:y2, x1:x2]
    if plate_crop.size == 0:
        return

    from detectors.plate import _extract_plate_text

    plate_text, ocr_conf = _extract_plate_text(plate_crop)
    if not plate_text or len(plate_text) < 4:
        return

    last_seen_p = plate_cooldowns.get(plate_text, 0)
    if current_time - last_seen_p > 60:
        plate_cooldowns[plate_text] = current_time
        print(f"[{camera['name']}] OCR DETECTED: {plate_text}")
        try:
            supabase.table('number_plates').insert({
                "plate_text": plate_text,
                "camera_id": camera['id'],
                "confidence": round(conf * 100, 1),
                "snapshot_url": snapshot_url
            }).execute()
        except Exception as ex:
            print(f"Error inserting plate {plate_text}: {ex}")
