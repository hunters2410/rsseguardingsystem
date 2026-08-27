"""
detectors/parking.py — Illegal parking detection (vehicle stationary in zone > N minutes).
"""

import re
import time
import threading

from config import supabase, parking_tracker
from alerts import send_email_alert, send_sms_alert


VEHICLE_LABELS = {'car', 'truck', 'bus', 'motorcycle', 'bicycle'}


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames):
    """
    Process one frame for illegal parking detection.
    Returns True if a detection event was fired.
    """
    desc = model.get('description', '') or ''
    m_mins = re.search(r'minutes\s*:\s*(\d+)', desc, re.IGNORECASE)
    park_limit = int(m_mins.group(1)) * 60 if m_mins else 300  # default 5 mins
    cam_id = camera['id']
    now = time.time()
    detected = False

    for r in results:
        for box in r.boxes:
            lbl = ai_model.names[int(box.cls[0])]
            if lbl not in VEHICLE_LABELS or float(box.conf[0]) < conf_threshold:
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            cell_key = f"{cam_id}_{x1 // 50}_{y1 // 50}"
            if cell_key not in parking_tracker:
                parking_tracker[cell_key] = {'first_seen': now, 'cam_id': cam_id, 'alerted': False, 'label': lbl}
            elapsed = now - parking_tracker[cell_key]['first_seen']
            if elapsed > park_limit and not parking_tracker[cell_key]['alerted']:
                parking_tracker[cell_key]['alerted'] = True
                print(f"[{camera['name']}] ILLEGAL PARKING: {lbl} {elapsed:.0f}s")
                detected = True
                try:
                    supabase.table('events').insert({
                        "camera_id": cam_id, "ai_model_id": model['id'],
                        "event_type": "illegal_parking", "confidence": float(box.conf[0]) * 100,
                        "metadata": {"vehicle": lbl, "stationary_minutes": round(elapsed / 60, 1), "limit_minutes": park_limit // 60},
                        "acknowledged": False
                    }).execute()
                    event_data = {"event_type": f"illegal parking ({lbl})", "confidence": float(box.conf[0]) * 100, "camera_name": camera['name'], "snapshot_url": ""}
                    threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                    threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
                except Exception as e:
                    print(f"[{camera['name']}] Parking event error: {e}")

    return detected
