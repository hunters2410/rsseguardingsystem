"""
detectors/abandoned.py — Abandoned object detection (stationary non-person > N minutes).
"""

import re
import time
import threading

import cv2

from config import supabase, ai_logger, abandoned_tracker
from alerts import send_email_alert, send_sms_alert


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames):
    """
    Process one frame for abandoned object detection.
    Returns True if a detection event was fired.
    """
    desc = model.get('description', '') or ''
    m_timer = re.search(r'timer\s*:\s*(\d+)', desc, re.IGNORECASE)
    timer_secs = int(m_timer.group(1)) * 60 if m_timer else 120  # default 2 mins
    cam_id = camera['id']
    now = time.time()
    detected = False

    persons, objects = [], []
    for r in results:
        for box in r.boxes:
            lbl = ai_model.names[int(box.cls[0])]
            if lbl == 'person' and float(box.conf[0]) >= conf_threshold:
                persons.append(box.xyxy[0].tolist())
            elif lbl in ['backpack', 'handbag', 'suitcase', 'bag', 'umbrella', 'bottle'] and float(box.conf[0]) >= conf_threshold:
                objects.append(box)

    for box in objects:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        cell_key = f"{cam_id}_{cx // 40}_{cy // 40}"
        if cell_key not in abandoned_tracker:
            abandoned_tracker[cell_key] = {'first_seen': now, 'cam_id': cam_id, 'alerted': False}
        near_person = any(abs(cx - (p[0] + p[2]) / 2) < 120 and abs(cy - (p[1] + p[3]) / 2) < 120 for p in persons)
        if near_person:
            abandoned_tracker.pop(cell_key, None)
            continue
        elapsed = now - abandoned_tracker[cell_key]['first_seen']
        if elapsed > timer_secs and not abandoned_tracker[cell_key]['alerted']:
            abandoned_tracker[cell_key]['alerted'] = True
            obj_name = ai_model.names[int(box.cls[0])]
            print(f"[{camera['name']}] ABANDONED OBJECT: {obj_name} for {elapsed:.0f}s")
            snap_url = ''
            try:
                snapshot = frame.copy()
                cv2.rectangle(snapshot, (x1, y1), (x2, y2), (0, 165, 255), 3)
                cv2.putText(snapshot, "ABANDONED OBJECT", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
                ret_enc, buf = cv2.imencode('.jpg', snapshot)
                if ret_enc:
                    fn = f"events/{cam_id}_{int(now)}_abandoned.jpg"
                    supabase.storage.from_("event-snapshots").upload(fn, buf.tobytes(), {"content-type": "image/jpeg"})
                    snap_url = supabase.storage.from_("event-snapshots").get_public_url(fn)
                    if hasattr(snap_url, 'publicUrl'):
                        snap_url = snap_url.publicUrl
            except Exception as _snap_err:
                ai_logger.warning(f"[{camera['name']}] Abandoned object snapshot upload failed: {_snap_err}")
            try:
                supabase.table('events').insert({
                    "camera_id": cam_id, "ai_model_id": model['id'],
                    "event_type": "abandoned_object", "confidence": float(box.conf[0]) * 100,
                    "snapshot_url": snap_url,
                    "metadata": {"object": obj_name, "stationary_seconds": round(elapsed), "timer_threshold": timer_secs},
                    "acknowledged": False
                }).execute()
                event_data = {"event_type": f"abandoned object ({obj_name})", "confidence": float(box.conf[0]) * 100, "camera_name": camera['name'], "snapshot_url": snap_url}
                threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
                detected = True
            except Exception as e:
                print(f"[{camera['name']}] Abandoned object error: {e}")

    return detected
