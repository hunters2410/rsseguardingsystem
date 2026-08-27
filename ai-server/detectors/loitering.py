"""
detectors/loitering.py — Loitering detection (person stationary in area > threshold).
"""

import re
import time
import threading

import cv2

from config import supabase, ai_logger, loiter_tracker
from alerts import send_email_alert, send_sms_alert


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames):
    """
    Process one frame for loitering detection.
    Returns True if a detection event was fired.
    """
    desc = model.get('description', '') or ''
    m_dwell = re.search(r'dwell\s*:\s*(\d+)', desc, re.IGNORECASE)
    dwell_threshold = int(m_dwell.group(1)) if m_dwell else 30  # default 30s
    cam_id = camera['id']
    now = time.time()
    detected = False

    person_boxes = []
    for r in results:
        for box in r.boxes:
            if ai_model.names[int(box.cls[0])] == 'person' and float(box.conf[0]) >= conf_threshold:
                person_boxes.append(box)

    seen_ids = set()
    for box in person_boxes:
        cx = int((box.xyxy[0][0] + box.xyxy[0][2]) / 2)
        cy = int((box.xyxy[0][1] + box.xyxy[0][3]) / 2)
        cell = f"{cx // 60}_{cy // 60}"
        cell_key = f"{cam_id}_{cell}"
        seen_ids.add(cell_key)

        if cell_key not in loiter_tracker:
            loiter_tracker[cell_key] = {'first_seen': now, 'cam_id': cam_id, 'alerted': False}
        elif not loiter_tracker[cell_key]['alerted'] and (now - loiter_tracker[cell_key]['first_seen']) > dwell_threshold:
            loiter_tracker[cell_key]['alerted'] = True
            print(f"[{camera['name']}] LOITERING ALERT cell={cell_key} dwell={dwell_threshold}s")
            snap_url = ''
            try:
                ret_enc, buf = cv2.imencode('.jpg', frame)
                if ret_enc:
                    fn = f"events/{cam_id}_{int(now)}_loiter.jpg"
                    supabase.storage.from_("event-snapshots").upload(fn, buf.tobytes(), {"content-type": "image/jpeg"})
                    snap_url = supabase.storage.from_("event-snapshots").get_public_url(fn)
                    if hasattr(snap_url, 'publicUrl'):
                        snap_url = snap_url.publicUrl
            except Exception as _snap_err:
                ai_logger.warning(f"[{camera['name']}] Loitering snapshot upload failed: {_snap_err}")
            try:
                dwell_elapsed = round(now - loiter_tracker[cell_key]['first_seen'], 1)
                supabase.table('events').insert({
                    "camera_id": cam_id, "ai_model_id": model['id'],
                    "event_type": "loitering_detected", "confidence": float(box.conf[0]) * 100,
                    "snapshot_url": snap_url,
                    "metadata": {"dwell_seconds": dwell_elapsed, "threshold": dwell_threshold},
                    "acknowledged": False
                }).execute()
                event_data = {"event_type": f"loitering ({round(dwell_elapsed)}s)", "confidence": float(box.conf[0]) * 100, "camera_name": camera['name'], "snapshot_url": snap_url}
                threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
                detected = True
            except Exception as e:
                print(f"[{camera['name']}] Loitering event error: {e}")

    # Evict cell_keys no longer visible
    for old in list(loiter_tracker.keys()):
        if old not in seen_ids:
            del loiter_tracker[old]

    return detected
