"""
detectors/fall.py — Fall detection via horizontal bounding box (pose model).
"""

import time
import threading

import cv2

from config import supabase, ai_logger, EVENT_COOLDOWN
from alerts import send_email_alert, send_sms_alert


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames,
           last_event_time=0):
    """
    Process one frame for fall detection.
    Returns (detected: bool, new_last_event_time: float).
    """
    cam_id = camera['id']
    now = time.time()
    detected = False

    for r in results:
        if not hasattr(r, 'boxes'):
            continue
        for box in r.boxes:
            if ai_model.names[int(box.cls[0])] != 'person':
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            w, h = x2 - x1, y2 - y1
            if h < 5:
                continue
            aspect = w / h
            if aspect > 1.8 and (now - last_event_time) > EVENT_COOLDOWN:
                last_event_time = now
                detected = True
                print(f"[{camera['name']}] FALL DETECTED aspect={aspect:.2f}")
                snap_url = ''
                try:
                    snapshot = frame.copy()
                    cv2.rectangle(snapshot, (x1, y1), (x2, y2), (0, 0, 255), 3)
                    cv2.putText(snapshot, "FALL DETECTED", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
                    ret_enc, buf = cv2.imencode('.jpg', snapshot)
                    if ret_enc:
                        fn = f"events/{cam_id}_{int(now)}_fall.jpg"
                        supabase.storage.from_("event-snapshots").upload(fn, buf.tobytes(), {"content-type": "image/jpeg"})
                        snap_url = supabase.storage.from_("event-snapshots").get_public_url(fn)
                        if hasattr(snap_url, 'publicUrl'):
                            snap_url = snap_url.publicUrl
                except Exception:
                    pass
                try:
                    supabase.table('events').insert({
                        "camera_id": cam_id, "ai_model_id": model['id'],
                        "event_type": "fall_detected", "confidence": float(box.conf[0]) * 100,
                        "snapshot_url": snap_url,
                        "metadata": {"aspect_ratio": round(aspect, 2), "box": [x1, y1, x2, y2]},
                        "acknowledged": False
                    }).execute()
                    event_data = {"event_type": "fall_detected", "confidence": float(box.conf[0]) * 100, "camera_name": camera['name'], "snapshot_url": snap_url}
                    threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                    threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
                except Exception as e:
                    print(f"[{camera['name']}] Fall event error: {e}")

    return detected, last_event_time
