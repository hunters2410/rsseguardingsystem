"""
face_lib.py — Known face library loading and matching.

Uses OpenCV's DNN-based face detection (YuNet) and recognition (SFace)
for high-accuracy face matching without requiring dlib/face_recognition.

Fallback chain:
  1. face_recognition (dlib) — if installed
  2. OpenCV SFace DNN embeddings — built-in, no compilation
  3. Histogram comparison — last resort
"""

import os
import time
import threading

import cv2
import numpy as np
import requests

from config import (
    supabase, face_library_cache, face_library_last_loaded,
    FACE_LIBRARY_TTL, face_library_lock, ai_logger,
)
import config as _cfg  # for writing back to mutable module-level state


# ─── DNN Model Paths ──────────────────────────────────────────────────────────
_MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'face_models')
_YUNET_PATH = os.path.join(_MODELS_DIR, 'face_detection_yunet_2023mar.onnx')
_SFACE_PATH = os.path.join(_MODELS_DIR, 'face_recognition_sface_2021dec.onnx')

# URLs for auto-download (official OpenCV Zoo)
_YUNET_URL = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx'
_SFACE_URL = 'https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx'

# Module-level singletons
_face_detector = None
_face_recognizer = None
_engine = None  # 'face_recognition', 'sface', or 'histogram'


def _download_model(url: str, dest: str):
    """Download a model file if it doesn't exist."""
    if os.path.exists(dest):
        return True
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"[FaceLib] Downloading {os.path.basename(dest)}...")
    try:
        r = requests.get(url, timeout=120, stream=True)
        r.raise_for_status()
        with open(dest, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        size_mb = os.path.getsize(dest) / 1024 / 1024
        print(f"[FaceLib] Downloaded {os.path.basename(dest)} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"[FaceLib] Download failed: {e}")
        return False


def _init_engine():
    """Initialize the best available face recognition engine."""
    global _face_detector, _face_recognizer, _engine

    if _engine is not None:
        return _engine

    # 1. Try face_recognition (dlib)
    try:
        import face_recognition as _fr
        _engine = 'face_recognition'
        print("[FaceLib] Engine: face_recognition (dlib) — highest accuracy")
        return _engine
    except ImportError:
        pass

    # 2. Try OpenCV SFace DNN
    try:
        if _download_model(_YUNET_URL, _YUNET_PATH) and _download_model(_SFACE_URL, _SFACE_PATH):
            _face_detector = cv2.FaceDetectorYN.create(_YUNET_PATH, '', (320, 320), 0.6, 0.3, 5000)
            _face_recognizer = cv2.FaceRecognizerSF.create(_SFACE_PATH, '')
            _engine = 'sface'
            print("[FaceLib] Engine: OpenCV SFace DNN — high accuracy, no C++ needed")
            return _engine
    except Exception as e:
        print(f"[FaceLib] SFace init failed: {e}")

    # 3. Histogram fallback
    _engine = 'histogram'
    print("[FaceLib] Engine: histogram fallback — low accuracy")
    return _engine


def _encode_image(img_bgr, is_library: bool = False):
    """Encode a face image using the active engine. Returns encoding or None."""
    engine = _init_engine()

    if engine == 'face_recognition':
        import face_recognition as fr
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        encs = fr.face_encodings(img_rgb)
        return encs[0] if encs else None

    elif engine == 'sface':
        h, w = img_bgr.shape[:2]
        if h < 20 or w < 20:
            return None
        _face_detector.setInputSize((w, h))
        _, faces = _face_detector.detect(img_bgr)
        if faces is None or len(faces) == 0:
            if is_library:
                # If YuNet can't find landmarks in a pre-cropped library portrait,
                # resize and extract features directly
                resized = cv2.resize(img_bgr, (112, 112))
                feature = _face_recognizer.feature(resized)
                return feature.flatten()
            # For live CCTV stream crops: reject if no clear face landmarks are detected
            return None
        face = faces[0]
        aligned = _face_recognizer.alignCrop(img_bgr, face)
        feature = _face_recognizer.feature(aligned)
        return feature.flatten()

    else:  # histogram
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        hist = cv2.calcHist([img_rgb], [0, 1, 2], None, [8, 8, 8], [0, 256] * 3)
        return cv2.normalize(hist, hist).flatten()


def load_face_library(force: bool = False):
    """Fetch known_face_photos from Supabase and build face encodings."""
    now = time.time()
    if not force and (now - _cfg.face_library_last_loaded) < FACE_LIBRARY_TTL:
        return  # Still fresh

    engine = _init_engine()

    try:
        resp = supabase.table('known_face_photos') \
            .select('id, known_face_id, photo_url, angle, known_faces(id, name, role, department, is_active)') \
            .execute()
        rows = resp.data or []

        new_cache = []
        for row in rows:
            face_info = row.get('known_faces') or {}
            if not face_info.get('is_active', True):
                continue
            photo_url = row.get('photo_url', '')
            try:
                img_resp = requests.get(photo_url, timeout=10)
                img_arr = np.frombuffer(img_resp.content, np.uint8)
                img_bgr = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
                if img_bgr is None:
                    continue
                encoding = _encode_image(img_bgr, is_library=True)
                if encoding is None:
                    print(f"[FaceLib] No face found in photo for {face_info.get('name', '?')}")
                    continue
                new_cache.append({
                    'face_id': face_info.get('id'),
                    'name': face_info.get('name', 'Unknown'),
                    'role': face_info.get('role', 'employee'),
                    'department': face_info.get('department', ''),
                    'photo_url': photo_url,
                    'encoding': encoding,
                    'engine': engine,
                })
            except Exception as e:
                print(f"[FaceLib] Failed to encode {photo_url}: {e}")

        with face_library_lock:
            _cfg.face_library_cache = new_cache
            _cfg.face_library_last_loaded = now
        print(f"[FaceLib] Loaded {len(new_cache)} face encodings from {len(rows)} photos (engine={engine})")
    except Exception as e:
        print(f"[FaceLib] Load error: {e}")


def match_face(face_crop_bgr, threshold: float = 0.55):
    """Compare a cropped face image against the library.
    Returns (matched: bool, name: str, role: str, department: str, confidence: float)"""
    load_face_library()  # Refresh if stale

    with face_library_lock:
        if not _cfg.face_library_cache:
            return False, 'Unknown', '', '', 0.0
        engine = _cfg.face_library_cache[0].get('engine', 'histogram')

    try:
        query_enc = _encode_image(face_crop_bgr, is_library=False)
        if query_enc is None:
            return False, 'Unknown', '', '', 0.0

        with face_library_lock:
            entries = list(_cfg.face_library_cache)

        if engine == 'face_recognition':
            import face_recognition as fr
            distances = fr.face_distance([e['encoding'] for e in entries], query_enc)
            idx = int(np.argmin(distances))
            dist = float(distances[idx])
            confidence = max(0.0, 1.0 - dist)
            # Default threshold for dlib face_recognition is 0.50 (distance <= 0.50)
            if dist <= min(threshold, 0.50):
                e = entries[idx]
                return True, e['name'], e['role'], e['department'], confidence
            return False, 'Unknown', '', '', confidence

        elif engine == 'sface':
            # SFace uses cosine similarity — higher = better match
            best_score, best_entry = 0.0, None
            second_score = 0.0
            for e in entries:
                score = float(_face_recognizer.match(
                    query_enc.reshape(1, -1),
                    e['encoding'].reshape(1, -1),
                    cv2.FaceRecognizerSF_FR_COSINE
                ))
                if score > best_score:
                    second_score = best_score
                    best_score, best_entry = score, e
                elif score > second_score:
                    second_score = score

            # Strict CCTV threshold: 0.55+ (55%) prevents distant/blurry false matches
            sface_threshold = max(threshold, 0.55)
            if best_entry and best_score >= sface_threshold:
                return True, best_entry['name'], best_entry['role'], best_entry['department'], best_score
            return False, 'Unknown', '', '', best_score

        else:  # histogram
            hist = cv2.calcHist([cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)],
                               [0, 1, 2], None, [8, 8, 8], [0, 256] * 3)
            query_hist = cv2.normalize(hist, hist).flatten()
            best_score, best_entry = 0.0, None
            for e in entries:
                score = float(np.dot(query_hist, e['encoding']))
                if score > best_score:
                    best_score, best_entry = score, e
            if best_entry and best_score > 0.85:
                return True, best_entry['name'], best_entry['role'], best_entry['department'], best_score
            return False, 'Unknown', '', '', best_score

    except Exception as ex:
        print(f"[FaceLib] match_face error: {ex}")
        return False, 'Unknown', '', '', 0.0

