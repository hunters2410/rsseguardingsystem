"""
detectors/face.py — Face detection, recognition, and unknown face detection handler.

Smart deduplication:
  - face_detection: Only fires events for KNOWN faces (unknowns are skipped)
  - unknown_face_detection: Fires ONCE per unique unknown face, then suppresses
    duplicates of the same person using embedding similarity for 5 minutes
  - face_recognition: Only fires for matched (known) faces
"""

import time
import threading

import cv2
import numpy as np

from config import supabase, dress_code_last_alert
from face_lib import match_face, _encode_image, _face_recognizer, _init_engine
from alerts import send_email_alert, send_sms_alert


# ── Unknown face dedup cache ──────────────────────────────────────────────────
# Stores recent unknown face embeddings to avoid re-alerting on the same person.
# Format: list of { 'embedding': np.array, 'timestamp': float, 'camera_id': str }
_unknown_cache = []
_UNKNOWN_CACHE_TTL = 300  # 5 minutes — same unknown face won't trigger again
_UNKNOWN_SIMILARITY_THRESHOLD = 0.35  # SFace cosine — above this = same person


def _is_duplicate_unknown(embedding, camera_id):
    """Check if this unknown face embedding is similar to a recently seen unknown."""
    global _unknown_cache
    now = time.time()

    # Purge expired entries
    _unknown_cache = [e for e in _unknown_cache if (now - e['timestamp']) < _UNKNOWN_CACHE_TTL]

    if embedding is None:
        return False

    engine = _init_engine()

    for entry in _unknown_cache:
        if entry['camera_id'] != camera_id:
            continue
        try:
            if engine == 'sface' and _face_recognizer is not None:
                score = float(_face_recognizer.match(
                    embedding.reshape(1, -1),
                    entry['embedding'].reshape(1, -1),
                    cv2.FaceRecognizerSF_FR_COSINE
                ))
            elif engine == 'face_recognition':
                import face_recognition as fr
                dist = float(fr.face_distance([entry['embedding']], embedding)[0])
                score = 1.0 - dist
            else:
                score = float(np.dot(embedding, entry['embedding']))

            if score >= _UNKNOWN_SIMILARITY_THRESHOLD:
                return True  # Same person already seen recently
        except Exception:
            continue

    return False


def _cache_unknown(embedding, camera_id):
    """Add an unknown face embedding to the dedup cache."""
    if embedding is not None:
        _unknown_cache.append({
            'embedding': embedding,
            'timestamp': time.time(),
            'camera_id': camera_id,
        })


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames,
           model_type='face_detection'):
    """
    Process one frame for face detection/recognition/unknown face detection.
    Returns True if a detection event was fired.
    """
    h_frame, w_frame = frame.shape[:2]
    detected = False
    cam_id = camera['id']

    for r in results:
        for box in r.boxes:
            conf = float(box.conf[0])
            if conf < conf_threshold:
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            face_w = x2 - x1
            face_h = y2 - y1

            # Ignore tiny/distant faces (< 35px) — too blurry for reliable biometric identification
            if face_w < 35 or face_h < 35:
                continue

            # Expand crop slightly for better face encoding accuracy
            pad = 10
            fx1 = max(0, x1 - pad)
            fy1 = max(0, y1 - pad)
            fx2 = min(w_frame, x2 + pad)
            fy2 = min(h_frame, y2 + pad)
            face_crop = frame[fy1:fy2, fx1:fx2]
            if face_crop.size == 0:
                continue

            matched, person_name, role, department, face_conf = match_face(face_crop)

            # ── Smart filtering per model_type ──

            if model_type == 'face_detection':
                # ONLY alert on KNOWN faces — unknowns are silently skipped
                if not matched:
                    continue
                event_label  = f"face detected: {person_name}"
                alert_header = f"FACE: {person_name.upper()}"
                box_color    = (0, 200, 0)

            elif model_type == 'unknown_face_detection':
                if matched and role == 'blacklist':
                    event_label  = f"blacklisted person: {person_name}"
                    alert_header = f"BLACKLIST: {person_name.upper()}"
                    box_color    = (0, 0, 255)
                elif matched:
                    # Known authorized person — log quietly, no event
                    if frame_count % (skip_frames * 20) == 0:
                        print(f"[{camera['name']}] Authorized: {person_name} ({face_conf:.2f})")
                    continue
                else:
                    # Unknown face — check if we've already alerted on this person
                    try:
                        unknown_embedding = _encode_image(face_crop)
                    except Exception:
                        unknown_embedding = None

                    if _is_duplicate_unknown(unknown_embedding, cam_id):
                        # Same unknown face seen recently — skip silently
                        continue

                    # New unknown face — alert, cache, and save crop for labeling
                    _cache_unknown(unknown_embedding, cam_id)

                    # Save clean face crop to storage for operator review
                    crop_url = ""
                    try:
                        ret_crop, crop_buf = cv2.imencode('.jpg', face_crop)
                        if ret_crop:
                            crop_fname = f"unknown-crops/{cam_id}_{int(time.time())}_{x1}_{y1}.jpg"
                            supabase.storage.from_("event-snapshots").upload(
                                crop_fname, crop_buf.tobytes(), {"content-type": "image/jpeg"}
                            )
                            crop_url = supabase.storage.from_("event-snapshots").get_public_url(crop_fname)
                            if hasattr(crop_url, 'publicUrl'):
                                crop_url = crop_url.publicUrl
                    except Exception as crop_err:
                        print(f"[{camera['name']}] Unknown crop save error: {crop_err}")

                    # Insert into unknown_faces table for operator labeling
                    if crop_url:
                        try:
                            supabase.table('unknown_faces').insert({
                                "camera_id": cam_id,
                                "crop_url": crop_url,
                                "confidence": round(face_conf * 100, 1),
                                "camera_name": camera['name'],
                                "status": "pending",
                            }).execute()
                        except Exception as uf_err:
                            print(f"[{camera['name']}] Unknown faces insert error: {uf_err}")

                    event_label  = "unknown face detected"
                    alert_header = "UNKNOWN FACE"
                    box_color    = (0, 0, 255)

            else:  # face_recognition — only identify known faces
                if not matched:
                    continue
                event_label  = f"face recognized: {person_name}"
                alert_header = f"ID: {person_name.upper()}"
                box_color    = (0, 200, 0)

            # ── Cooldown: known faces = 30s, unknown = 120s ──
            cell = f"{x1 // 80}_{y1 // 80}"
            face_key = f"face_{cam_id}_{cell}"
            now_t = time.time()
            cooldown = 30 if matched else 120
            if now_t - dress_code_last_alert.get(face_key, 0) < cooldown:
                continue
            dress_code_last_alert[face_key] = now_t

            # Draw snapshot with name overlay
            snap = frame.copy()
            cv2.rectangle(snap, (x1, y1), (x2, y2), box_color, 3)
            cv2.rectangle(snap, (x1, y1 - 40), (x1 + max(200, (x2 - x1)), y1), box_color, -1)
            cv2.putText(snap, alert_header, (x1 + 5, y1 - 12),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
            conf_text = f"Conf: {face_conf * 100:.0f}%"
            cv2.putText(snap, conf_text, (x1 + 5, y2 + 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 1)

            ret, buf = cv2.imencode('.jpg', snap)
            snapshot_url = ""
            if ret:
                try:
                    fname = f"events/{cam_id}_face_{int(now_t)}.jpg"
                    supabase.storage.from_("event-snapshots").upload(fname, buf.tobytes(), {"content-type": "image/jpeg"})
                    snapshot_url = supabase.storage.from_("event-snapshots").get_public_url(fname)
                    if hasattr(snapshot_url, 'publicUrl'):
                        snapshot_url = snapshot_url.publicUrl
                except Exception as snap_err:
                    print(f"[{camera['name']}] Face snapshot error: {snap_err}")

            metadata = {
                "matched": matched,
                "person_name": person_name if matched else None,
                "role": role if matched else None,
                "department": department if matched else None,
                "face_confidence": round(face_conf * 100, 1),
                "model_type": model_type,
                "box": [x1, y1, x2, y2],
            }

            try:
                supabase.table('events').insert({
                    "camera_id": cam_id,
                    "ai_model_id": model['id'],
                    "event_type": event_label,
                    "confidence": round(conf * 100, 1),
                    "snapshot_url": snapshot_url,
                    "metadata": metadata,
                    "acknowledged": False,
                }).execute()
                print(f"[{camera['name']}] FACE EVENT: {event_label} | conf={face_conf:.2f}")

                event_data = {
                    "event_type": event_label,
                    "confidence": round(conf * 100, 1),
                    "camera_name": camera['name'],
                    "snapshot_url": snapshot_url,
                }
                threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                if model_type == 'unknown_face_detection' and not matched:
                    threading.Thread(target=send_sms_alert, args=(settings, event_data)).start()
                detected = True
            except Exception as ev_err:
                print(f"[{camera['name']}] Face event insert error: {ev_err}")

    return detected
