"""
detectors/crowd.py — Crowd detection (frame-level person count aggregation).

Counts all persons in the frame; fires ONE event when the crowd threshold
is exceeded, then applies a cooldown.
"""

import re
import time
import threading

import cv2

from config import supabase, crowd_last_alert
from alerts import send_email_alert, send_sms_alert


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames):
    """
    Process one frame for crowd detection.
    Returns True if a detection event was fired.
    """
    # Parse threshold from model description field, e.g. "threshold:8"
    crowd_threshold = 5
    desc = model.get('description', '') or ''
    m = re.search(r'threshold\s*:\s*(\d+)', desc, re.IGNORECASE)
    if m:
        crowd_threshold = int(m.group(1))

    # Collect all person detections above confidence threshold
    crowd_boxes = []
    for r in results:
        for box in r.boxes:
            if ai_model.names[int(box.cls[0])] == 'person' and float(box.conf[0]) >= conf_threshold:
                crowd_boxes.append(box)

    person_count = len(crowd_boxes)
    cam_id = camera['id']

    # Cooldown: don't fire more than once every 2 minutes
    last_crowd = crowd_last_alert.get(cam_id, 0)
    cooldown_secs = 120

    if frame_count % (skip_frames * 20) == 0:
        print(f"[{camera['name']}] CROWD: {person_count} people detected (threshold={crowd_threshold})")

    if person_count >= crowd_threshold and (time.time() - last_crowd) > cooldown_secs:
        print(f"[{camera['name']}] 🚨 CROWD ALERT: {person_count} people (threshold={crowd_threshold})")
        crowd_last_alert[cam_id] = time.time()

        # Build annotated snapshot
        snapshot_frame = frame.copy()
        h_f, w_f = snapshot_frame.shape[:2]

        for box in crowd_boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            cv2.rectangle(snapshot_frame, (x1, y1), (x2, y2), (0, 165, 255), 2)

        cv2.rectangle(snapshot_frame, (0, 0), (w_f, 60), (0, 0, 200), -1)
        cv2.putText(snapshot_frame,
                    f"CROWD ALERT — {person_count} PEOPLE DETECTED",
                    (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

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
                    "camera_id": cam_id,
                    "ai_model_id": model['id'],
                    "event_type": "crowd_alert",
                    "confidence": min(100.0, person_count / crowd_threshold * 100),
                    "snapshot_url": snap_url,
                    "metadata": {
                        "person_count": person_count,
                        "threshold": crowd_threshold,
                        "box": []
                    },
                    "acknowledged": False
                }).execute()
                print(f"[{camera['name']}] Crowd event INSERTED: {person_count} people")

                event_data = {
                    "event_type": f"crowd_alert ({person_count} people)",
                    "confidence": min(100.0, person_count / crowd_threshold * 100),
                    "camera_name": camera['name'],
                    "snapshot_url": snap_url
                }
                threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
            except Exception as e:
                print(f"[{camera['name']}] Crowd event upload error: {e}")

        return True

    return person_count >= crowd_threshold
