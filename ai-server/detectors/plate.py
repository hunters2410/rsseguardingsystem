"""
detectors/plate.py — Advanced Hierarchical License Plate Recognition (ALPR) handler.

Features:
  1. Two-Stage Zoom Architecture for distant/small plates
  2. Gemini Vision OCR (primary) with EasyOCR fallback
  3. Visual Plate Memory — recognizes previously seen plates instantly
  4. Temporal Consensus Engine for frame-by-frame aggregation
  5. Strict Zimbabwe format enforcement (3 letters + 4 digits)
  6. High-res crop uploading & database sync
"""

import re
import time
import threading
import cv2
import numpy as np
from collections import defaultdict
from ultralytics import YOLO

from config import supabase, plate_cooldowns, ocr_reader
from alerts import send_email_alert, send_sms_alert

# Import Gemini OCR and Plate Memory
try:
    from gemini_ocr import read_plate_gemini, is_available as gemini_available
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False
    def read_plate_gemini(crop, scale=3): return "", 0.0
    def gemini_available(): return False

try:
    from plate_memory import lookup_plate, store_plate, init as init_plate_memory
    HAS_PLATE_MEMORY = True
    # Initialize plate memory on import
    init_plate_memory()
except ImportError:
    HAS_PLATE_MEMORY = False
    def lookup_plate(crop): return None, 0.0
    def store_plate(crop, text, source='auto'): pass
    def init_plate_memory(): pass


# ═══════════════════════════════════════════════════════════════════════════════
# Zimbabwe Plate Format: EXACTLY 3 LETTERS (A-Z) + 4 DIGITS (0-9)
# e.g. AGA8167, AGV2063, AGC6082
# ═══════════════════════════════════════════════════════════════════════════════

# Conservative visual lookalike mapping (ONLY true optical lookalikes)
DIGIT_TO_LETTER = {
    '0': 'O',
    '1': 'I',
    '2': 'Z',
    '5': 'S',
    '6': 'G',
    '8': 'B',
}

LETTER_TO_DIGIT = {
    'O': '0',
    'D': '0',
    'Q': '0',
    'I': '1',
    'L': '1',
    'Z': '2',
    'E': '3',
    'A': '4',
    'S': '5',
    'G': '6',
    'T': '7',
    'B': '8',
}

# --- Temporal Consensus Engine ---
_temporal_buffer = defaultdict(list)
_temporal_lock = threading.Lock()
TEMPORAL_MIN_READINGS = 3
TEMPORAL_WINDOW = 120.0
TEMPORAL_COMMIT_INTERVAL = 10.0
_last_committed = {}

# Vehicle detector cache
_vehicle_detector = None
_vehicle_detector_lock = threading.Lock()


def _get_vehicle_detector():
    """Lazy-load YOLOv8 nano for Stage 1 vehicle localization."""
    global _vehicle_detector
    with _vehicle_detector_lock:
        if _vehicle_detector is None:
            try:
                _vehicle_detector = YOLO('yolov8n.pt')
            except Exception as e:
                print(f"[ALPR] Could not load vehicle detector: {e}")
    return _vehicle_detector


def _force_letter(c):
    """Convert lookalike digit to letter. If not a valid lookalike, returns None."""
    c = c.upper()
    if c.isalpha():
        return c
    return DIGIT_TO_LETTER.get(c, None)


def _force_digit(c):
    """Convert lookalike letter to digit. If not a valid lookalike, returns None."""
    c = c.upper()
    if c.isdigit():
        return c
    return LETTER_TO_DIGIT.get(c, None)


def _validate_zim_plate(plate_text):
    """Validate that a plate strictly matches Zimbabwe format: 3 letters + 4 digits.
    Returns True only if format is perfect."""
    if not plate_text or len(plate_text) != 7:
        return False
    if not plate_text[:3].isalpha():
        return False
    if not plate_text[3:].isdigit():
        return False
    return True


def rectify_zim_plate(raw_text):
    """Clean and STRICTLY enforce Zimbabwe plate format: 3 letters (A-Z) + 4 digits (0-9).
    
    If characters cannot be legitimately resolved as real letters/digits, returns empty string.
    Never guesses or manufactures fake characters.
    """
    if not raw_text:
        return ""
    
    cleaned = re.sub(r'[^A-Za-z0-9]', '', raw_text).upper()
    if len(cleaned) < 7:
        return ""
    
    # If already valid Zimbabwe format:
    # Zimbabwe civilian plates start with 'A' (series AAA to AZZ).
    # If the 1st char was misread as 'D', 'O', '4', 'Q' (common font distortions of 'A'), rectify to 'A'
    cand = cleaned[:7]
    if cand[0] in ['D', 'O', '4', 'Q'] and cand[1:3].isalpha() and cand[3:7].isdigit():
        cand = 'A' + cand[1:]
    
    if _validate_zim_plate(cand):
        return cand
    
    # Candidate A: chars [0:3] letters, [3:7] digits
    pfx_a = [_force_letter(c) for c in cleaned[:3]]
    sfx_a = [_force_digit(c) for c in cleaned[3:7]]
    
    if all(pfx_a) and all(sfx_a):
        # Count how many replacements were made
        mutations = sum(1 for i, c in enumerate(cleaned[:3]) if not c.isalpha()) + \
                    sum(1 for i, c in enumerate(cleaned[3:7]) if not c.isdigit())
        if mutations <= 2:  # Only allow max 2 lookalike corrections
            return "".join(pfx_a) + "".join(sfx_a)
    
    # Candidate B: if 8+ chars (e.g. screw/crest at position 3), try [0:3] and [4:8]
    if len(cleaned) >= 8:
        sfx_b = [_force_digit(c) for c in cleaned[4:8]]
        if all(pfx_a) and all(sfx_b):
            mutations_b = sum(1 for i, c in enumerate(cleaned[:3]) if not c.isalpha()) + \
                          sum(1 for i, c in enumerate(cleaned[4:8]) if not c.isdigit())
            if mutations_b <= 2:
                return "".join(pfx_a) + "".join(sfx_b)
    
    return ""


def _preprocess_pipelines(crop):
    """Generate preprocessed versions optimized for embossed yellow plates.
    Includes binarized, inverted, raw color, and grayscale versions at multiple scales."""
    h, w = crop.shape[:2]
    images = []
    
    for scale_name, scale, sigma, alpha in [
        ("3x", 3.0, 2.0, 2.0),
        ("4x", 4.0, 2.5, 2.2),
        ("5x", 5.0, 3.0, 2.5),
    ]:
        resized = cv2.resize(crop, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LANCZOS4)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        
        # Sharpened Otsu
        gauss = cv2.GaussianBlur(gray, (0, 0), sigma)
        sharp = cv2.addWeighted(gray, alpha, gauss, -(alpha - 1.0), 0)
        _, otsu = cv2.threshold(sharp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if np.mean(otsu) < 127:
            otsu = cv2.bitwise_not(otsu)
        
        images.append((f"otsu_{scale_name}", otsu))
        images.append((f"otsu_inv_{scale_name}", cv2.bitwise_not(otsu)))
        
        # At 5x, also try raw color and enhanced grayscale
        # (EasyOCR sometimes reads digits better on unprocessed images)
        if scale_name == "5x":
            images.append(("color_5x", resized))
            images.append(("gray_5x", cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR) if len(resized.shape) == 2 else resized))
            # Sharpened grayscale (no binarization)
            sharp_gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized
            gauss_g = cv2.GaussianBlur(sharp_gray, (0, 0), 1.5)
            sharpened_gray = cv2.addWeighted(sharp_gray, 1.8, gauss_g, -0.8, 0)
            images.append(("sharp_gray_5x", sharpened_gray))
    
    # CLAHE at 5x
    r5 = cv2.resize(crop, (int(w * 5), int(h * 5)), interpolation=cv2.INTER_LANCZOS4)
    lab = cv2.cvtColor(r5, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    cl = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
    enhanced = cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)
    images.append(("clahe_5x", enhanced))
    
    return images


def _run_ocr_on_image(img):
    """Run EasyOCR on a single preprocessed image."""
    if ocr_reader is None or not hasattr(ocr_reader, 'readtext'):
        return "", 0.0
    try:
        results = ocr_reader.readtext(img, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', paragraph=False)
        if not results:
            return "", 0.0
        results.sort(key=lambda r: r[0][0][0])
        text = "".join([r[1] for r in results]).upper()
        avg_conf = sum(float(r[2]) for r in results) / len(results)
        return text, avg_conf
    except:
        return "", 0.0


def _frame_voting(candidates):
    """Confidence-weighted voting across pipelines for a single frame.
    STRICT: Only returns plates that pass Zimbabwe format validation (3 letters + 4 digits)."""
    if not candidates:
        return "", 0.0
    
    # Rectify all candidates and keep only valid 7-char plates
    rectified = []
    for text, conf in candidates:
        if text:
            r = rectify_zim_plate(text)
            if _validate_zim_plate(r):
                rectified.append((r, conf))
    
    if not rectified:
        return "", 0.0  # No valid plate from any pipeline
    
    # Winner-takes-all for high confidence
    best = max(rectified, key=lambda x: x[1])
    if best[1] >= 0.65:
        return best
    
    # Confidence-weighted character voting
    if len(rectified) >= 2:
        result = []
        for pos in range(7):
            weights = defaultdict(float)
            for plate, conf in rectified:
                if pos < len(plate):
                    weights[plate[pos]] += conf * conf
            if weights:
                result.append(max(weights, key=weights.get))
        voted = "".join(result)
        avg = sum(c for _, c in rectified) / len(rectified)
        final = rectify_zim_plate(voted)
        if _validate_zim_plate(final):
            return final, avg
        return best  # Fallback to highest confidence single result
    
    return rectified[0]


def _temporal_consensus(readings):
    """Character-level voting across multiple temporal readings of the same plate position.
    
    STRICT: Only uses and produces plates matching 3 letters + 4 digits format.
    Uses confidence-squared weighting so high-quality frames dominate the vote.
    """
    if not readings:
        return "", 0.0
    
    # Only use readings that passed strict validation
    valid = [(t, c) for t, c, _, _ in readings if _validate_zim_plate(t)]
    
    if len(valid) < 2:
        if valid:
            return valid[0]
        # No valid readings at all
        return "", 0.0
    
    # Character-level weighted voting across all temporal samples
    # Use confidence squared to amplify high-quality readings
    result = []
    for pos in range(7):
        weights = defaultdict(float)
        for plate, conf in valid:
            if pos < len(plate):
                weights[plate[pos]] += (conf * conf) + 0.05
        if weights:
            result.append(max(weights, key=weights.get))
    
    voted = "".join(result)
    avg_conf = sum(c for _, c in valid) / len(valid)
    
    # Final strict rectification and validation
    final = rectify_zim_plate(voted)
    if not _validate_zim_plate(final):
        # Fallback to highest confidence individual reading
        best = max(valid, key=lambda x: x[1])
        return best
    
    return final, avg_conf


def _extract_plate_text_local(crop):
    """Run local EasyOCR multi-pipeline with strict quality gating.
    
    Returns (plate_text, confidence). Only returns if confidence >= 0.70.
    """
    if crop is None or crop.size == 0 or ocr_reader is None:
        return "", 0.0

    h, w = crop.shape[:2]
    if h == 0 or w == 0:
        return "", 0.0
    
    candidates = []
    try:
        pipeline_images = _preprocess_pipelines(crop)
        for name, img in pipeline_images:
            text, conf = _run_ocr_on_image(img)
            cleaned = re.sub(r'[^A-Za-z0-9]', '', text)
            if cleaned and len(cleaned) >= 7 and conf >= 0.60:
                candidates.append((text, conf))
        
        # Focused digit-zone OCR pass
        if ocr_reader and hasattr(ocr_reader, 'readtext') and candidates:
            best_prefix = ""
            best_pconf = 0.0
            for text, conf in candidates:
                r = rectify_zim_plate(text)
                if _validate_zim_plate(r) and conf > best_pconf:
                    best_prefix = r[:3]
                    best_pconf = conf
            
            if best_prefix:
                digit_x_start = int(w * 0.40)
                digit_crop = crop[:, digit_x_start:]
                if digit_crop.size > 0:
                    dh, dw = digit_crop.shape[:2]
                    for dscale in [4, 5]:
                        d_resized = cv2.resize(digit_crop, (dw * dscale, dh * dscale), interpolation=cv2.INTER_LANCZOS4)
                        d_gray = cv2.cvtColor(d_resized, cv2.COLOR_BGR2GRAY)
                        d_gauss = cv2.GaussianBlur(d_gray, (0, 0), 2.0)
                        d_sharp = cv2.addWeighted(d_gray, 2.0, d_gauss, -1.0, 0)
                        _, d_otsu = cv2.threshold(d_sharp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                        try:
                            d_results = ocr_reader.readtext(d_otsu, allowlist='0123456789', paragraph=False)
                            if d_results:
                                d_results.sort(key=lambda r: r[0][0][0])
                                d_text = "".join([r[1] for r in d_results])
                                d_conf = sum(float(r[2]) for r in d_results) / len(d_results)
                                digits_only = re.sub(r'[^0-9]', '', d_text)
                                if len(digits_only) >= 4 and d_conf >= 0.70:
                                    combined = best_prefix + digits_only[:4]
                                    if _validate_zim_plate(combined):
                                        candidates.append((combined, (best_pconf + d_conf) / 2.0))
                        except:
                            pass
    except Exception as e:
        print(f"[Plate OCR] Error: {e}")

    result_text, result_conf = _frame_voting(candidates)
    
    if not result_text or not _validate_zim_plate(result_text) or result_conf < 0.70:
        return "", 0.0
    
    return result_text, result_conf


import math

# ═══════════════════════════════════════════════════════════════════════════════
# VEHICLE SPATIAL TRACKER: Movement vs Stationary Parking Intelligence
# ═══════════════════════════════════════════════════════════════════════════════
class VehicleSpatialTracker:
    """
    Intelligent Vehicle State & Anti-Duplication Engine.
    
    Prevents continuous detection of the same plate simultaneously and prevents
    parked vehicles from generating duplicate database records/alerts.
    
    1. MOVING VEHICLES: Tracks displacement across frames. Logs ONCE per movement pass.
    2. PARKED VEHICLES: Detects when a vehicle settles into a spot (centroid drift <= 40px).
       Logs ONCE upon parking. As long as it remains parked in that position,
       duplicate database records, image uploads, and siren alerts are 100% SUPPRESSED.
    3. DEPARTURE & RE-ENTRY: If the vehicle vacates the spot (>90s unseen), the lock is released.
       When it returns, it is treated as a new arrival.
    """
    def __init__(self, stationary_pixel_thresh=40, departure_timeout=90.0, motion_cooldown=300.0):
        self.stationary_pixel_thresh = stationary_pixel_thresh
        self.departure_timeout = departure_timeout
        self.motion_cooldown = motion_cooldown
        self.lock = threading.Lock()
        self._vehicles = {}

    def evaluate_and_track(self, cam_id, plate_text, x1, y1, x2, y2, now=None):
        """
        Evaluate if this plate detection should be committed to database/alerts.
        Returns: (should_commit: bool, vehicle_state: str, reason: str)
        """
        if now is None:
            now = time.time()
            
        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        key = f"{cam_id}_{plate_text}"
        
        with self.lock:
            # Clean up stale vehicles (unseen > 15 minutes)
            stale_keys = [k for k, v in self._vehicles.items() if now - v['last_seen'] > 900.0]
            for k in stale_keys:
                del self._vehicles[k]
                
            if key not in self._vehicles:
                # First time seeing this vehicle in this camera session
                self._vehicles[key] = {
                    'cam_id': cam_id,
                    'plate_text': plate_text,
                    'cx': cx,
                    'cy': cy,
                    'first_seen': now,
                    'last_seen': now,
                    'last_committed': now,
                    'state': 'MOVING',
                    'committed_count': 1,
                    'position_history': [(cx, cy, now)],
                }
                return True, 'MOVING', 'Initial vehicle detection'
            
            v = self._vehicles[key]
            prev_cx = v['cx']
            prev_cy = v['cy']
            drift = math.hypot(cx - prev_cx, cy - prev_cy)
            time_unseen = now - v['last_seen']
            time_since_commit = now - v['last_committed']
            
            # Update last seen timestamp & position history
            v['last_seen'] = now
            v['position_history'].append((cx, cy, now))
            v['position_history'] = v['position_history'][-8:]
            
            # If vehicle was gone for > departure_timeout (e.g. left and returned)
            if time_unseen > self.departure_timeout:
                v['cx'] = cx
                v['cy'] = cy
                v['first_seen'] = now
                v['last_committed'] = now
                v['state'] = 'MOVING'
                v['committed_count'] += 1
                return True, 'ARRIVING', 'Vehicle returned after departure'
            
            # Check if vehicle is stationary in the same spot
            recent_drifts = [math.hypot(p[0] - prev_cx, p[1] - prev_cy) for p in v['position_history']]
            is_stationary = max(recent_drifts) <= self.stationary_pixel_thresh
            
            if is_stationary:
                duration_present = now - v['first_seen']
                
                # If it was moving and has now stayed stationary for >= 2 seconds: mark as PARKED
                if v['state'] != 'PARKED' and duration_present >= 2.0:
                    v['state'] = 'PARKED'
                    v['cx'] = cx
                    v['cy'] = cy
                    
                    # If we only committed once on initial motion and it has been >= 20s, commit confirmed PARKED state
                    if time_since_commit > 20.0 and v['committed_count'] < 2:
                        v['last_committed'] = now
                        v['committed_count'] += 1
                        return True, 'PARKED', 'Vehicle parked in position'
                    else:
                        # Otherwise suppress duplicate (already recorded on arrival)
                        return False, 'PARKED', 'Vehicle parked (duplicate suppressed)'
                
                # If already in PARKED state, STRICTLY SUPPRESS all duplicate commits!
                return False, 'PARKED', f'Parked in place at ({prev_cx},{prev_cy})'
            
            else:
                # Vehicle is moving (drift > threshold)
                v['cx'] = cx
                v['cy'] = cy
                
                if v['state'] == 'PARKED':
                    v['state'] = 'MOVING'
                    v['first_seen'] = now
                    # Only re-commit departure motion if it has been away from commit window
                    if time_since_commit > self.motion_cooldown:
                        v['last_committed'] = now
                        v['committed_count'] += 1
                        return True, 'MOVING', 'Vehicle departed from parking bay'
                    else:
                        return False, 'MOVING', 'Moving within cooldown'
                
                # Moving vehicle: suppress continuous multi-frame spam
                if time_since_commit < self.motion_cooldown:
                    return False, 'MOVING', f'Moving in view ({int(time_since_commit)}s < {int(self.motion_cooldown)}s)'
                
                v['last_committed'] = now
                v['committed_count'] += 1
                return True, 'MOVING', 'Active moving pass'

# Global Spatial Tracking Instance
spatial_tracker = VehicleSpatialTracker()


def _spatial_key(camera_id, x1, y1, x2, y2):
    """Generate a spatial key for a plate bounding box position."""
    cx = (x1 + x2) // 2
    cy = (y1 + y2) // 2
    gx = cx // 50
    gy = cy // 50
    return f"{camera_id}:{gx}:{gy}"


def _hex_to_bgr(hex_str, default=(255, 140, 0)):
    """Convert hex color e.g. #10B981 or #EF4444 to OpenCV BGR tuple."""
    if not hex_str or not hex_str.startswith('#') or len(hex_str) != 7:
        return default
    try:
        r = int(hex_str[1:3], 16)
        g = int(hex_str[3:5], 16)
        b = int(hex_str[5:7], 16)
        return (b, g, r)
    except:
        return default


def _commit_plate(frame, plate_crop, x1, y1, x2, y2,
                  plate_text, confidence, num_readings, camera, model, settings, source='auto', plate_info=None, vehicle_state='MOVING'):
    """Commit a recognized plate to the database and upload snapshots with owner highlighting.
    
    Shared by all three tiers (memory, gemini, easyocr).
    """
    h_frame, w_frame = frame.shape[:2]
    cam_id = camera['id']
    now = time.time()
    
    # Retrieve owner info if not passed
    if plate_info is None and HAS_PLATE_MEMORY:
        try:
            import plate_memory
            plate_info = plate_memory.get_plate_info(plate_text)
        except:
            plate_info = None

    owner_name = plate_info.get('owner_name', '') if plate_info else ''
    vehicle_desc = plate_info.get('vehicle_desc', '') if plate_info else ''
    tag = plate_info.get('tag', 'unknown') if plate_info else 'unknown'
    highlight_color_hex = plate_info.get('highlight_color', '#64748B') if plate_info else '#64748B'
    alert_on_detect = plate_info.get('alert_on_detect', False) if plate_info else False

    # Tag labels & default colors
    tag_icons = {
        'unknown': 'UNKNOWN',
        'vip': 'VIP',
        'staff': 'Staff',
        'resident': 'Resident',
        'visitor': 'Visitor',
        'watchlist': 'WATCHLIST',
        'blocked': 'BLOCKED',
    }
    tag_label = tag_icons.get(tag.lower(), 'UNKNOWN')

    # Build Header and Event Description (Clean without moving/parked text)
    if owner_name:
        display_header = f"PLATE: {plate_text} [{tag_label}: {owner_name}]"
        event_label = f"license plate: {plate_text} ({owner_name} - {tag.upper()})"
    elif tag.lower() != 'unknown':
        display_header = f"PLATE: {plate_text} [{tag_label}]"
        event_label = f"license plate: {plate_text} ({tag.upper()})"
    else:
        display_header = f"PLATE: {plate_text}"
        event_label = f"license plate: {plate_text}"

    # Custom box color from highlight_color
    box_color = _hex_to_bgr(highlight_color_hex, default=(139, 116, 100))

    # Draw bounding box on snapshot
    snap = frame.copy()
    cv2.rectangle(snap, (x1, y1), (x2, y2), box_color, 3)
    
    font_scale = 0.55
    (text_w, text_h), _ = cv2.getTextSize(display_header, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 2)
    banner_w = max(text_w + 20, (x2 - x1) + 20)
    
    cv2.rectangle(snap, (x1, max(0, y1 - 38)), (min(w_frame, x1 + banner_w), y1), box_color, -1)
    cv2.putText(snap, display_header, (x1 + 6, max(14, y1 - 12)),
                cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), 2)

    # Upload snapshot
    ret_snap, buf_snap = cv2.imencode('.jpg', snap)
    snapshot_url = ""
    if ret_snap:
        try:
            fname = f"events/{cam_id}_plate_{int(now)}.jpg"
            supabase.storage.from_("event-snapshots").upload(fname, buf_snap.tobytes(), {"content-type": "image/jpeg"})
            snapshot_url = supabase.storage.from_("event-snapshots").get_public_url(fname)
            if hasattr(snapshot_url, 'publicUrl'):
                snapshot_url = snapshot_url.publicUrl
        except Exception as e:
            print(f"[{camera['name']}] Snapshot upload error: {e}")

    # Upload plate crop
    ret_crop, buf_crop = cv2.imencode('.jpg', plate_crop)
    crop_url = ""
    if ret_crop:
        try:
            crop_fname = f"plate-crops/{cam_id}_{int(now)}_{plate_text}.jpg"
            supabase.storage.from_("event-snapshots").upload(crop_fname, buf_crop.tobytes(), {"content-type": "image/jpeg"})
            crop_url = supabase.storage.from_("event-snapshots").get_public_url(crop_fname)
            if hasattr(crop_url, 'publicUrl'):
                crop_url = crop_url.publicUrl
        except Exception as e:
            print(f"[{camera['name']}] Crop upload error: {e}")

    # Insert into number_plates
    try:
        insert_record = {
            "plate_text": plate_text,
            "camera_id": cam_id,
            "confidence": round(confidence * 100, 1),
            "snapshot_url": crop_url or snapshot_url,
        }
        if owner_name: insert_record["owner_name"] = owner_name
        if tag: insert_record["tag"] = tag
        if highlight_color_hex: insert_record["highlight_color"] = highlight_color_hex
        insert_record["vehicle_state"] = vehicle_state
        
        try:
            supabase.table('number_plates').insert(insert_record).execute()
        except Exception:
            # Fallback without vehicle_state if column not created yet
            rec_fallback = {k: v for k, v in insert_record.items() if k != 'vehicle_state'}
            try:
                supabase.table('number_plates').insert(rec_fallback).execute()
            except Exception:
                supabase.table('number_plates').insert({
                    "plate_text": plate_text,
                    "camera_id": cam_id,
                    "confidence": round(confidence * 100, 1),
                    "snapshot_url": crop_url or snapshot_url,
                }).execute()
        print(f"[{camera['name']}] Synced to DB: {plate_text} [{vehicle_state}] (Owner: {owner_name or 'Unassigned'}, Tag: {tag}, via {source})", flush=True)
    except Exception as e:
        print(f"[{camera['name']}] DB insert error: {e}")

    # Insert into events
    metadata = {
        "plate_text": plate_text,
        "owner_name": owner_name,
        "vehicle_desc": vehicle_desc,
        "tag": tag,
        "vehicle_state": vehicle_state,
        "highlight_color": highlight_color_hex,
        "alert_on_detect": alert_on_detect,
        "crop_url": crop_url,
        "box": [x1, y1, x2, y2],
        "model_type": "license_plate_detection",
        "source": source,
        "temporal_readings": num_readings,
    }
    try:
        supabase.table('events').insert({
            "camera_id": cam_id,
            "ai_model_id": model['id'],
            "event_type": event_label,
            "confidence": round(confidence * 100, 1),
            "snapshot_url": snapshot_url,
            "metadata": metadata,
            "acknowledged": False,
        }).execute()
        
        # Siren / Alert Override: Only alert if explicitly enabled or on watchlist/blocked
        is_watchlist = tag.lower() in ['watchlist', 'blocked']
        if alert_on_detect or is_watchlist:
            event_data = {
                "event_type": event_label,
                "confidence": round(confidence * 100, 1),
                "camera_name": camera['name'],
                "snapshot_url": snapshot_url,
                "owner_name": owner_name,
                "tag": tag,
                "vehicle_state": vehicle_state,
            }
            threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
        return True
    except Exception as e:
        print(f"[{camera['name']}] Event insert error: {e}")

    return False


def _process_candidate_plate(frame, x1, y1, x2, y2, conf, camera, model, settings):
    """Process a plate detection with Movement & Parking Spatial Intelligence:
    1. Check Plate Memory (instant, 100% accurate recall with owner profile)
    2. Try Gemini Vision OCR (human-level vision accuracy)
    3. Fall back to EasyOCR with strict >=75% confidence gating
    """
    h_frame, w_frame = frame.shape[:2]
    w = x2 - x1
    h = y2 - y1

    if w < 25 or h < 10:
        return False
    aspect_ratio = w / float(h)
    if aspect_ratio < 1.2 or aspect_ratio > 6.0:
        return False

    # Pad 10% around plate
    pad_x = int(w * 0.10)
    pad_y = int(h * 0.10)
    crop_x1 = max(0, x1 - pad_x)
    crop_y1 = max(0, y1 - pad_y)
    crop_x2 = min(w_frame, x2 + pad_x)
    crop_y2 = min(h_frame, y2 + pad_y)
    plate_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]

    if plate_crop.size == 0:
        return False

    cam_id = camera['id']
    now = time.time()
    skey = _spatial_key(cam_id, x1, y1, x2, y2)
    
    # ═══════════════════════════════════════════════════════════════════
    # TIER 1: Visual Plate Memory (instant match + owner profile)
    # ═══════════════════════════════════════════════════════════════════
    if HAS_PLATE_MEMORY:
        memory_text, memory_conf, memory_info = lookup_plate(plate_crop)
        if memory_text and _validate_zim_plate(memory_text):
            should_log, v_state, reason = spatial_tracker.evaluate_and_track(
                cam_id, memory_text, x1, y1, x2, y2, now
            )
            if not should_log:
                return False
            
            owner_str = f" ({memory_info.get('owner_name')})" if memory_info and memory_info.get('owner_name') else ""
            print(f"[{camera['name']}] 🧠 PLATE MEMORY MATCH [{v_state}]: {memory_text}{owner_str} (conf: {memory_conf:.2f}) — {reason}", flush=True)
            return _commit_plate(frame, plate_crop, x1, y1, x2, y2, 
                               memory_text, memory_conf, 1, camera, model, settings, source='memory', plate_info=memory_info, vehicle_state=v_state)
    
    # ═══════════════════════════════════════════════════════════════════
    # TIER 2: Gemini Vision OCR (human-level vision accuracy)
    # ═══════════════════════════════════════════════════════════════════
    if HAS_GEMINI and gemini_available():
        try:
            gemini_text, gemini_conf = read_plate_gemini(plate_crop, scale=2)
            if gemini_text:
                rectified = rectify_zim_plate(gemini_text)
                if _validate_zim_plate(rectified):
                    should_log, v_state, reason = spatial_tracker.evaluate_and_track(
                        cam_id, rectified, x1, y1, x2, y2, now
                    )
                    if not should_log:
                        return False
                    
                    plate_info = None
                    if HAS_PLATE_MEMORY:
                        import plate_memory
                        plate_info = plate_memory.get_plate_info(rectified)
                        store_plate(plate_crop, rectified, source='gemini')
                    
                    owner_str = f" ({plate_info.get('owner_name')})" if plate_info and plate_info.get('owner_name') else ""
                    print(f"[{camera['name']}] 🤖 GEMINI VISION READ [{v_state}]: {rectified}{owner_str} (conf: {gemini_conf:.2f}) — {reason}", flush=True)
                    
                    return _commit_plate(frame, plate_crop, x1, y1, x2, y2,
                                        rectified, gemini_conf, 1, camera, model, settings, source='gemini', plate_info=plate_info, vehicle_state=v_state)
        except Exception as e:
            print(f"[{camera['name']}] Gemini error: {e}")
    
    # ═══════════════════════════════════════════════════════════════════
    # TIER 3: EasyOCR Local Fallback (Strict Gate: >= 75% confidence)
    # ═══════════════════════════════════════════════════════════════════
    frame_text, frame_conf = _extract_plate_text_local(plate_crop)
    if not frame_text or not _validate_zim_plate(frame_text) or frame_conf < 0.70:
        return False

    # --- Temporal Consensus Engine ---
    with _temporal_lock:
        _temporal_buffer[skey] = [
            (t, c, ts, cr) for t, c, ts, cr in _temporal_buffer[skey]
            if now - ts < TEMPORAL_WINDOW
        ]
        _temporal_buffer[skey].append((frame_text, frame_conf, now, plate_crop.copy()))
        
        readings = _temporal_buffer[skey]
        num_readings = len(readings)
        
        last_commit_time = _last_committed.get(skey, 0)
        time_since_commit = now - last_commit_time
        
        should_commit = False
        if num_readings >= TEMPORAL_MIN_READINGS and time_since_commit >= TEMPORAL_COMMIT_INTERVAL:
            should_commit = True
        elif num_readings >= 1 and frame_conf >= 0.85 and time_since_commit >= 30:
            should_commit = True
        
        if not should_commit:
            return False
        
        plate_text, consensus_conf = _temporal_consensus(readings)
        best_crop = max(readings, key=lambda r: r[1])[3]
        
        _last_committed[skey] = now
        _temporal_buffer[skey] = []
    
    # MUST have high consensus confidence (never commit low-confidence hallucinations)
    if not plate_text or not _validate_zim_plate(plate_text) or consensus_conf < 0.75:
        return False

    # Movement vs Parked Evaluation
    should_log, v_state, reason = spatial_tracker.evaluate_and_track(
        cam_id, plate_text, x1, y1, x2, y2, now
    )
    if not should_log:
        return False

    plate_info = None
    if HAS_PLATE_MEMORY:
        import plate_memory
        plate_info = plate_memory.get_plate_info(plate_text)
        store_plate(best_crop, plate_text, source='easyocr')

    owner_str = f" ({plate_info.get('owner_name')})" if plate_info and plate_info.get('owner_name') else ""
    print(f"[{camera['name']}] 📷 EASYOCR COMMITTED [{v_state}]: PLATE: {plate_text}{owner_str} "
          f"(consensus from {num_readings} readings, conf: {consensus_conf:.2f}) — {reason}", flush=True)

    return _commit_plate(frame, best_crop, x1, y1, x2, y2,
                        plate_text, consensus_conf, num_readings, camera, model, settings, source='easyocr', plate_info=plate_info, vehicle_state=v_state)


def handle(frame, results, camera, model, ai_model, conf_threshold,
           settings, camera_zones, alert_rules, tracker, frame_count, skip_frames):
    """Hierarchical License Plate Detection with Temporal Consensus."""
    detected = False
    candidates = []

    # 1. Direct detections
    for r in results:
        for box in r.boxes:
            conf = float(box.conf[0])
            if conf >= min(conf_threshold, 0.28):
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                candidates.append((x1, y1, x2, y2, conf))

    # 2. Two-Stage Zoom
    v_detector = _get_vehicle_detector()
    if v_detector is not None:
        try:
            v_results = v_detector(frame, verbose=False)
            for vr in v_results:
                for vb in vr.boxes:
                    lbl = v_detector.names[int(vb.cls[0])]
                    if lbl in ('car', 'truck', 'bus', 'motorcycle') and float(vb.conf[0]) >= 0.35:
                        vx1, vy1, vx2, vy2 = map(int, vb.xyxy[0].tolist())
                        if (vx2 - vx1) < 40 or (vy2 - vy1) < 40:
                            continue
                        vcrop = frame[vy1:vy2, vx1:vx2]
                        if vcrop.size == 0:
                            continue
                        p_res = ai_model(vcrop, verbose=False)
                        for pr in p_res:
                            for pb in pr.boxes:
                                p_conf = float(pb.conf[0])
                                if p_conf >= min(conf_threshold, 0.30):
                                    px1, py1, px2, py2 = map(int, pb.xyxy[0].tolist())
                                    candidates.append((vx1+px1, vy1+py1, vx1+px2, vy1+py2, p_conf))
        except Exception as e:
            print(f"[{camera['name']}] Zoom error: {e}")

    for x1, y1, x2, y2, conf in candidates:
        if _process_candidate_plate(frame, x1, y1, x2, y2, conf, camera, model, settings):
            detected = True

    return detected
