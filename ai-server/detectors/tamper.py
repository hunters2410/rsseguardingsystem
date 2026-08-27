"""
detectors/tamper.py — Camera tamper detection (pure OpenCV, no model needed).

Detects blocked/covered lens (very dark), whited-out (very bright),
or blurred/moved camera via Laplacian variance.
"""

import time
import threading

import cv2

from config import supabase, tamper_last_alert
from alerts import send_email_alert, send_sms_alert


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames):
    """
    Process one frame for camera tamper detection.
    Returns True if a tamper event was fired.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    mean_bright = gray.mean()
    # Tamper: very blurry (score<20) OR very dark/covered (bright<15) OR whited-out (bright>245)
    tampered = blur_score < 20 or mean_bright < 15 or mean_bright > 245
    cam_id = camera['id']
    last_tamp = tamper_last_alert.get(cam_id, 0)
    if tampered and (time.time() - last_tamp) > 30:
        tamper_last_alert[cam_id] = time.time()
        reason = 'blocked/covered' if mean_bright < 15 else ('whited-out' if mean_bright > 245 else 'blurred/moved')
        print(f"[{camera['name']}] TAMPER ALERT: {reason} blur={blur_score:.1f} bright={mean_bright:.1f}")
        try:
            supabase.table('events').insert({
                "camera_id": cam_id, "ai_model_id": model['id'],
                "event_type": "camera_tamper", "confidence": 95.0,
                "metadata": {"reason": reason, "blur_score": round(blur_score, 2), "brightness": round(float(mean_bright), 2)},
                "acknowledged": False
            }).execute()
            event_data = {"event_type": f"camera_tamper ({reason})", "confidence": 95.0, "camera_name": camera['name'], "snapshot_url": ""}
            threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
            threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
        except Exception as e:
            print(f"[{camera['name']}] Tamper event error: {e}")
        return True
    return False
