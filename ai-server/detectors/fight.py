"""
detectors/fight.py — Fight / aggression detection via overlapping person bounding boxes.
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
    Process one frame for fight/aggression detection.
    Returns (detected: bool, new_last_event_time: float).
    """
    cam_id = camera['id']
    now = time.time()

    person_boxes = []
    for r in results:
        for box in r.boxes:
            if ai_model.names[int(box.cls[0])] == 'person' and float(box.conf[0]) >= conf_threshold:
                person_boxes.append(box.xyxy[0].tolist())

    fight_detected = False
    if len(person_boxes) >= 2:
        for i in range(len(person_boxes)):
            for j in range(i + 1, len(person_boxes)):
                ax1, ay1, ax2, ay2 = person_boxes[i]
                bx1, by1, bx2, by2 = person_boxes[j]
                ix1, iy1 = max(ax1, bx1), max(ay1, by1)
                ix2, iy2 = min(ax2, bx2), min(ay2, by2)
                inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                area_a = (ax2 - ax1) * (ay2 - ay1)
                area_b = (bx2 - bx1) * (by2 - by1)
                iou = inter / max(area_a + area_b - inter, 1)
                if iou > 0.25:
                    fight_detected = True
                    break
            if fight_detected:
                break

    if fight_detected and (now - last_event_time) > EVENT_COOLDOWN:
        last_event_time = now
        print(f"[{camera['name']}] FIGHT/AGGRESSION DETECTED")
        snap_url = ''
        try:
            ret_enc, buf = cv2.imencode('.jpg', frame)
            if ret_enc:
                fn = f"events/{cam_id}_{int(now)}_fight.jpg"
                supabase.storage.from_("event-snapshots").upload(fn, buf.tobytes(), {"content-type": "image/jpeg"})
                snap_url = supabase.storage.from_("event-snapshots").get_public_url(fn)
                if hasattr(snap_url, 'publicUrl'):
                    snap_url = snap_url.publicUrl
        except Exception as _snap_err:
            ai_logger.warning(f"[{camera['name']}] Fight snapshot upload failed: {_snap_err}")
        try:
            supabase.table('events').insert({
                "camera_id": cam_id, "ai_model_id": model['id'],
                "event_type": "fight_detected", "confidence": 88.0,
                "snapshot_url": snap_url,
                "metadata": {"person_count": len(person_boxes)},
                "acknowledged": False
            }).execute()
            event_data = {"event_type": "fight/aggression detected", "confidence": 88.0, "camera_name": camera['name'], "snapshot_url": snap_url}
            threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
            threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
        except Exception as e:
            print(f"[{camera['name']}] Fight event error: {e}")
        return True, last_event_time

    return False, last_event_time
