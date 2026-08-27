"""
config.py — Central configuration, environment, logging, and shared state.

All modules import their Supabase client, logger, and shared state dicts
from here so there is exactly one source of truth.
"""

import os
import sys
import logging
import threading
import time
from logging.handlers import RotatingFileHandler

from dotenv import load_dotenv
from supabase import create_client, Client

import torch
import ultralytics

# ── PyTorch 2.6+ safe globals for YOLO weight loading ────────────────────────
try:
    torch.serialization.add_safe_globals([
        ultralytics.nn.tasks.DetectionModel,
        ultralytics.nn.tasks.SegmentationModel,
        ultralytics.nn.tasks.PoseModel,
    ])
except AttributeError:
    # PyTorch < 2.6 does not have add_safe_globals — no action needed.
    pass


# ── Environment ───────────────────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
if not SUPABASE_URL:
    SUPABASE_URL = os.getenv("SUPABASE_URL")

SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_KEY:
    SUPABASE_KEY = os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_KEY:
    SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in .env")
    sys.exit(1)

# Gemini API Key (optional — enables Gemini Vision OCR for license plates)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
if GEMINI_API_KEY:
    os.environ["GEMINI_API_KEY"] = GEMINI_API_KEY
    print("[Config] GEMINI_API_KEY found — Gemini Vision OCR enabled")
else:
    print("[Config] No GEMINI_API_KEY — falling back to EasyOCR for plates")


# ── Supabase Client ──────────────────────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ── Rotating file logger (max 5 MB × 3 backups) ─────────────────────────────
_log_handler = RotatingFileHandler(
    'ai_log.txt', maxBytes=5 * 1024 * 1024, backupCount=3
)
_log_handler.setFormatter(
    logging.Formatter('[%(asctime)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
)
ai_logger = logging.getLogger('ai_server')
ai_logger.setLevel(logging.INFO)
ai_logger.addHandler(_log_handler)
ai_logger.addHandler(logging.StreamHandler())  # also echo to stdout


# ── Constants ─────────────────────────────────────────────────────────────────
EVENT_COOLDOWN = 5.0  # seconds between alerts on a single camera


# ── Shared mutable state ─────────────────────────────────────────────────────
# Structure: { "camera_id_model_id": { "stop_event": Event, "thread": Thread } }
active_monitors = {}

# Structure: { "camera_id": { "object_id": {...} } }
object_trackers = {}

# Crowd detection: last alert timestamp per camera (camera_id -> float)
crowd_last_alert = {}

# Dress code: last alert timestamp per (camera_id, grid_cell) to avoid spam
dress_code_last_alert = {}

# Plate OCR cooldowns: plate_text -> last_seen_timestamp
plate_cooldowns = {}

# Loitering detection: { "<camera_id>_<grid_cell>" -> {first_seen, cam_id, alerted} }
loiter_tracker = {}

# Abandoned object detection: { "<camera_id>_<grid_cell>" -> {first_seen, cam_id, alerted} }
abandoned_tracker = {}

# Illegal parking detection: { "<camera_id>_<grid_cell>" -> {first_seen, cam_id, alerted, label} }
parking_tracker = {}

# Camera tamper detection: last alert time per camera_id
tamper_last_alert = {}


# ── Thread-safety locks ──────────────────────────────────────────────────────
_trackers_lock  = threading.Lock()  # guards object_trackers top-level ops
_cooldowns_lock = threading.Lock()  # guards crowd/dress_code/tamper/plate cooldowns


# ── OCR Reader (EasyOCR / PaddleOCR) ─────────────────────────────────────────
ocr_reader = None
try:
    import easyocr
    ocr_reader = easyocr.Reader(['en'], gpu=False)
    print("[Config] OCR Engine: EasyOCR (PyTorch) ready")
except Exception as _e_easy:
    try:
        from paddleocr import PaddleOCR
        ocr_reader = PaddleOCR(lang='en')
        print("[Config] OCR Engine: PaddleOCR ready")
    except Exception as _e_pad:
        print(f"[Config] OCR initialization warning: {_e_easy} / {_e_pad}")


# ── Face Recognition Library Cache ───────────────────────────────────────────
face_library_cache: list = []
face_library_last_loaded: float = 0.0
FACE_LIBRARY_TTL = 300  # seconds (5 min)
face_library_lock = threading.Lock()
