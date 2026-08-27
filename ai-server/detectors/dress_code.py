"""
detectors/dress_code.py — Dress code / appearance violation detection.

Two-stage pipeline:
  1. YOLOv8 detects person bounding boxes
  2. HSV color analysis on each crop checks clothing color
     against required/prohibited colors in the config
  Optional CLIP upgrade uses text prompts instead of colors.
"""

import time
import threading

import cv2

from config import supabase, dress_code_last_alert
from clothing import analyze_clothing_colors, parse_dress_code_config, classify_with_clip
from alerts import send_email_alert, send_sms_alert


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames):
    """
    Process one frame for dress code violations.
    Returns True if a detection event was fired.
    """
    dc_cfg = parse_dress_code_config(model.get('description', ''))
    required   = [c.lower() for c in dc_cfg['required']]
    prohibited = [c.lower() for c in dc_cfg['prohibited']]
    region     = dc_cfg.get('check', 'top')
    alert_on   = dc_cfg.get('alert_on', 'violation')
    cov_thresh = float(dc_cfg.get('coverage', 0.15))
    cooldown   = float(dc_cfg.get('cooldown', 90))
    cam_id     = camera['id']

    # CLIP text prompts (if CLIP installed and prompts defined)
    clip_prompts = dc_cfg.get('clip_prompts', [])

    # Collect person boxes
    person_boxes = []
    for r in results:
        for box in r.boxes:
            if ai_model.names[int(box.cls[0])] == 'person' \
                    and float(box.conf[0]) >= conf_threshold:
                person_boxes.append(box)

    if frame_count % (skip_frames * 20) == 0:
        print(f"[{camera['name']}] DRESS: {len(person_boxes)} people scanned")

    detected = False
    for box in person_boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        crop = frame[max(0, y1):y2, max(0, x1):x2]

        # Cooldown key: grid cell so same stationary person doesn't spam. 80px grid.
        cell = f"{x1 // 80}_{y1 // 80}"
        dc_key = f"{cam_id}_{cell}"
        if time.time() - dress_code_last_alert.get(dc_key, 0) < cooldown:
            continue

        # ── Color analysis ──────────────────────────────────────
        colors_detected, coverage = analyze_clothing_colors(
            crop, region=region, coverage_threshold=cov_thresh)

        violation = False
        violation_reason = ''

        if alert_on == 'violation':
            missing = [c for c in required if c not in colors_detected]
            if missing:
                violation = True
                violation_reason = f"Missing required color(s): {', '.join(missing)}"
            has_prohibited = [c for c in prohibited if c in colors_detected]
            if has_prohibited:
                violation = True
                violation_reason += ('; ' if violation_reason else '') + \
                    f"Prohibited color(s) detected: {', '.join(has_prohibited)}"
        else:  # alert_on == 'match'
            matched = [c for c in required if c in colors_detected]
            if matched:
                violation = True
                violation_reason = f"Matched color(s): {', '.join(matched)}"

        # ── Optional CLIP re-check ───────────────────────────
        clip_label = None
        from clothing import _CLIP_AVAILABLE
        if _CLIP_AVAILABLE and clip_prompts and violation:
            clip_label, clip_conf = classify_with_clip(crop, clip_prompts)
            if clip_conf < 0.5:
                violation = False
                violation_reason += f' [CLIP override: {clip_label} @ {clip_conf:.0%}]'

        if not violation:
            if frame_count % (skip_frames * 20) == 0:
                print(f"[{camera['name']}] DressCode OK: {colors_detected}")
            continue

        # ── Alert! ───────────────────────────────────────────
        dress_code_last_alert[dc_key] = time.time()
        print(f"[{camera['name']}] 🚨 DRESS CODE VIOLATION: {violation_reason} | Detected: {colors_detected}")

        # Annotated snapshot
        snapshot_frame = frame.copy()
        cv2.rectangle(snapshot_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
        color_text = f"Colors: {', '.join(colors_detected[:3])}"
        cv2.rectangle(snapshot_frame, (x1, max(0, y1 - 40)), (x1 + 300, y1), (0, 0, 200), -1)
        cv2.putText(snapshot_frame, 'DRESS CODE VIOLATION', (x1 + 4, max(0, y1 - 22)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
        cv2.putText(snapshot_frame, color_text, (x1 + 4, max(0, y1 - 5)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 220, 0), 1)

        ret_enc, buf = cv2.imencode('.jpg', snapshot_frame)
        if ret_enc:
            file_name = f"events/{cam_id}_{int(time.time())}.jpg"
            try:
                supabase.storage.from_("event-snapshots").upload(
                    file_name, buf.tobytes(), {"content-type": "image/jpeg"})
                snap_url = supabase.storage.from_("event-snapshots").get_public_url(file_name)
                if hasattr(snap_url, 'publicUrl'):
                    snap_url = snap_url.publicUrl

                supabase.table('events').insert({
                    "camera_id":   cam_id,
                    "ai_model_id": model['id'],
                    "event_type":  "dress_code_violation",
                    "confidence":  float(box.conf[0]) * 100,
                    "snapshot_url": snap_url,
                    "metadata": {
                        "violation_reason": violation_reason,
                        "colors_detected":  colors_detected,
                        "required_colors":  required,
                        "prohibited_colors": prohibited,
                        "region_checked":   region,
                        "clip_label":       clip_label,
                        "box": box.xywhn.tolist()[0]
                    },
                    "acknowledged": False
                }).execute()
                print(f"[{camera['name']}] Dress code event INSERTED")

                event_data = {
                    "event_type":   f"dress_code_violation ({violation_reason})",
                    "confidence":   float(box.conf[0]) * 100,
                    "camera_name":  camera['name'],
                    "snapshot_url": snap_url
                }
                threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
                detected = True
            except Exception as e:
                print(f"[{camera['name']}] Dress code upload error: {e}")

    return detected
