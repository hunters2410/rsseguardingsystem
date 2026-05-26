import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from model_hub import get_model_path as hub_get_model_path
import logging
from logging.handlers import RotatingFileHandler
import cv2
import time
import threading
import socket
import uuid
import platform
from urllib.parse import quote_plus
from dotenv import load_dotenv
from supabase import create_client, Client
from ultralytics import YOLO
import ultralytics
import requests
import numpy as np
from datetime import datetime
import torch
import re
import zipfile
import shutil
from pathlib import Path
from paddleocr import PaddleOCR
# Register YOLO model classes as safe globals for PyTorch 2.6+ weights_only=True.
# This is the recommended approach instead of monkey-patching torch.load:
# it explicitly whitelists only the classes YOLO needs, preserving pickle safety
# for all other torch.load calls in the process.
try:
    torch.serialization.add_safe_globals([
        ultralytics.nn.tasks.DetectionModel,
        ultralytics.nn.tasks.SegmentationModel,
        ultralytics.nn.tasks.PoseModel,
    ])
except AttributeError:
    # PyTorch < 2.6 does not have add_safe_globals — no action needed.
    pass

# ... (omitted lines)


# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") # Try VITE prefix first
if not SUPABASE_URL:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_KEY:
    SUPABASE_KEY = os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_KEY:
    SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in .env")
    exit(1)

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Rotating file logger (max 5 MB × 3 backups) ─────────────────────────────
_log_handler = RotatingFileHandler('ai_log.txt', maxBytes=5 * 1024 * 1024, backupCount=3)
_log_handler.setFormatter(logging.Formatter('[%(asctime)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S'))
ai_logger = logging.getLogger('ai_server')
ai_logger.setLevel(logging.INFO)
ai_logger.addHandler(_log_handler)
ai_logger.addHandler(logging.StreamHandler())  # also echo to stdout

# Global dictionary to keep track of active streams and models
# Structure: { "camera_id_model_id": { "stop_event": Event, "thread": Thread } }
active_monitors = {}
EVENT_COOLDOWN = 5.0  # seconds between alerts on a single camera

# Object tracking for movement detection
# Structure: { "camera_id": { "object_id": {"last_position": (x,y), "last_seen": timestamp, "total_movement": float} } }
object_trackers = {}

# Crowd detection: last alert timestamp per camera (camera_id -> float)
crowd_last_alert = {}

# Dress code: last alert timestamp per (camera_id, grid_cell) to avoid spam
dress_code_last_alert = {}

# Plate OCR reader and cooldowns
ocr_reader = PaddleOCR(use_angle_cls=True, lang='en', det_db_thresh=0.3, det_db_box_thresh=0.5)
plate_cooldowns = {}

# Loitering detection: { "<camera_id>_<grid_cell>" -> {first_seen, cam_id, alerted} }
# Keys are prefixed with cam_id to prevent cross-camera collisions.
loiter_tracker = {}

# Abandoned object detection: { "<camera_id>_<grid_cell>" -> {first_seen, cam_id, alerted} }
# Keys are prefixed with cam_id to prevent cross-camera collisions.
abandoned_tracker = {}

# Illegal parking detection: { "<camera_id>_<grid_cell>" -> {first_seen, cam_id, alerted, label} }
# Keys are prefixed with cam_id to prevent cross-camera collisions.
parking_tracker = {}

# Camera tamper detection: last alert time per camera_id
tamper_last_alert = {}

# ── Face Recognition Library Cache ────────────────────────────────────────────
# Loaded once at startup, refreshed every 5 minutes.
# Structure: list of { id, name, role, department, photo_url, encoding }
face_library_cache: list = []
face_library_last_loaded: float = 0.0
FACE_LIBRARY_TTL = 300  # seconds (5 min)
face_library_lock = threading.Lock()

# ── Thread-safety locks ────────────────────────────────────────────────────────
# object_trackers top-level dict is written by multiple threads (one per camera);
# each per-camera sub-dict is only touched by that camera's thread (safe without lock).
# Cooldown dicts are read+written by all camera threads — lock prevents double-alerts.
_trackers_lock  = threading.Lock()  # guards object_trackers top-level ops
_cooldowns_lock = threading.Lock()  # guards crowd/dress_code/tamper/plate cooldowns


# Machine Identity
DEVICE_ID_FILE = "device_id.txt"
if os.path.exists(DEVICE_ID_FILE):
    with open(DEVICE_ID_FILE, 'r') as f:
        SERVER_UUID = f.read().strip()
else:
    SERVER_UUID = str(uuid.uuid4())
    with open(DEVICE_ID_FILE, 'w') as f:
        f.write(SERVER_UUID)


# ── Face Library Loader ────────────────────────────────────────────────────────
def load_face_library(force: bool = False):
    """Fetch known_face_photos from Supabase and build face encodings.
    Uses the `face_recognition` library if available, otherwise stores
    raw photo URLs for fallback histogram comparison."""
    global face_library_cache, face_library_last_loaded
    now = time.time()
    if not force and (now - face_library_last_loaded) < FACE_LIBRARY_TTL:
        return  # Still fresh
    try:
        # Join known_faces + known_face_photos
        resp = supabase.table('known_face_photos') \
            .select('id, known_face_id, photo_url, angle, known_faces(id, name, role, department, is_active)') \
            .execute()
        rows = resp.data or []

        try:
            import face_recognition as fr
            USE_FR = True
        except ImportError:
            USE_FR = False
            print("[FaceLib] face_recognition not installed — using histogram fallback")

        new_cache = []
        for row in rows:
            face_info = row.get('known_faces') or {}
            if not face_info.get('is_active', True):
                continue  # Skip inactive people
            photo_url = row.get('photo_url', '')
            try:
                img_resp = requests.get(photo_url, timeout=10)
                img_arr = np.frombuffer(img_resp.content, np.uint8)
                img_bgr = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
                if img_bgr is None:
                    continue
                if USE_FR:
                    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
                    encs = fr.face_encodings(img_rgb)
                    if not encs:
                        continue
                    encoding = encs[0]
                else:
                    # Fallback: 3-channel histogram as fingerprint
                    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
                    hist = cv2.calcHist([img_rgb], [0, 1, 2], None, [8, 8, 8], [0, 256]*3)
                    encoding = cv2.normalize(hist, hist).flatten()
                new_cache.append({
                    'face_id': face_info.get('id'),
                    'name': face_info.get('name', 'Unknown'),
                    'role': face_info.get('role', 'employee'),
                    'department': face_info.get('department', ''),
                    'photo_url': photo_url,
                    'encoding': encoding,
                    'use_fr': USE_FR,
                })
            except Exception as e:
                print(f"[FaceLib] Failed to encode {photo_url}: {e}")

        with face_library_lock:
            face_library_cache = new_cache
            face_library_last_loaded = now
        print(f"[FaceLib] Loaded {len(new_cache)} face encodings from {len(rows)} photos")
    except Exception as e:
        print(f"[FaceLib] Load error: {e}")


def match_face(face_crop_bgr, threshold: float = 0.55):
    """Compare a cropped face image against the library.
    Returns (matched: bool, name: str, role: str, department: str, confidence: float)"""
    load_face_library()  # Refresh if stale
    with face_library_lock:
        if not face_library_cache:
            return False, 'Unknown', '', '', 0.0
        use_fr = face_library_cache[0].get('use_fr', False)

    try:
        if use_fr:
            import face_recognition as fr
            img_rgb = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)
            encs = fr.face_encodings(img_rgb)
            if not encs:
                return False, 'Unknown', '', '', 0.0
            query_enc = encs[0]
            with face_library_lock:
                entries = list(face_library_cache)
            distances = fr.face_distance([e['encoding'] for e in entries], query_enc)
            idx = int(np.argmin(distances))
            dist = float(distances[idx])
            confidence = max(0.0, 1.0 - dist)
            if dist <= threshold:
                e = entries[idx]
                return True, e['name'], e['role'], e['department'], confidence
            return False, 'Unknown', '', '', confidence
        else:
            # Histogram fallback
            img_rgb = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)
            hist = cv2.calcHist([img_rgb], [0, 1, 2], None, [8, 8, 8], [0, 256]*3)
            query_hist = cv2.normalize(hist, hist).flatten()
            best_score, best_entry = 0.0, None
            with face_library_lock:
                entries = list(face_library_cache)
            for e in entries:
                score = float(np.dot(query_hist, e['encoding']))
                if score > best_score:
                    best_score, best_entry = score, e
            if best_entry and best_score > 0.75:
                return True, best_entry['name'], best_entry['role'], best_entry['department'], best_score
            return False, 'Unknown', '', '', best_score
    except Exception as ex:
        print(f"[FaceLib] match_face error: {ex}")
        return False, 'Unknown', '', '', 0.0


# Geometry Helper Functions
def point_in_polygon(point, polygon_points):
    """
    Ray-casting algorithm to check if a point is inside a polygon.
    point: (x, y) in absolute pixels
    polygon_points: list of [norm_x, norm_y] normalized 0-1, scaled by caller
    """
    x, y = point
    n = len(polygon_points)
    inside = False
    px, py = polygon_points[0]
    for i in range(1, n + 1):
        qx, qy = polygon_points[i % n]
        if min(py, qy) < y <= max(py, qy):
            if x < (qx - px) * (y - py) / (qy - py + 1e-10) + px:
                inside = not inside
        px, py = qx, qy
    return inside

def check_zone_containment(position, camera_zones, frame_shape):
    """
    Returns True if the position (abs pixels) is inside ANY active polygon zone.
    Ignores 'line' type zones (those use crossing logic instead).
    """
    h, w = frame_shape[:2]
    for zone in camera_zones:
        if not zone.get('alert_enabled', True):
            continue
        if zone.get('type') == 'zone':
            pts = zone.get('points', [])
            if len(pts) < 3:
                continue
            # Scale normalized points to absolute pixels
            abs_pts = [(p[0] * w, p[1] * h) for p in pts]
            if point_in_polygon(position, abs_pts):
                return True
    return False

def has_active_polygon_zones(camera_zones):
    """Returns True if camera has at least one enabled polygon zone."""
    return any(z.get('type') == 'zone' and z.get('alert_enabled', True) for z in camera_zones)

def ccw(A, B, C):
    return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])

def intersect(A, B, C, D):
    """Return true if line segments AB and CD intersect"""
    return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)

def check_zone_crossing(prev_pos, curr_pos, zone_line):
    """Check if movement from prev_pos to curr_pos crosses a zone_line."""
    A = prev_pos
    B = curr_pos
    C = tuple(zone_line[0])
    D = tuple(zone_line[1])
    return intersect(A, B, C, D)

def is_within_schedule(rule):
    """
    Returns True if the current time/day falls within the rule's active schedule.
    If schedule_enabled is False or missing, always returns True (24/7 mode).
    Supports overnight ranges e.g. 22:00 -> 06:00.
    """
    if not rule or not rule.get('schedule_enabled', False):
        return True

    now = datetime.now()
    day_map = {0: 'Mon', 1: 'Tue', 2: 'Wed', 3: 'Thu', 4: 'Fri', 5: 'Sat', 6: 'Sun'}
    today = day_map[now.weekday()]

    active_days = rule.get('schedule_days', ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])
    if today not in active_days:
        return False

    try:
        start_str = rule.get('schedule_start', '00:00')
        end_str   = rule.get('schedule_end',   '23:59')
        sh, sm = map(int, start_str.split(':'))
        eh, em = map(int, end_str.split(':'))
    except Exception:
        return True  # Bad format — don't block

    cur  = now.hour * 60 + now.minute
    start = sh * 60 + sm
    end   = eh * 60 + em

    if start <= end:
        return start <= cur <= end
    else:
        # Overnight: e.g. 22:00 -> 06:00
        return cur >= start or cur <= end


def register_server():
    """Registers this local computer as an AI Server in the database"""
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)
    
    print(f"Registering local server: {hostname} ({SERVER_UUID})")
    
    data = {
        "id": SERVER_UUID,
        "name": f"{hostname} (Local)",
        "ip_address": ip_address,
        "port": 8888, 
        "status": "online",
        "gpu_model": "Integrated/CPU",
        "cpu_cores": os.cpu_count(),
        "memory_gb": 8
    }
    
    try:
        supabase.table('ai_servers').upsert(data).execute()
        print("Server registered successfully!")
        return SERVER_UUID
    except Exception as e:
        print(f"Registration failed: {e}")
        return SERVER_UUID

# download_model() was removed — superseded by model_hub.get_model_path().
# All model resolution now goes through model_hub.py.

import smtplib
from email.mime.text import MIMEText

def send_email_alert(settings, event_data):
    if not settings.get('alert_email_enabled'): return
    
    try:
        # Fetch notification list
        recipients = []
        try:
            resp = supabase.table('notification_emails').select('email').execute()
            if resp.data:
                recipients = [r['email'] for r in resp.data]
        except Exception as ex:
             print(f"Error fetching email list: {ex}")

        # Add admin email
        admin = settings.get('admin_email')
        if admin:
             recipients.append(admin)
        
        # Deduplicate and filter empty
        unique_recipients = list(set([r for r in recipients if r]))

        if not unique_recipients:
             print("No email recipients configured.")
             return

        msg = MIMEText(f"Target Detected: {event_data['event_type']} ({event_data['confidence']:.1f}%)\nCamera: {event_data['camera_name']}\nTime: {datetime.now()}\n\nView Snapshot: {event_data['snapshot_url']}")
        msg['Subject'] = f" Security Alert: {event_data['event_type']} Detected"
        msg['From'] = settings.get('smtp_from')
        msg['To'] = ", ".join(unique_recipients)

        with smtplib.SMTP(settings.get('smtp_host'), settings.get('smtp_port')) as server:
            server.starttls()
            server.login(settings.get('smtp_user'), settings.get('smtp_pass'))
            server.send_message(msg)
        print(f"Email alert sent to {len(unique_recipients)} recipients.")
    except Exception as e:
        print(f"Failed to send email: {e}")

def send_sms_alert(settings, event_data):
    if not settings.get('alert_sms_enabled'): return
    
    # Example for Twilio
    if settings.get('sms_provider') == 'twilio':
        try:
            account_sid = settings.get('sms_account_sid')
            auth_token = settings.get('sms_auth_token')
            url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
            
            data = {
                "From": settings.get('sms_from'),
                "To": settings.get('sms_to', settings.get('alert_phone_number', '')),
                "Body": f"ALARM: {event_data['event_type']} detected on {event_data['camera_name']}. Check dashboard."
            }
            resp = requests.post(url, data=data, auth=(account_sid, auth_token))
            if resp.status_code in [200, 201]:
                print("SMS alert sent.")
            else:
                print(f"SMS failed: {resp.text}")
        except Exception as e:
            print(f"Failed to send SMS: {e}")

def get_system_settings():
    try:
        data = supabase.table('system_settings').select('*').limit(1).execute()
        if data.data:
            return data.data[0]
    except Exception as e:
        print(f"[Settings] Error fetching system settings: {e}")
        return {}
    return {}


def load_zones():
    """Load zones from Supabase camera_zones table"""
    try:
        # Fetch all zones
        response = supabase.table('camera_zones').select('*').execute()
        zones_data = response.data
        
        # Group by camera_id
        zones_map = {}
        for zone in zones_data:
            cid = zone['camera_id']
            if cid not in zones_map:
                zones_map[cid] = []
            
            # Ensure points are list of lists
            # Supabase returns jsonb as python objects (lists/dicts)
            zones_map[cid].append({
                'type': zone['type'],
                'points': zone['points'],
                'label': zone.get('label', 'Zone'),
                'alert_enabled': zone.get('alert_enabled', True)
            })
            
        return zones_map
    except Exception as e:
        print(f"Error loading zones from DB: {e}")
        # Fallback to local file if DB fails? 
        return {}

def load_alert_rules():
    """Load alert rules from Supabase alert_rules table"""
    try:
        response = supabase.table('alert_rules').select('*').execute()
        rules_data = response.data
        
        # Organize by camera_id
        rules_map = {}
        global_rule = None
        
        for rule in rules_data:
            if rule['camera_id'] is None:
                global_rule = rule
            else:
                rules_map[rule['camera_id']] = rule

        # Log the updated_at timestamp so ai_log shows when frontend changes are picked up
        if global_rule:
            ai_logger.info(f"[AlertRules] Global rule updated_at={global_rule.get('updated_at','?')} | "
                           f"{len(rules_map)} camera overrides loaded")
        
        return {
            'global': global_rule,
            'cameras': rules_map
        }
    except Exception as e:
        print(f"Error loading alert rules from DB: {e}")
        # Default: trigger all objects (backward compatible)
        return {
            'global': None,
            'cameras': {}
        }

# =============================================================================
# SHARED CONFIG CACHE
# A single background thread refreshes settings / zones / alert-rules every 5 s.
# Per-stream inference threads read from this cache instead of hitting Supabase
# directly, reducing DB load from O(cameras × 3) queries / 5 s  →  3 queries / 5 s.
# =============================================================================

_config_lock = threading.Lock()

class _ConfigCache:
    """Holds the latest snapshot of system settings, camera zones, and alert rules."""
    def __init__(self):
        self.settings:      dict = {}
        self.zones_map:     dict = {}
        self.alert_rules:   dict = {'global': None, 'cameras': {}}
        self.force_refresh: bool = False  # Set True by commands to skip next 5s sleep

_config = _ConfigCache()


def _config_refresh_thread():
    """Background daemon: keeps _config fresh with one set of DB queries every 5 s.
    Supports early wakeup via _config.force_refresh = True."""
    # Populate immediately so process_stream threads don't start with empty config.
    try:
        with _config_lock:
            _config.settings    = get_system_settings()
            _config.zones_map   = load_zones()
            _config.alert_rules = load_alert_rules()
    except Exception as _e:
        ai_logger.warning(f"[ConfigCache] Initial load error: {_e}")

    while True:
        # Wait up to 5 s but wake immediately if force_refresh is requested
        for _ in range(50):   # 50 × 0.1s = 5 s
            time.sleep(0.1)
            with _config_lock:
                if _config.force_refresh:
                    _config.force_refresh = False
                    ai_logger.info("[ConfigCache] Force-refresh triggered — reloading immediately")
                    break
        try:
            s = get_system_settings()
            z = load_zones()
            r = load_alert_rules()
            with _config_lock:
                _config.settings    = s
                _config.zones_map   = z
                _config.alert_rules = r
        except Exception as _e:
            ai_logger.warning(f"[ConfigCache] Refresh error: {_e}")

def should_trigger_alert(camera_id, object_label, alert_rules):
    """
    Determine if a detected object should trigger an alert based on the
    configured whitelist / blacklist rules for this camera (or the global rule).

    Args:
        camera_id    : Camera UUID
        object_label : Raw detected label BEFORE any zone suffixes (e.g. 'person')
        alert_rules  : Rules dict from load_alert_rules()

    Returns:
        (allowed: bool, reason: str)
    """
    # Prefer camera-specific rule; fall back to global
    rule = alert_rules['cameras'].get(camera_id) or alert_rules['global']

    if not rule:
        return True, "no-rule (default allow)"

    mode             = rule.get('mode', 'whitelist')
    label_lower      = object_label.lower()
    enabled_objects  = [str(o).lower() for o in rule.get('enabled_objects',  [])]
    disabled_objects = [str(o).lower() for o in rule.get('disabled_objects', [])]

    if mode == 'whitelist':
        if not enabled_objects:
            return False, "whitelist is empty — no objects selected"
        allowed = label_lower in enabled_objects
        reason  = f"whitelist {'PASS' if allowed else 'BLOCK'}: '{label_lower}' {'in' if allowed else 'not in'} {enabled_objects}"
        return allowed, reason
    else:  # blacklist
        allowed = label_lower not in disabled_objects
        reason  = f"blacklist {'PASS' if allowed else 'BLOCK'}: '{label_lower}' {'not in' if allowed else 'in'} {disabled_objects}"
        return allowed, reason

# =============================================================================
# DRESS CODE / APPEARANCE DETECTION HELPERS
# =============================================================================

# HSV color range definitions: list of (h_min, h_max, s_min, v_min, v_max)
# OpenCV HSV: H 0-180, S 0-255, V 0-255
_COLOR_DEFS = {
    'red':    [(0, 10, 80, 60, 255), (160, 180, 80, 60, 255)],
    'orange': [(10, 25, 120, 80, 255)],
    'yellow': [(25, 35, 120, 100, 255)],
    'green':  [(35, 85, 60, 40, 255)],
    'blue':   [(85, 130, 60, 40, 255)],
    'navy':   [(100, 130, 80, 20, 80)],
    'purple': [(130, 160, 60, 40, 255)],
    'white':  [(0, 180, 0, 180, 255)],
    'gray':   [(0, 180, 0, 55, 175)],
    'black':  [(0, 180, 0, 0, 55)],
    'brown':  [(10, 25, 60, 30, 130)],
    'khaki':  [(18, 30, 40, 130, 220)],
    'pink':   [(150, 175, 60, 140, 255)],
}

def analyze_clothing_colors(crop_bgr, region='top', coverage_threshold=0.15):
    """
    Analyze the dominant clothing colors in a person bounding-box crop.

    Args:
        crop_bgr           : BGR image of the person crop
        region             : 'top' (upper torso), 'bottom' (lower body), 'full' (whole)
        coverage_threshold : minimum fraction of pixels for a color to be reported

    Returns:
        list[str]  : color names detected, sorted by coverage (most dominant first)
        dict[str, float]: color -> coverage fraction (0-1)
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return [], {}
    h, w = crop_bgr.shape[:2]
    if h < 20 or w < 10:
        return [], {}

    # Slice region of interest — avoid head/feet
    if region == 'top':
        roi = crop_bgr[int(h * 0.15): int(h * 0.50), int(w * 0.1): int(w * 0.9)]
    elif region == 'bottom':
        roi = crop_bgr[int(h * 0.50): int(h * 0.90), int(w * 0.1): int(w * 0.9)]
    else:  # full
        roi = crop_bgr[int(h * 0.10): int(h * 0.90), int(w * 0.05): int(w * 0.95)]

    if roi.size == 0:
        return [], {}

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    total_pixels = hsv.shape[0] * hsv.shape[1]
    if total_pixels == 0:
        return [], {}

    coverage = {}
    for color_name, ranges in _COLOR_DEFS.items():
        mask = np.zeros((hsv.shape[0], hsv.shape[1]), dtype=np.uint8)
        for h_min, h_max, s_min, v_min, v_max in ranges:
            lower = np.array([h_min, s_min, v_min])
            upper = np.array([h_max, 255,   v_max])
            mask |= cv2.inRange(hsv, lower, upper)
        coverage[color_name] = cv2.countNonZero(mask) / total_pixels

    # Sort by coverage; filter below threshold
    sorted_colors = sorted(coverage.items(), key=lambda x: x[1], reverse=True)
    detected = [c for c, v in sorted_colors if v >= coverage_threshold]

    # Always return at least the dominant color so callers have something
    if not detected and sorted_colors:
        detected = [sorted_colors[0][0]]

    return detected, coverage


def parse_dress_code_config(description):
    """
    Parse dress code configuration from the AI model description field.

    Supported JSON format (embed anywhere in the description):
      dress_code:{"required":["blue","white"],"prohibited":["red"],
                  "check":"top","alert_on":"violation",
                  "coverage":0.15,"cooldown":90}

    Fields:
      required   : colors that MUST be present (alert if absent)
      prohibited : colors that must NOT appear  (alert if present)
      check      : body region — "top", "bottom", or "full"
      alert_on   : "violation" (missing required / has prohibited)
                   "match"     (alert when required colors ARE seen)
      coverage   : minimum color coverage fraction (default 0.15)
      cooldown   : seconds between repeat alerts per person (default 90)

    Returns: dict with all fields defaulted.
    """
    import json as _json, re as _re
    cfg = {
        'required':   [],
        'prohibited': [],
        'check':      'top',
        'alert_on':   'violation',
        'coverage':   0.15,
        'cooldown':   90,
    }
    if not description:
        return cfg
    m = _re.search(r'dress_code\s*:\s*(\{.*?\})', description, _re.DOTALL | _re.IGNORECASE)
    if m:
        try:
            cfg.update(_json.loads(m.group(1)))
        except Exception:
            pass
    return cfg


# Optional CLIP upgrade — gracefully disabled if not installed
try:
    import clip as _clip
    import torch as _torch
    _clip_model, _clip_preprocess = _clip.load('ViT-B/32', device='cpu')
    _CLIP_AVAILABLE = True
    print('[DressCode] CLIP loaded — zero-shot clothing classification enabled')
except Exception:
    _CLIP_AVAILABLE = False


def classify_with_clip(crop_bgr, prompts):
    """
    Use CLIP to classify a person crop against a list of text prompts.
    Returns (best_prompt, confidence_0_1) or (None, 0) if CLIP not available.
    """
    if not _CLIP_AVAILABLE or crop_bgr is None or crop_bgr.size == 0:
        return None, 0.0
    try:
        from PIL import Image as _Image
        import torch as _torch
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        pil_img = _Image.fromarray(rgb)
        img_tensor = _clip_preprocess(pil_img).unsqueeze(0)
        text_tokens = _clip.tokenize(prompts)
        with _torch.no_grad():
            logits, _ = _clip_model(img_tensor, text_tokens)
            probs = logits.softmax(dim=-1)[0].tolist()
        best_idx = probs.index(max(probs))
        return prompts[best_idx], probs[best_idx]
    except Exception as e:
        print(f'[CLIP] Error: {e}')
        return None, 0.0


def process_stream(camera, model, stop_event):
    """Main processing loop for a single camera + model pair"""
    model_name = model.get('name', 'Unknown Model')
    model_path = model.get('model_path')
    
    print(f"Starting {model_name} analysis on {camera['name']}")

    model_type = model.get('model_type', 'other')
    # Use model_hub to resolve the correct weights for this model type.
    # model_path stored in DB is treated as an override (custom uploaded weights).
    local_model_path = hub_get_model_path(model_type, model.get('model_path', '') or '')
    if not local_model_path:
        # Pure-CV types (camera_tamper, motion_detection) — skip YOLO load
        local_model_path = None

    if local_model_path is None and model_type not in ('camera_tamper_detection', 'motion_detection', 'flood_detection'):
        print(f"[{model_name}] No model path resolved. Aborting.")
        return


    try:
        # Re-apply safe globals just in case
        torch.serialization.add_safe_globals([ultralytics.nn.tasks.DetectionModel])
        ai_model = YOLO(local_model_path)
    except Exception as e:
        print(f"Error loading YOLO model: {e}")
        return

    # Use the real RTSP URL (location field) for direct camera access.
    # stream_url is the HLS output URL for browsers — not suitable for OpenCV.
    stream_source = (camera.get('location') or camera.get('stream_url') or '').strip()

    # Inject credentials if provided and not already in URL
    username = camera.get('username')
    password = camera.get('password')
    if username and password and '@' not in stream_source:
        try:
            scheme, address = stream_source.split('://', 1)
            stream_source = f"{scheme}://{quote_plus(username)}:{quote_plus(password)}@{address}"
        except ValueError:
            pass

    # --- RETRY LOOP ---
    while not stop_event.is_set():
        print(f"[{camera['name']}] Connecting to stream...")
        cap = cv2.VideoCapture(stream_source)
        
        if not cap.isOpened():
            print(f"[{camera['name']}] Failed to open stream. Retrying in 10s...")
            time.sleep(10)
            continue
            
        # Optimize buffer for real-time
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        print(f"[{camera['name']}] Stream OK. Starting inference...")
        
        frame_count = 0
        skip_frames = 3
        consecutive_failures = 0
        last_event_time = 0

        # Reset tracker on every (re)connect so stale positions don't linger across disconnects
        with _trackers_lock:
            object_trackers[camera['id']] = {}
        tracker = object_trackers[camera['id']]

        # Read initial config from shared cache (populated by _config_refresh_thread)
        with _config_lock:
            settings    = _config.settings.copy()
            zones_map   = dict(_config.zones_map)
            alert_rules = dict(_config.alert_rules)
        camera_zones = zones_map.get(camera['id'], [])

        while not stop_event.is_set():
            # Sync settings / zones / rules from shared cache — no DB query per stream
            with _config_lock:
                settings    = _config.settings.copy()
                zones_map   = dict(_config.zones_map)
                alert_rules = dict(_config.alert_rules)
            camera_zones = zones_map.get(camera['id'], [])

            ret, frame = cap.read()
            if not ret:
                consecutive_failures += 1
                if consecutive_failures > 50: # ~2-3 seconds of no data
                    print(f"[{camera['name']}] Stream lost. Reconnecting...")
                    break
                time.sleep(0.05)
                continue
            
            consecutive_failures = 0
            frame_count += 1

            if frame_count % (skip_frames * 20) == 0:
                 print(f"[{camera['name']}] Still processing (Frame {frame_count})...")

            if frame_count % skip_frames != 0:
                continue

            # Run Inference
            try:
                results = ai_model(frame, verbose=False)
                # Resolve the active rule for this camera
                cam_rule = alert_rules['cameras'].get(camera['id']) or alert_rules['global']
                conf_threshold = float(cam_rule.get('confidence_threshold', 0.28)) if cam_rule else 0.28

                # --- SCHEDULE CHECK ---
                # If a schedule is configured and we're outside the active window, skip this frame entirely.
                if cam_rule and not is_within_schedule(cam_rule):
                    if frame_count % (skip_frames * 60) == 0:
                        print(f"[{camera['name']}] Outside schedule window — AI detection paused")
                    continue


                # Resolve model_type early so dress_code and crowd branches can use it
                model_type = model.get('model_type', 'other')

                # ─────────────────────────────────────────────────────────────
                #  DRESS CODE / APPEARANCE DETECTION
                #  Two-stage pipeline:
                #    1. YOLOv8 detects person bounding boxes
                #    2. HSV color analysis on each crop checks clothing color
                #       against required/prohibited colors in the config
                #  Optional CLIP upgrade uses text prompts instead of colors.
                # ─────────────────────────────────────────────────────────────
                if model_type == 'dress_code_detection':
                    dc_cfg = parse_dress_code_config(model.get('description', ''))
                    required   = [c.lower() for c in dc_cfg['required']]
                    prohibited = [c.lower() for c in dc_cfg['prohibited']]
                    region     = dc_cfg.get('check', 'top')
                    alert_on   = dc_cfg.get('alert_on', 'violation')
                    cov_thresh = float(dc_cfg.get('coverage', 0.15))
                    cooldown   = float(dc_cfg.get('cooldown', 90))
                    cam_id     = camera['id']

                    # CLIP text prompts (if CLIP installed and prompts defined)
                    clip_prompts = dc_cfg.get('clip_prompts', [])

                    # Collect person boxes
                    person_boxes = []
                    for r in results:
                        for box in r.boxes:
                            if ai_model.names[int(box.cls[0])] == 'person' \
                                    and float(box.conf[0]) >= conf_threshold:
                                person_boxes.append(box)

                    if frame_count % (skip_frames * 20) == 0:
                        print(f"[{camera['name']}] DRESS: {len(person_boxes)} people scanned")

                    detected = False
                    for box in person_boxes:
                        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                        crop = frame[max(0,y1):y2, max(0,x1):x2]

                        # Cooldown key: grid cell so same stationary person
                        # doesn't spam. 80px grid.
                        cell = f"{x1//80}_{y1//80}"
                        dc_key = f"{cam_id}_{cell}"
                        if time.time() - dress_code_last_alert.get(dc_key, 0) < cooldown:
                            continue

                        # ── Color analysis ──────────────────────────────────
                        colors_detected, coverage = analyze_clothing_colors(
                            crop, region=region, coverage_threshold=cov_thresh)

                        violation = False
                        violation_reason = ''

                        if alert_on == 'violation':
                            # Missing a required color?
                            missing = [c for c in required if c not in colors_detected]
                            if missing:
                                violation = True
                                violation_reason = f"Missing required color(s): {', '.join(missing)}"
                            # Has a prohibited color?
                            has_prohibited = [c for c in prohibited if c in colors_detected]
                            if has_prohibited:
                                violation = True
                                violation_reason += ('; ' if violation_reason else '') + \
                                    f"Prohibited color(s) detected: {', '.join(has_prohibited)}"
                        else:  # alert_on == 'match'
                            matched = [c for c in required if c in colors_detected]
                            if matched:
                                violation = True
                                violation_reason = f"Matched color(s): {', '.join(matched)}"

                        # ── Optional CLIP re-check ───────────────────────────
                        clip_label = None
                        if _CLIP_AVAILABLE and clip_prompts and violation:
                            clip_label, clip_conf = classify_with_clip(crop, clip_prompts)
                            if clip_conf < 0.5:
                                # CLIP disagrees → skip alert
                                violation = False
                                violation_reason += f' [CLIP override: {clip_label} @ {clip_conf:.0%}]'

                        if not violation:
                            if frame_count % (skip_frames * 20) == 0:
                                print(f"[{camera['name']}] DressCode OK: {colors_detected}")
                            continue

                        # ── Alert! ───────────────────────────────────────────
                        dress_code_last_alert[dc_key] = time.time()
                        print(f"[{camera['name']}] 🚨 DRESS CODE VIOLATION: {violation_reason} | Detected: {colors_detected}")

                        # Annotated snapshot
                        snapshot_frame = frame.copy()
                        # Red box around violating person
                        cv2.rectangle(snapshot_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                        # Label the detected colors
                        color_text = f"Colors: {', '.join(colors_detected[:3])}"
                        cv2.rectangle(snapshot_frame, (x1, max(0, y1-40)), (x1+300, y1), (0, 0, 200), -1)
                        cv2.putText(snapshot_frame, 'DRESS CODE VIOLATION', (x1+4, max(0, y1-22)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
                        cv2.putText(snapshot_frame, color_text, (x1+4, max(0, y1-5)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 220, 0), 1)

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
                                    "camera_id":   cam_id,
                                    "ai_model_id": model['id'],
                                    "event_type":  "dress_code_violation",
                                    "confidence":  float(box.conf[0]) * 100,
                                    "snapshot_url": snap_url,
                                    "metadata": {
                                        "violation_reason": violation_reason,
                                        "colors_detected":  colors_detected,
                                        "required_colors":  required,
                                        "prohibited_colors": prohibited,
                                        "region_checked":   region,
                                        "clip_label":       clip_label,
                                        "box": box.xywhn.tolist()[0]
                                    },
                                    "acknowledged": False
                                }).execute()
                                print(f"[{camera['name']}] Dress code event INSERTED")

                                event_data = {
                                    "event_type":   f"dress_code_violation ({violation_reason})",
                                    "confidence":   float(box.conf[0]) * 100,
                                    "camera_name":  camera['name'],
                                    "snapshot_url": snap_url
                                }
                                threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                                threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
                                detected = True
                            except Exception as e:
                                print(f"[{camera['name']}] Dress code upload error: {e}")

                    if detected:
                        last_event_time = time.time()
                    continue  # next frame

                # ─────────────────────────────────────────────────────────────
                #  CROWD DETECTION — frame-level aggregation
                #  Works differently from per-box detection:
                #  Count all persons in the frame; fire ONE event when the
                #  crowd threshold is exceeded, then cooldown.
                # ─────────────────────────────────────────────────────────────
                if model_type == 'crowd_detection':
                    # Parse threshold from model description field, e.g. "threshold:8"
                    # or fall back to the default of 5 people.
                    crowd_threshold = 5
                    desc = model.get('description', '') or ''
                    import re as _re
                    m = _re.search(r'threshold\s*:\s*(\d+)', desc, _re.IGNORECASE)
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

                        # Build annotated snapshot: draw all person boxes + count banner
                        snapshot_frame = frame.copy()
                        h_f, w_f = snapshot_frame.shape[:2]

                        for box in crowd_boxes:
                            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                            cv2.rectangle(snapshot_frame, (x1, y1), (x2, y2), (0, 165, 255), 2)

                        # Large banner at top of frame
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
                                        "box": []   # no single box for crowd events
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

                    # Skip the per-box loop below — crowd is handled entirely above
                    detected = person_count >= crowd_threshold
                    if detected:
                        last_event_time = time.time()
                    continue   # next frame

                # ─────────────────────────────────────────────────────────────
                #  CAMERA TAMPER DETECTION — pure OpenCV, no model needed
                # ─────────────────────────────────────────────────────────────
                if model_type == 'camera_tamper_detection':
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
                    continue

                # ─────────────────────────────────────────────────────────────
                #  LOITERING DETECTION — person stationary in zone > threshold
                # ─────────────────────────────────────────────────────────────
                if model_type == 'loitering_detection':
                    import re as _re
                    desc = model.get('description', '') or ''
                    m_dwell = _re.search(r'dwell\s*:\s*(\d+)', desc, _re.IGNORECASE)
                    dwell_threshold = int(m_dwell.group(1)) if m_dwell else 30  # default 30s
                    cam_id = camera['id']
                    now = time.time()
                    person_boxes = []
                    for r in results:
                        for box in r.boxes:
                            if ai_model.names[int(box.cls[0])] == 'person' and float(box.conf[0]) >= conf_threshold:
                                person_boxes.append(box)
                    seen_ids = set()
                    for box in person_boxes:
                        cx = int((box.xyxy[0][0] + box.xyxy[0][2]) / 2)
                        cy = int((box.xyxy[0][1] + box.xyxy[0][3]) / 2)
                        cell = f"{cx//60}_{cy//60}"
                        # Prefix with cam_id to prevent collisions between cameras
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
                                    if hasattr(snap_url, 'publicUrl'): snap_url = snap_url.publicUrl
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
                            except Exception as e:
                                print(f"[{camera['name']}] Loitering event error: {e}")
                    # Evict cell_keys no longer visible (uses namespaced keys)
                    for old in list(loiter_tracker.keys()):
                        if old not in seen_ids:
                            del loiter_tracker[old]
                    continue

                # ─────────────────────────────────────────────────────────────
                #  FALL DETECTION — horizontal bounding box via pose model
                # ─────────────────────────────────────────────────────────────
                if model_type == 'fall_detection':
                    cam_id = camera['id']
                    now = time.time()
                    for r in results:
                        if not hasattr(r, 'boxes'): continue
                        for box in r.boxes:
                            if ai_model.names[int(box.cls[0])] != 'person': continue
                            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                            w, h = x2 - x1, y2 - y1
                            if h < 5: continue
                            aspect = w / h
                            if aspect > 1.8 and (now - last_event_time) > EVENT_COOLDOWN:
                                last_event_time = now
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
                                        if hasattr(snap_url, 'publicUrl'): snap_url = snap_url.publicUrl
                                except Exception: pass
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
                    continue

                # ─────────────────────────────────────────────────────────────
                #  FIGHT / AGGRESSION DETECTION — overlapping persons + motion
                # ─────────────────────────────────────────────────────────────
                if model_type == 'fight_detection':
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
                                # True IoU = intersection / union (fixes asymmetric formula)
                                iou = inter / max(area_a + area_b - inter, 1)
                                if iou > 0.25:
                                    fight_detected = True
                                    break
                            if fight_detected: break
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
                                if hasattr(snap_url, 'publicUrl'): snap_url = snap_url.publicUrl
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
                    continue

                # ─────────────────────────────────────────────────────────────
                #  ABANDONED OBJECT DETECTION — stationary non-person > N mins
                # ─────────────────────────────────────────────────────────────
                if model_type == 'abandoned_object_detection':
                    import re as _re
                    desc = model.get('description', '') or ''
                    m_timer = _re.search(r'timer\s*:\s*(\d+)', desc, _re.IGNORECASE)
                    timer_secs = int(m_timer.group(1)) * 60 if m_timer else 120  # default 2 mins
                    cam_id = camera['id']
                    now = time.time()
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
                        # Prefix with cam_id to prevent cross-camera collisions
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
                            print(f"[{camera['name']}] ABANDONED OBJECT: {ai_model.names[int(box.cls[0])]} for {elapsed:.0f}s")
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
                                    if hasattr(snap_url, 'publicUrl'): snap_url = snap_url.publicUrl
                            except Exception as _snap_err:
                                ai_logger.warning(f"[{camera['name']}] Abandoned object snapshot upload failed: {_snap_err}")
                            try:
                                supabase.table('events').insert({
                                    "camera_id": cam_id, "ai_model_id": model['id'],
                                    "event_type": "abandoned_object", "confidence": float(box.conf[0]) * 100,
                                    "snapshot_url": snap_url,
                                    "metadata": {"object": ai_model.names[int(box.cls[0])], "stationary_seconds": round(elapsed), "timer_threshold": timer_secs},
                                    "acknowledged": False
                                }).execute()
                                event_data = {"event_type": f"abandoned object ({ai_model.names[int(box.cls[0])]})", "confidence": float(box.conf[0]) * 100, "camera_name": camera['name'], "snapshot_url": snap_url}
                                threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                                threading.Thread(target=send_sms_alert,   args=(settings, event_data)).start()
                            except Exception as e:
                                print(f"[{camera['name']}] Abandoned object error: {e}")
                    continue

                # ─────────────────────────────────────────────────────────────
                #  ILLEGAL PARKING — vehicle stationary in zone > N minutes
                # ─────────────────────────────────────────────────────────────
                if model_type == 'illegal_parking_detection':
                    import re as _re
                    desc = model.get('description', '') or ''
                    m_mins = _re.search(r'minutes\s*:\s*(\d+)', desc, _re.IGNORECASE)
                    park_limit = int(m_mins.group(1)) * 60 if m_mins else 300  # default 5 mins
                    cam_id = camera['id']
                    now = time.time()
                    VEHICLE_LABELS = {'car', 'truck', 'bus', 'motorcycle', 'bicycle'}
                    for r in results:
                        for box in r.boxes:
                            lbl = ai_model.names[int(box.cls[0])]
                            if lbl not in VEHICLE_LABELS or float(box.conf[0]) < conf_threshold: continue
                            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                            # Prefix with cam_id to prevent cross-camera collisions
                            cell_key = f"{cam_id}_{x1//50}_{y1//50}"
                            if cell_key not in parking_tracker:
                                parking_tracker[cell_key] = {'first_seen': now, 'cam_id': cam_id, 'alerted': False, 'label': lbl}
                            elapsed = now - parking_tracker[cell_key]['first_seen']
                            if elapsed > park_limit and not parking_tracker[cell_key]['alerted']:
                                parking_tracker[cell_key]['alerted'] = True
                                print(f"[{camera['name']}] ILLEGAL PARKING: {lbl} {elapsed:.0f}s")
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
                    continue

                # ─────────────────────────────────────────────────────────────
                #  STANDARD PER-BOX DETECTION (all other model types)
                # ─────────────────────────────────────────────────────────────


                # model_type already assigned above — TYPE_MAPPING lookup follows

                # Mapping of model types to YOLO classes
                TYPE_MAPPING = {
                    'person_detection':          ['person'],
                    'person_detection_balanced': ['person'],
                    'person_detection_accurate': ['person'],
                    'intrusion_detection':       ['person', 'bicycle', 'car', 'motorcycle', 'dog', 'bus', 'truck'],
                    'vehicle_detection':         ['bicycle', 'car', 'motorcycle', 'bus', 'truck'],
                    'weapon_detection':          ['weapon', 'gun', 'pistol', 'rifle', 'firearm', 'knife', 'handgun', 'Pistol', 'Gun', 'Knife'],
                    'animal_detection':          ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'],
                    # Face — YOLOv8-Face trained model outputs 'face' class
                    'face_detection':            ['face', 'person'],
                    'face_recognition':          ['face', 'person'],
                    'unknown_face_detection':    ['face', 'person'],
                    # Fire & Smoke — keremberke fire model outputs 'fire' and 'smoke'
                    'fire_detection':            ['fire', 'smoke', 'Fire', 'Smoke'],
                    'smoke_detection':           ['smoke', 'fire', 'Smoke', 'Fire'],
                    # PPE — keremberke hard-hat model outputs these exact class names
                    'ppe_detection':             ['NO-Hardhat', 'NO-Safety Vest', 'NO-Mask', 'NO-Gloves',
                                                  'Hardhat', 'Safety Vest', 'Mask', 'Gloves',
                                                  'helmet', 'vest', 'no-helmet', 'no-vest'],
                    # Mask detection
                    'mask_detection':            ['with_mask', 'without_mask', 'mask', 'no_mask', 'Mask', 'No-Mask'],
                    # License plate
                    'license_plate_detection':   ['license_plate', 'license-plate', 'number_plate', 'plate'],
                    # Vandalism — uses person + object overlap heuristic, standard classes
                    'vandalism_detection':       ['person'],
                    # Running — person detection (speed calculated via centroid delta)
                    'running_detection':         ['person'],
                    # Tailgating — person detection
                    'tailgating_detection':      ['person'],
                }

                # Get specific classes for this model or fallback to all security classes
                allowed_classes = TYPE_MAPPING.get(model_type)

                if not allowed_classes:
                    # Default/Other: Allow everything in the security list
                    allowed_classes = [
                        'person', 'bicycle', 'car', 'motorcycle', 'dog', 'bus', 'truck',
                        'weapon', 'gun', 'pistol', 'rifle', 'firearm', 'knife', 'handgun',
                        'helmet', 'vest', 'glove', 'glasses', 'mask', 'no-helmet', 'no-vest', 'no-glove', 'no-glasses', 'no-mask',
                        'NO-Hardhat', 'NO-Mask', 'NO-Safety Vest', 'Hardhat', 'Mask', 'Safety Vest'
                    ]
                
                # ─────────────────────────────────────────────────────────────
                #  FACE RECOGNITION HANDLER
                #  Runs for: face_detection, face_recognition, unknown_face_detection
                # ─────────────────────────────────────────────────────────────
                if model_type in ('face_detection', 'face_recognition', 'unknown_face_detection'):
                    h_frame, w_frame = frame.shape[:2]
                    for r in results:
                        for box in r.boxes:
                            conf = float(box.conf[0])
                            if conf < conf_threshold:
                                continue
                            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
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

                            # Determine event type and whether to alert
                            if model_type == 'face_detection':
                                # Always fire — just log who was seen
                                if matched:
                                    event_label   = f"face detected: {person_name}"
                                    alert_header  = f"FACE: {person_name.upper()}"
                                    box_color     = (0, 200, 0)   # green — known person
                                else:
                                    event_label   = "face detected: unknown"
                                    alert_header  = "FACE: UNKNOWN"
                                    box_color     = (0, 165, 255) # orange
                                should_fire = True

                            elif model_type == 'unknown_face_detection':
                                if matched and role == 'blacklist':
                                    event_label   = f"blacklisted person: {person_name}"
                                    alert_header  = f"BLACKLIST: {person_name.upper()}"
                                    box_color     = (0, 0, 255)   # red
                                    should_fire   = True
                                elif matched:
                                    # Authorized — no alert needed
                                    print(f"[{camera['name']}] Authorized: {person_name} ({face_conf:.2f})")
                                    should_fire   = False
                                    event_label   = f"authorized: {person_name}"
                                    box_color     = (0, 200, 0)
                                else:
                                    event_label   = "unknown face detected"
                                    alert_header  = "UNKNOWN FACE"
                                    box_color     = (0, 0, 255)   # red
                                    should_fire   = True

                            else:  # face_recognition — always identify
                                event_label  = f"face recognized: {person_name}" if matched else "face recognized: unknown"
                                alert_header = f"ID: {person_name.upper()}" if matched else "ID: UNKNOWN"
                                box_color    = (0, 200, 0) if matched else (0, 0, 255)
                                should_fire  = True

                            if not should_fire:
                                continue

                            # Deduplicate — use grid cell to prevent spam per location
                            cell = f"{x1//80}_{y1//80}"
                            face_key = f"face_{camera['id']}_{cell}"
                            now_t = time.time()
                            if now_t - dress_code_last_alert.get(face_key, 0) < 30:
                                continue
                            dress_code_last_alert[face_key] = now_t

                            # Draw snapshot with name overlay
                            snap = frame.copy()
                            cv2.rectangle(snap, (x1, y1), (x2, y2), box_color, 3)
                            cv2.rectangle(snap, (x1, y1 - 40), (x1 + max(200, (x2-x1)), y1), box_color, -1)
                            cv2.putText(snap, alert_header, (x1 + 5, y1 - 12),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
                            conf_text = f"Conf: {face_conf*100:.0f}%"
                            cv2.putText(snap, conf_text, (x1 + 5, y2 + 20),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 1)

                            ret, buf = cv2.imencode('.jpg', snap)
                            snapshot_url = ""
                            if ret:
                                try:
                                    fname = f"events/{camera['id']}_face_{int(now_t)}.jpg"
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
                                    "camera_id": camera['id'],
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
                            except Exception as ev_err:
                                print(f"[{camera['name']}] Face event insert error: {ev_err}")
                    continue  # Skip standard per-box detection for face models

                # ─────────────────────────────────────────────────────────────
                #  STANDARD PER-BOX DETECTION (all other model types)
                # ─────────────────────────────────────────────────────────────

                detected = False
                for r in results:
                    for box in r.boxes:
                        crossed_zone = None  # Initialize per-box so snapshot logic is always safe
                        conf = float(box.conf[0])
                        cls_idx = int(box.cls[0])
                        label = ai_model.names[cls_idx]
                        
                        # Only trigger for allowed classes
                        if label not in allowed_classes:
                            continue

                        # Strict confidence threshold for weapons to reduce false positives
                        current_threshold = conf_threshold
                        if label in ['weapon', 'gun', 'pistol', 'rifle', 'firearm', 'knife', 'handgun']:
                             current_threshold = 0.55 # Significantly higher for weapons

                        if conf < current_threshold:
                            continue

                        # Check alert rules - skip if object not in whitelist
                        # MOVED TO LATE FILTERING (Below)
                        # ── STEP 1: capture the raw YOLO label BEFORE any suffixes ──────
                        original_label = label

                        # ── STEP 2: apply_to_zones_only shortcut ─────────────────────────
                        # If the rule says "only alert when objects enter a zone", enforce:
                        #   a) No zones on this camera → skip all detections entirely.
                        #   b) Zones ARE configured → allow object through here, but STEP 5
                        #      will block it unless it becomes a zone crossing/entry event.
                        cam_rule_check = alert_rules['cameras'].get(camera['id']) or alert_rules['global']
                        _apply_zones_only = cam_rule_check.get('apply_to_zones_only', False) if cam_rule_check else False
                        if _apply_zones_only and not camera_zones:
                            continue  # No zones on this camera → skip all detections

                        # ── STEP 3: whitelist / blacklist filter (before zone logic) ─────
                        # Zone events (crossing/entry) bypass the object filter because
                        # the zone itself IS the security boundary.
                        # For regular detections, enforce the rule now.
                        _allowed, _reason = should_trigger_alert(camera['id'], original_label, alert_rules)
                        if not _allowed and not camera_zones:
                            # No zones → this object is simply blocked by the rule
                            if frame_count % (skip_frames * 20) == 0:
                                print(f"[{camera['name']}] FILTER: {original_label} blocked — {_reason}")
                            continue

                        # ── STEP 4: log every detection that passed the filter ────────────
                        if frame_count % (skip_frames * 10) == 0:
                            print(f"[{camera['name']}] DETECTED: {label} ({conf:.2f}) | {_reason}")

                        # Tracking logic
                        xyxy = box.xyxy[0].tolist()
                        center_x, center_y = (xyxy[0] + xyxy[2]) / 2, (xyxy[1] + xyxy[3]) / 2
                        current_position = (center_x, center_y)
                        obj_id = f"{label}_{int(center_x//40)}_{int(center_y//40)}"
                        
                        should_trigger = False
                        current_time = time.time()
                        
                        if obj_id in tracker and isinstance(tracker[obj_id], dict):
                            last_pos = tracker[obj_id]['last_position']
                            
                            crossed_zone = None
                            # Zone Crossing Detection
                            for zone in camera_zones:
                                if zone.get('type') == 'line' and len(zone.get('points', [])) >= 2:
                                    h, w = frame.shape[:2]
                                    zpts = zone['points']
                                    start_pt = (zpts[0][0] * w, zpts[0][1] * h)
                                    end_pt = (zpts[1][0] * w, zpts[1][1] * h)
                                    
                                    if check_zone_crossing(last_pos, current_position, [start_pt, end_pt]):
                                        print(f"[{camera['name']}] ZONE CROSSING: {label}")
                                        should_trigger = True
                                        label = f"{label}_crossing" # Differentiate event
                                        tracker[obj_id]['alerted'] = False 
                                        tracker[obj_id]['seen_count'] = 999
                                        crossed_zone = (start_pt, end_pt) # Record for highlighting
                                        
                            movement = ((center_x - last_pos[0])**2 + (center_y - last_pos[1])**2)**0.5
                            tracker[obj_id].update({
                                'total_movement': tracker[obj_id]['total_movement'] + movement, 
                                'last_seen': current_time, 
                                'seen_count': tracker[obj_id]['seen_count'] + 1,
                                'last_position': current_position
                            })

                            # --- STRICT ZONE ENFORCEMENT ---
                            # Rules:
                            #   • Polygon zone  → alert ONLY when object CROSSES INTO zone
                            #                     (transition: outside → inside). Being inside
                            #                     without having crossed is NOT an alert.
                            #   • Tripwire line → alert ONLY when object CROSSES the line
                            #                     (already handled above).
                            #   • No zones      → regular movement-based detection.
                            if camera_zones and not should_trigger:
                                if has_active_polygon_zones(camera_zones):
                                    # Compare previous vs current position relative to polygon
                                    was_in_zone = check_zone_containment(last_pos, camera_zones, frame.shape)
                                    is_in_zone  = check_zone_containment(current_position, camera_zones, frame.shape)

                                    if not was_in_zone and is_in_zone:
                                        # ✅ Object just entered the zone — genuine breach
                                        should_trigger = True
                                        tracker[obj_id]['alerted'] = False  # ensure alert fires
                                        label = f"{label}_entry"
                                        print(f"[{camera['name']}] ZONE BREACH: {label} crossed INTO polygon zone")
                                    elif was_in_zone and not is_in_zone:
                                        # Object exited the zone — reset so re-entry triggers again
                                        tracker[obj_id]['alerted'] = False
                                        print(f"[{camera['name']}] Zone exit: {label} left polygon zone")
                                    # was_in & is_in  → still inside, no new event
                                    # !was_in & !is_in → outside zone, no trigger
                                # else: only tripwire zones → crossings already handled above
                            elif not camera_zones:
                                # No zones configured → regular detection (trigger on movement)
                                should_trigger = True
                        else:
                            # First time this object is seen — record position and whether
                            # it started inside a polygon zone (so the NEXT frame can detect entry).
                            tracker[obj_id] = {
                                'last_position': current_position,
                                'last_seen': current_time,
                                'total_movement': 0,
                                'seen_count': 1,
                                'alerted': False,
                            }

                        # ── STEP 5: final trigger gate ────────────────────────────────────
                        if should_trigger and not tracker[obj_id].get('alerted') and tracker[obj_id]['seen_count'] >= 2:

                            is_zone_event = "_crossing" in label or "_entry" in label

                            if is_zone_event:
                                # Zone events (tripwire cross / polygon entry) always fire —
                                # they ARE the boundary breach. Object-type filter still applies.
                                allowed, reason = should_trigger_alert(camera['id'], original_label, alert_rules)
                                if not allowed:
                                    print(f"[{camera['name']}] Zone event BLOCKED for '{original_label}' — {reason}")
                                    continue
                                print(f"[{camera['name']}] Zone event ALLOWED: {label} — {reason}")
                            else:
                                # Regular (no-zone) detection:
                                # 1. apply_to_zones_only: skip free-roaming detections when flag is on
                                #    (zones exist → we already let it through STEP 2; block here for non-zone events)
                                if _apply_zones_only and camera_zones:
                                    print(f"[{camera['name']}] Blocked: '{label}' — apply_to_zones_only=True, not a zone event")
                                    continue

                                # 2. boundary_alerts_only = admin wants ONLY zone breaches → skip
                                if settings.get('boundary_alerts_only', False):
                                    print(f"[{camera['name']}] Blocked: '{label}' — boundary_alerts_only is ON")
                                    continue

                                # 3. Re-check whitelist/blacklist (may have been skipped when zones present)
                                allowed, reason = should_trigger_alert(camera['id'], original_label, alert_rules)
                                if not allowed:
                                    print(f"[{camera['name']}] Blocked: '{label}' — {reason}")
                                    continue
                                print(f"[{camera['name']}] Alert ALLOWED: '{label}' — {reason}")

                            if "_crossing" in label:
                                print(f"[{camera['name']}] Zone Crossing Event (Allowed): {label}")
                            
                            print(f"[{camera['name']}] SECURITY ALERT: {label.upper()} ({conf:.2f})")
                            
                            # --- HIGHLIGHTING LOGIC ---
                            # Create a copy to draw on for the snapshot
                            snapshot_frame = frame.copy()
                            
                            # Draw Bounding Box (Red for Alert)
                            x1, y1, x2, y2 = map(int, xyxy)
                            cv2.rectangle(snapshot_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                            
                            # Draw Warning Header on Image
                            header_text = "SECURITY BREACH" if is_zone_event else "DETECTION"
                            cv2.rectangle(snapshot_frame, (x1, y1 - 35), (x1 + 200, y1), (0, 0, 255), -1)
                            cv2.putText(snapshot_frame, f"{header_text}: {original_label.upper()}", (x1 + 5, y1 - 10),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

                            # If it's a zone crossing, highlight the specific line crossed
                            if is_zone_event and crossed_zone:
                                pt1 = (int(crossed_zone[0][0]), int(crossed_zone[0][1]))
                                pt2 = (int(crossed_zone[1][0]), int(crossed_zone[1][1]))
                                # Draw thick red line over the boundary
                                cv2.line(snapshot_frame, pt1, pt2, (0, 0, 255), 5)
                                # Add "CROSSED" text near the line
                                cv2.putText(snapshot_frame, "BREACH POINT", (pt1[0], pt1[1] - 10),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 3)

                            ret, buffer = cv2.imencode('.jpg', snapshot_frame)
                            if ret:
                                file_name = f"events/{camera['id']}_{int(time.time())}.jpg"
                                try:
                                    # Upload and Save
                                    supabase.storage.from_("event-snapshots").upload(file_name, buffer.tobytes(), {"content-type": "image/jpeg"})
                                    snapshot_url = supabase.storage.from_("event-snapshots").get_public_url(file_name)
                                    if hasattr(snapshot_url, 'publicUrl'): snapshot_url = snapshot_url.publicUrl
                                    
                                    supabase.table('events').insert({
                                        "camera_id": camera['id'], "ai_model_id": model['id'],
                                        "event_type": label, "confidence": conf * 100,
                                        "snapshot_url": snapshot_url, "metadata": {"box": box.xywhn.tolist()[0]},
                                        "acknowledged": False
                                    }).execute()
                                    
                                    # LOG SUCCESSFUL INSERT
                                    print(f"[{camera['name']}] Event INSERTED with Highlights: {label}")

                                    # OCR FOR LICENSE PLATES
                                    if original_label in ['license_plate', 'license-plate', 'number_plate'] and ocr_reader is not None:
                                        # Crop the plate from the original frame
                                        plate_crop = frame[y1:y2, x1:x2]
                                        if plate_crop.size > 0:
                                            plate_text = ""
                                            try:
                                                # PREPROCESSING FOR OCR
                                                # 1. Resize (3x) to increase detail for character recognition
                                                plate_resized = cv2.resize(plate_crop, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
                                                
                                                # 2. Channel Extraction for Contrast (Green channel for yellow plates)
                                                green = plate_resized[:,:,1]
                                                
                                                # 3. Bilateral Filter
                                                bfilter = cv2.bilateralFilter(green, 11, 17, 17)
                                                
                                                # 4. Adaptive Gaussian Thresholding
                                                thresh = cv2.adaptiveThreshold(
                                                    bfilter, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                                    cv2.THRESH_BINARY_INV, 11, 2
                                                )
                                                
                                                # 5. Morphological Opening to remove small noise
                                                kernel = np.ones((3, 3), np.uint8)
                                                thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
                                                
                                                # 6. Read text with PaddleOCR
                                                ocr_results = ocr_reader.ocr(thresh, cls=True)
                                                
                                                if ocr_results and ocr_results[0]:
                                                    extracted_texts = [line[1][0] for res in ocr_results for line in res]
                                                    candidate_text = "".join(extracted_texts).replace(" ", "").upper()
                                                    cleaned_text = "".join(re.findall(r'[A-Z0-9]', candidate_text))
                                                    
                                                    # 7. ZIMBABWE PLATE VALIDATION (E.g. AAA5329)
                                                    plate_match = re.search(r'([A-Z]{3})(\d{4})', cleaned_text)
                                                    if plate_match:
                                                        plate_text = f"{plate_match.group(1)}{plate_match.group(2)}"
                                                        print(f"[{camera['name']}] OCR VALIDATED (ZIM): {plate_text}")
                                                    else:
                                                        if len(cleaned_text) >= 5:
                                                            plate_text = cleaned_text
                                                            print(f"[{camera['name']}] OCR DETECTED (General): {plate_text}")
                                            except Exception as e:
                                                print(f"[{camera['name']}] OCR failed: {e}")

                                            # Basic filtering (needs to be somewhat long to be a plate)
                                            if len(plate_text) >= 4:
                                                last_seen_p = plate_cooldowns.get(plate_text, 0)
                                                # 5 minute cooldown for the SAME plate
                                                if current_time - last_seen_p > 300:
                                                    try:
                                                        plate_cooldowns[plate_text] = current_time
                                                        supabase.table('number_plates').insert({
                                                            "plate_text": plate_text,
                                                            "camera_id": camera['id'],
                                                            "confidence": conf * 100,
                                                            "snapshot_url": snapshot_url
                                                        }).execute()
                                                    except Exception as ex:
                                                        print(f"Error inserting plate {plate_text}: {ex}")
                                    
                                    tracker[obj_id]['alerted'] = True
                                    detected = True # Triggers camera cooldown
                                    
                                    threading.Thread(target=send_email_alert, args=(settings, {"event_type": label, "confidence": conf * 100, "camera_name": camera['name'], "snapshot_url": snapshot_url})).start()
                                    threading.Thread(target=send_sms_alert, args=(settings, {"event_type": label, "confidence": conf * 100, "camera_name": camera['name'], "snapshot_url": snapshot_url})).start()
                                except Exception as e:
                                    print(f"[{camera['name']}] Event Upload Error: {e}")

                # Clean up tracks not seen for 10s
                current_time = time.time()
                tracker = {k: v for k, v in tracker.items() if (not isinstance(v, dict)) or (current_time - v.get('last_seen', 0) < 10)}
                with _trackers_lock:
                    object_trackers[camera['id']] = tracker

                if detected:
                    last_event_time = time.time()  # Record cooldown; do NOT break (avoids needless reconnect)

            except Exception as e:
                print(f"Inference error: {e}")

            # Honour per-event cooldown without disconnecting the stream
            if time.time() - last_event_time < EVENT_COOLDOWN:
                time.sleep(0.5)
                continue

            time.sleep(0.01)

        cap.release()
        if stop_event.is_set():
            break
            
    print(f"Stopped {model_name} on {camera['name']}")

# =============================================================================
# MEDIAMTX AUTO-SYNC
# Uses the MediaMTX Control API (port 9997) to register / update camera paths
# at runtime — no config-file edit and no server restart required.
# Called on every monitor_assignments poll cycle so changes to cameras in the
# DB (add / rename / update RTSP URL) are reflected within ~10 seconds.
# =============================================================================

MEDIAMTX_API = "http://localhost:9997"

# Absolute paths to MediaMTX binary and config — resolved relative to THIS file.
_AI_SERVER_DIR      = os.path.dirname(os.path.abspath(__file__))
_PROJECT_DIR        = os.path.dirname(_AI_SERVER_DIR)
STREAMING_SERVER_EXE = os.path.join(_PROJECT_DIR, "streaming-server", "mediamtx.exe")
STREAMING_SERVER_YML = os.path.join(_PROJECT_DIR, "streaming-server", "mediamtx.yml")

# Handle to a MediaMTX process started by THIS Python process (may be None if
# MediaMTX was started externally or is already running before the AI server).
_streaming_process = None
_streaming_lock    = threading.Lock()


def _check_streaming_online() -> bool:
    """Ping the MediaMTX control API. Returns True if it responds."""
    try:
        r = requests.get(f"{MEDIAMTX_API}/v3/config/global/get", timeout=2)
        return r.status_code == 200
    except Exception:
        return False


def _camera_slug(name: str) -> str:
    """Mirror of StreamPlayer.tsx slugify: cameraName.toLowerCase().replace(/[^a-z0-9]+/g, '-')"""
    import re as _re
    return _re.sub(r'[^a-z0-9]+', '-', name.lower().strip()).strip('-') or 'camera'


def _build_rtsp_url(cam: dict) -> str:
    """Return the real RTSP source URL for MediaMTX.
    Priority: location (real camera RTSP) > stream_url if it's an rtsp:// URL.
    Never returns an http://localhost HLS self-reference."""
    # 'location' stores the actual camera RTSP URL (e.g. rtsp://admin:pass@192.168.1.x/...)
    location = (cam.get('location') or '').strip()
    if location.startswith('rtsp://'):
        # Inject credentials from DB if not already in URL
        if '@' not in location:
            user = cam.get('username') or ''
            pwd  = cam.get('password') or ''
            if user and pwd:
                scheme, rest = location.split('://', 1)
                location = f"{scheme}://{quote_plus(user)}:{quote_plus(pwd)}@{rest}"
        return location

    # Fallback: stream_url if it's a real RTSP (not the localhost HLS loop)
    url = (cam.get('stream_url') or '').strip()
    if url.startswith('rtsp://'):
        if '@' not in url:
            user = cam.get('username') or ''
            pwd  = cam.get('password') or ''
            if user and pwd:
                scheme, rest = url.split('://', 1)
                url = f"{scheme}://{quote_plus(user)}:{quote_plus(pwd)}@{rest}"
        return url

    # stream_url is localhost HLS — cannot use as MediaMTX source
    return ''


def sync_mediamtx_paths(all_cameras: list) -> None:
    """
    Ensure every camera in `all_cameras` has a live path registered in MediaMTX.
    Uses PATCH so existing paths are updated in-place (no downtime for readers).
    Silently skips cameras with no stream_url and ignores connection errors so a
    missing/stopped MediaMTX never crashes the AI server.
    """
    if not all_cameras:
        return

    for cam in all_cameras:
        rtsp = _build_rtsp_url(cam)
        if not rtsp:
            continue

        slug = _camera_slug(cam.get('name', ''))
        payload = {
            "source": rtsp,
            "rtspTransport": "tcp",
            "sourceOnDemand": True,
            "sourceOnDemandStartTimeout": "10s",
            "sourceOnDemandCloseAfter": "10s",
        }

        try:
            # Try PATCH first (update existing); fall back to POST (add new)
            patch_url = f"{MEDIAMTX_API}/v3/config/paths/patch/{slug}"
            r = requests.patch(patch_url, json=payload, timeout=3)
            if r.status_code == 404:
                # Path doesn't exist yet — create it
                add_url = f"{MEDIAMTX_API}/v3/config/paths/add/{slug}"
                r = requests.post(add_url, json=payload, timeout=3)
            if r.status_code not in (200, 201):
                print(f"[MediaMTX] Warning: could not sync path '{slug}': {r.status_code} {r.text[:120]}")
            else:
                ai_logger.info(f"[MediaMTX] Path synced: /{slug} -> {rtsp[:60]}...")
        except requests.exceptions.ConnectionError:
            # MediaMTX not running — silently skip (don't crash the AI server)
            pass
        except Exception as e:
            print(f"[MediaMTX] Unexpected error syncing '{slug}': {e}")


def monitor_assignments(server_id):
    """Polls Supabase for active assignments (camera_models)"""
    print(f"Monitoring assignments for Server ID: {server_id}...")
    
    while True:
        try:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Polling Supabase for assignments...")
            # 1. Get Models assigned to this server (deployed here)
            # Or, arguably, we should run ALL assignments if we are the only server.
            # But stick to architecture: Models are deployed to Servers.
            response = supabase.table('ai_models').select('*').eq('server_id', server_id).eq('is_active', True).execute()
            my_models = response.data
            
            ai_logger.info(f"Found {len(my_models)} models for sid {server_id}")

            my_model_ids = [m['id'] for m in my_models]

            assignments = []
            if my_model_ids:
                # 2. Get active camera-model links
                res = supabase.table('camera_models').select('*').in_('ai_model_id', my_model_ids).eq('is_active', True).execute()
                assignments = res.data

            ai_logger.info(f"Found {len(assignments)} assignments")

            # 3. Get Cameras details (for AI inference threads)
            cam_ids = list(set([a['camera_id'] for a in assignments]))
            cameras = []
            if cam_ids:
                 res = supabase.table('cameras').select('*').in_('id', cam_ids).neq('status', 'disabled').execute()
                 cameras = res.data

            # 4. Sync ALL cameras → MediaMTX (not just assigned ones).
            #    This runs every poll cycle so new/renamed cameras auto-appear
            #    in the streaming server within ~10 seconds — no manual steps needed.
            try:
                all_cams_res = supabase.table('cameras').select('id, name, location, stream_url, username, password').neq('status', 'disabled').execute()
                sync_mediamtx_paths(all_cams_res.data or [])
            except Exception as mtx_err:
                print(f"[MediaMTX] Sync error: {mtx_err}")

            active_keys = []

            for item in assignments:
                cam_id = item['camera_id']
                model_id = item['ai_model_id']
                print(f"Found active requirement: Cam {cam_id[:5]}... + Model {model_id[:5]}...")

                # Unique key for this process pair
                key = f"{cam_id}_{model_id}"
                active_keys.append(key)

                cam = next((c for c in cameras if c['id'] == cam_id), None)
                model = next((m for m in my_models if m['id'] == model_id), None)

                if not cam or not model: continue

                # Check if thread died
                if key in active_monitors and not active_monitors[key]['thread'].is_alive():
                     print(f"Thread for {key} seems dead. Restarting...")
                     del active_monitors[key]

                # Start if not running
                if key not in active_monitors:
                    print(f"Starting threads for {key}...")
                    stop_event = threading.Event()
                    t = threading.Thread(target=process_stream, args=(cam, model, stop_event))
                    t.start()
                    active_monitors[key] = {
                        "stop_event": stop_event,
                        "thread": t
                    }

            # Cleanup removed assignments
            current_keys = list(active_monitors.keys())
            for k in current_keys:
                if k not in active_keys:
                     print(f"Assignment removed: {k}. Stopping...")
                     active_monitors[k]['stop_event'].set()
                     active_monitors[k]['thread'].join()
                     del active_monitors[k]

        except Exception as e:
            print(f"Error in monitor loop: {e}")

        time.sleep(10)

def process_system_commands():
    """Polls for pending commands from the frontend"""
    global _streaming_process
    print("Starting System Command Processor...")
    while True:
        try:
            # Fetch pending commands
            response = supabase.table('system_commands').select('*').eq('status', 'pending').execute()
            commands = response.data
            
            if not commands:
                time.sleep(2)
                continue
                
            for cmd in commands:
                print(f"Processing command: {cmd['command_type']} ({cmd['id']})")
                
                # Mark as processing
                supabase.table('system_commands').update({'status': 'processing'}).eq('id', cmd['id']).execute()
                
                try:
                    settings = get_system_settings()
                    payload = cmd.get('payload', {})
                    
                    if cmd['command_type'] == 'test_email':
                        test_settings = settings.copy()
                        test_settings.update(payload)
                        
                        smtp_host = test_settings.get('smtp_host')
                        smtp_port = int(test_settings.get('smtp_port', 587))
                        smtp_user = test_settings.get('smtp_user')
                        smtp_pass = test_settings.get('smtp_pass')
                        smtp_from = test_settings.get('smtp_from')
                        
                        # Build recipient list for visual confirmation
                        recipients = []
                        if test_settings.get('admin_email'):
                             recipients.append(test_settings.get('admin_email'))
                        
                        # Fetch extra emails if any (just to verify connection to DB too)
                        try:
                            resp = supabase.table('notification_emails').select('email').execute()
                            if resp.data:
                                extra = [r['email'] for r in resp.data]
                                recipients.extend(extra)
                        except:
                            pass
                        
                        unique_recipients = list(set([r for r in recipients if r]))
                        
                        if not unique_recipients:
                             # Fallback if list empty during test, try to use input
                             raise Exception("No recipients found. Please enter an Admin Email.")

                        msg = MIMEText(f"This is a test email from your AI Surveillance System.\n\nTime: {datetime.now()}\nStatus: System Operational\n\nThis message was sent to confirm your configuration is working and capable of reaching all {len(unique_recipients)} recipients.")
                        msg['Subject'] = "Test Email - Real Star Security"
                        msg['From'] = smtp_from
                        msg['To'] = ", ".join(unique_recipients)

                        print(f"Connecting to SMTP: {smtp_host}:{smtp_port} as {smtp_user}")

                        if smtp_port == 465:
                            server = smtplib.SMTP_SSL(smtp_host, smtp_port)
                        else:
                            server = smtplib.SMTP(smtp_host, smtp_port)
                            server.starttls()
                            
                        with server:
                            server.login(smtp_user, smtp_pass)
                            server.send_message(msg)
                            
                        result = f"Email sent successfully to {len(unique_recipients)} recipients."

                    elif cmd['command_type'] == 'test_camera_connection':
                        stream_url = payload.get('stream_url')
                        username = payload.get('username')
                        password = payload.get('password')
                        
                        if not stream_url:
                            raise Exception("Missing stream_url")
                            
                        # Inject credentials with URL encoding
                        if username and password and '@' not in stream_url:
                             try:
                                from urllib.parse import quote_plus
                                scheme, address = stream_url.split('://', 1)
                                safe_user = quote_plus(username)
                                safe_pass = quote_plus(password)
                                stream_url = f"{scheme}://{safe_user}:{safe_pass}@{address}"
                             except ValueError:
                                pass
                        
                        print(f"Testing connection to {stream_url.split('@')[-1]}...") # Don't log full URL with pass
                        
                        # Pre-check socket
                        try:
                            # Extract Host/Port
                            from urllib.parse import urlparse
                            # Manually parsing because OpenCV URL structure can vary
                            host_part = stream_url.split('@')[-1].split('/')[0]
                            if ':' in host_part:
                                host, port = host_part.split(':')
                                port = int(port)
                            else:
                                host = host_part
                                port = 554
                            
                            print(f"Checking socket {host}:{port}...")
                            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                            sock.settimeout(5)
                            result = sock.connect_ex((host, port))
                            sock.close()
                            if result != 0:
                                raise Exception(f"Port {port} on {host} is closed or unreachable (Error: {result}). Check firewall/port.")
                        except Exception as e:
                            print(f"Socket Check Warning: {e}") 
                            # Continue anyway as OpenCV might handle it differently (e.g. UDP)

                        cap = cv2.VideoCapture(stream_url)
                        
                        if not cap.isOpened():
                             raise Exception("Failed to open video stream. OpenCV could not connect. Verify Username/Password and Port.")
                             
                        ret, frame = cap.read()
                        if not ret:
                             cap.release()
                             raise Exception("Connected but failed to read frame.")
                             
                        width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
                        height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
                        fps = cap.get(cv2.CAP_PROP_FPS)
                        cap.release()
                        
                        result = f"Success! Resolution: {int(width)}x{int(height)}, FPS: {int(fps)}"

                    elif cmd['command_type'] == 'force_refresh':
                        # Immediate config reload — triggered when frontend saves alert rules or zones
                        with _config_lock:
                            _config.force_refresh = True
                        print(f"[ConfigCache] force_refresh command received — config will reload within 0.1s")
                        result = "Force refresh queued. AI server will reload config within 100ms."

                    elif cmd['command_type'] == 'update_zones':
                        # Zones are now updated in DB directly by frontend. 
                        # This command serves as a notification to logs or potentially to force refresh.
                        # Since load_zones() polls DB, we just ack.
                        print(f"Received zone update notification for {cmd.get('payload', {}).get('camera_id', 'unknown')}")
                        result = "Zones update acknowledged. AI will pick up changes shortly."
                        
                    elif cmd['command_type'] == 'start_streaming_server':
                        # Check if already running
                        if _check_streaming_online():
                            result = "Streaming server is already running (MediaMTX API responded on :9997)."
                        elif not os.path.exists(STREAMING_SERVER_EXE):
                            raise Exception(f"MediaMTX executable not found at: {STREAMING_SERVER_EXE}")
                        else:
                            import subprocess as _sp
                            ai_logger.info(f"[Streaming] Starting MediaMTX: {STREAMING_SERVER_EXE}")
                            with _streaming_lock:
                                _streaming_process = _sp.Popen(
                                    [STREAMING_SERVER_EXE, STREAMING_SERVER_YML],
                                    cwd=os.path.dirname(STREAMING_SERVER_EXE),
                                    stdout=_sp.DEVNULL,
                                    stderr=_sp.DEVNULL,
                                    creationflags=_sp.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
                                )
                            # Wait up to 8s for it to come online
                            online = False
                            for _ in range(16):
                                time.sleep(0.5)
                                if _check_streaming_online():
                                    online = True
                                    break
                            if online:
                                ai_logger.info("[Streaming] MediaMTX is online.")
                                result = f"Streaming server started successfully (PID {_streaming_process.pid}). MediaMTX API is responding."
                            else:
                                result = f"MediaMTX launched (PID {_streaming_process.pid}) but did not respond within 8s. Check streaming-server/mediamtx.log."

                    elif cmd['command_type'] == 'stop_streaming_server':
                        import subprocess as _sp
                        if not _check_streaming_online():
                            result = "Streaming server is already offline."
                        else:
                            stopped = False
                            with _streaming_lock:
                                if _streaming_process and _streaming_process.poll() is None:
                                    _streaming_process.terminate()
                                    try:
                                        _streaming_process.wait(timeout=5)
                                    except Exception:
                                        _streaming_process.kill()
                                    _streaming_process = None
                                    stopped = True

                            if not stopped:
                                # MediaMTX was started externally — find and kill by name (Windows)
                                if sys.platform == 'win32':
                                    kill_result = _sp.run(
                                        ['taskkill', '/F', '/IM', 'mediamtx.exe'],
                                        capture_output=True, text=True
                                    )
                                    stopped = kill_result.returncode == 0
                                else:
                                    kill_result = _sp.run(['pkill', '-f', 'mediamtx'], capture_output=True)
                                    stopped = kill_result.returncode == 0

                            if stopped:
                                ai_logger.info("[Streaming] MediaMTX stopped.")
                                result = "Streaming server stopped successfully."
                            else:
                                result = "Could not stop streaming server. It may have already exited."

                    elif cmd['command_type'] == 'restart_server':
                        # Graceful restart: stop all active streams, then re-exec this process.
                        result = f"Restarting AI server — {len(active_monitors)} streams will reconnect within ~15s."
                        # Mark completed BEFORE restarting so frontend gets the ACK
                        supabase.table('system_commands').update({
                            'status': 'completed',
                            'result': result,
                            'updated_at': datetime.now().isoformat()
                        }).eq('id', cmd['id']).execute()
                        ai_logger.info("[Restart] Received restart command — stopping all streams and relaunching...")
                        # Update server status
                        supabase.table('ai_servers').update({'status': 'restarting'}).eq('id', SERVER_UUID).execute()
                        # Stop all active inference threads
                        for k, v in list(active_monitors.items()):
                            v['stop_event'].set()
                        time.sleep(2)
                        ai_logger.info("[Restart] Relaunching process now...")
                        import subprocess as _sp
                        _sp.Popen([sys.executable] + sys.argv)
                        import os as _os
                        _os._exit(0)

                    elif cmd['command_type'] == 'shutdown_server':
                        # Graceful shutdown: stop streams, update DB status, then exit.
                        result = f"AI server shutting down — {len(active_monitors)} streams stopped."
                        # Mark completed BEFORE exiting so frontend gets the ACK
                        supabase.table('system_commands').update({
                            'status': 'completed',
                            'result': result,
                            'updated_at': datetime.now().isoformat()
                        }).eq('id', cmd['id']).execute()
                        ai_logger.info("[Shutdown] Received shutdown command — stopping all streams...")
                        supabase.table('ai_servers').update({'status': 'offline'}).eq('id', SERVER_UUID).execute()
                        for k, v in list(active_monitors.items()):
                            v['stop_event'].set()
                        time.sleep(2)
                        ai_logger.info("[Shutdown] Exiting.")
                        import os as _os
                        _os.write(1, b"[Shutdown] Process terminated by user command.\n")
                        _os._exit(0)

                    else:
                        result = "Unknown command type."

                    # Mark as completed
                    supabase.table('system_commands').update({
                        'status': 'completed',
                        'result': result,
                        'updated_at': datetime.now().isoformat()
                    }).eq('id', cmd['id']).execute()
                    
                except Exception as e:
                    print(f"Command failed: {e}")
                    supabase.table('system_commands').update({
                        'status': 'failed',
                        'result': str(e),
                        'updated_at': datetime.now().isoformat()
                    }).eq('id', cmd['id']).execute()

        except Exception as e:
            print(f"Error in command loop: {e}")
            time.sleep(5)
            
        time.sleep(2)

# sync_mediamtx() was removed — superseded by sync_mediamtx_paths() + _build_rtsp_url()
# which are called from monitor_assignments() on every poll cycle.


# =============================================================================
# TRAINING JOB RUNNER
# Polls training_jobs for pending work, fine-tunes the model on the uploaded
# dataset, uploads the new weights, and registers the result as an ai_models row.
# =============================================================================

def _log_job(job_id: str, msg: str, logs_so_far: list):
    """Append a log line to the training_jobs row in real-time."""
    logs_so_far.append(msg)
    ai_logger.info(f"[TrainJob {job_id[:8]}] {msg}")
    try:
        supabase.table('training_jobs').update({
            'logs': logs_so_far,
            'updated_at': datetime.now().isoformat(),
        }).eq('id', job_id).execute()
    except Exception as _e:
        ai_logger.warning(f"[TrainJob] log update failed: {_e}")


def _run_single_training_job(job: dict):
    """Execute one training job end-to-end."""
    job_id    = job['id']
    ds_id     = job.get('dataset_id')
    srv_id    = job.get('server_id')
    epochs    = int(job.get('epochs', 50))
    config    = job.get('configuration') or {}
    base_mid  = config.get('base_model_id')
    batch     = int(config.get('batch_size', 16))
    lr0       = float(config.get('learning_rate', 0.001))
    logs: list = []

    work_dir = Path(f'training_tmp/{job_id}')
    work_dir.mkdir(parents=True, exist_ok=True)

    def log(msg):
        _log_job(job_id, msg, logs)

    def fail(msg):
        log(f'FAILED: {msg}')
        supabase.table('training_jobs').update({
            'status': 'failed',
            'logs': logs,
            'updated_at': datetime.now().isoformat(),
        }).eq('id', job_id).execute()

    try:
        # ── Mark as processing ────────────────────────────────────────────────
        supabase.table('training_jobs').update({
            'status': 'processing',
            'current_epoch': 0,
            'progress': 0,
            'logs': ['Job started'],
            'updated_at': datetime.now().isoformat(),
        }).eq('id', job_id).execute()
        log(f'Job started — epochs={epochs}, batch={batch}, lr={lr0}')

        # ── 1. Fetch dataset record ───────────────────────────────────────────
        if not ds_id:
            return fail('No dataset_id on job')
        ds_resp = supabase.table('datasets').select('*').eq('id', ds_id).single().execute()
        if not ds_resp.data:
            return fail(f'Dataset {ds_id} not found')
        dataset = ds_resp.data
        storage_path = dataset.get('storage_path', '')
        log(f'Dataset: {dataset["name"]} ({storage_path})')

        # ── 2. Download dataset ZIP from Supabase Storage ─────────────────────
        zip_path = work_dir / 'dataset.zip'
        log(f'Downloading dataset from storage...')
        try:
            file_bytes = supabase.storage.from_('datasets').download(storage_path)
            zip_path.write_bytes(file_bytes)
            log(f'Downloaded {len(file_bytes) / 1024 / 1024:.1f} MB')
        except Exception as e:
            return fail(f'Dataset download failed: {e}')

        # ── 3. Unzip dataset ──────────────────────────────────────────────────
        extract_dir = work_dir / 'dataset'
        extract_dir.mkdir(exist_ok=True)
        log('Extracting dataset ZIP...')
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(extract_dir)
        except Exception as e:
            return fail(f'ZIP extraction failed: {e}')

        # ── 4. Locate data.yaml (required by YOLO trainer) ───────────────────
        yaml_candidates = list(extract_dir.rglob('*.yaml')) + list(extract_dir.rglob('*.yml'))
        if not yaml_candidates:
            return fail('No .yaml file found in dataset ZIP. Ensure YOLO format with data.yaml.')
        data_yaml = str(yaml_candidates[0])
        log(f'Using dataset config: {data_yaml}')

        # ── 5. Resolve base model weights ─────────────────────────────────────
        base_weights = 'yolov8n.pt'  # safe default
        if base_mid:
            bm_resp = supabase.table('ai_models').select('model_type,model_path').eq('id', base_mid).single().execute()
            if bm_resp.data:
                bm = bm_resp.data
                resolved = hub_get_model_path(bm.get('model_type',''), bm.get('model_path','') or '')
                if resolved:
                    base_weights = resolved
                    log(f'Fine-tuning from: {base_weights}')
                else:
                    log(f'Base model path not resolved — using {base_weights}')
            else:
                log(f'Base model {base_mid} not found — using {base_weights}')
        else:
            log(f'No base model specified — using {base_weights}')

        # ── 6. Load YOLO and run training ─────────────────────────────────────
        log(f'Loading YOLO weights: {base_weights}')
        try:
            train_model = YOLO(base_weights)
        except Exception as e:
            return fail(f'Failed to load YOLO weights: {e}')

        output_name = f'job_{job_id[:8]}'
        log(f'Starting training — this may take several minutes...')

        # Update progress every epoch via a callback
        def on_epoch_end(trainer):
            ep = trainer.epoch + 1
            pct = int(ep / epochs * 100)
            log(f'Epoch {ep}/{epochs} — loss={trainer.loss:.4f}')
            try:
                supabase.table('training_jobs').update({
                    'current_epoch': ep,
                    'progress': pct,
                    'updated_at': datetime.now().isoformat(),
                }).eq('id', job_id).execute()
            except Exception:
                pass

        train_model.add_callback('on_train_epoch_end', on_epoch_end)

        device = 0 if torch.cuda.is_available() else 'cpu'
        log(f'Training device: {"GPU" if device == 0 else "CPU"}')

        try:
            results = train_model.train(
                data=data_yaml,
                epochs=epochs,
                batch=batch,
                lr0=lr0,
                name=output_name,
                exist_ok=True,
                device=device,
                verbose=False,
            )
        except Exception as e:
            return fail(f'Training failed: {e}')

        # ── 7. Locate the best weights file ──────────────────────────────────
        runs_dir = Path('runs/detect') / output_name / 'weights'
        best_pt  = runs_dir / 'best.pt'
        if not best_pt.exists():
            # Fallback: last.pt
            best_pt = runs_dir / 'last.pt'
        if not best_pt.exists():
            return fail(f'Trained weights not found in {runs_dir}')
        log(f'Best weights: {best_pt} ({best_pt.stat().st_size / 1024 / 1024:.1f} MB)')

        # ── 8. Upload new weights to ai-models bucket ─────────────────────────
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        upload_name = f'trained_{output_name}_{ts}.pt'
        log(f'Uploading {upload_name} to Supabase storage...')
        try:
            file_data = best_pt.read_bytes()
            supabase.storage.from_('ai-models').upload(upload_name, file_data)
            log(f'Upload complete ({len(file_data)/1024/1024:.1f} MB)')
        except Exception as e:
            return fail(f'Upload failed: {e}')

        # ── 9. Register new model in ai_models ───────────────────────────────
        # Inherit model_type from the base model if we know it
        model_type_new = 'other'
        model_name_new = f'Trained Model ({ts})'
        if base_mid:
            try:
                bm_resp2 = supabase.table('ai_models').select('model_type,name').eq('id', base_mid).single().execute()
                if bm_resp2.data:
                    model_type_new = bm_resp2.data.get('model_type', 'other')
                    model_name_new = f"{bm_resp2.data.get('name','Model')} — Retrained {ts}"
            except Exception:
                pass

        new_model_resp = supabase.table('ai_models').insert({
            'name':        model_name_new,
            'description': f'Auto-generated by training job {job_id} — dataset: {dataset["name"]} — {epochs} epochs',
            'model_type':  model_type_new,
            'version':     f'retrain-{ts}',
            'accuracy':    0,         # Unknown until evaluated
            'server_id':   srv_id,
            'model_path':  upload_name,
            'is_active':   True,
            'smart_reporting': True,
        }).execute()

        new_model_id = None
        if new_model_resp.data:
            new_model_id = new_model_resp.data[0]['id']
            log(f'New model registered: {model_name_new} (id={new_model_id})')

        # ── 10. Mark job completed ────────────────────────────────────────────
        log('Training completed successfully!')
        supabase.table('training_jobs').update({
            'status':             'completed',
            'current_epoch':      epochs,
            'progress':           100,
            'resulting_model_id': new_model_id,
            'logs':               logs,
            'updated_at':         datetime.now().isoformat(),
        }).eq('id', job_id).execute()

    except Exception as e:
        fail(f'Unexpected error: {e}')
    finally:
        # Clean up work directory
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass


def run_training_jobs():
    """Daemon thread: poll training_jobs for pending work every 15 seconds."""
    ai_logger.info('[TrainingRunner] Started — polling every 15s')
    while True:
        try:
            resp = supabase.table('training_jobs') \
                .select('*') \
                .eq('status', 'pending') \
                .order('created_at') \
                .limit(1) \
                .execute()
            if resp.data:
                job = resp.data[0]
                ai_logger.info(f'[TrainingRunner] Picked up job {job["id"][:8]} — dataset={job.get("dataset_id","?")}')
                _run_single_training_job(job)
        except Exception as e:
            ai_logger.warning(f'[TrainingRunner] Poll error: {e}')
        time.sleep(15)

if __name__ == "__main__":
    with open("ai_log.txt", "a") as log:
        log.write(f"[{datetime.now()}] AI Surveillance Engine Starting...\n")

    sid = register_server()

    with open("ai_log.txt", "a") as log:
        log.write(f"[{datetime.now()}] sid: {sid}\n")

    # Start Config Cache Refresher
    # Single background thread replacing per-stream DB polling (3 queries / 5 s total)
    cfg_thread = threading.Thread(target=_config_refresh_thread, daemon=True)
    cfg_thread.start()

    # Start Command Processor
    cmd_thread = threading.Thread(target=process_system_commands, daemon=True)
    cmd_thread.start()

    # Start Training Job Runner
    train_thread = threading.Thread(target=run_training_jobs, daemon=True, name='TrainingRunner')
    train_thread.start()
    ai_logger.info('[Main] Training job runner started')

    monitor_assignments(sid)
