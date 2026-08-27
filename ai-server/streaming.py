"""
streaming.py — MediaMTX streaming server integration.

Handles path sync, RTSP URL building, and streaming server health checks.
"""

import os
import re
import sys
import time
import threading
from urllib.parse import quote_plus

import requests

from config import ai_logger


# ── Paths to MediaMTX binary and config ──────────────────────────────────────
_AI_SERVER_DIR       = os.path.dirname(os.path.abspath(__file__))
_PROJECT_DIR         = os.path.dirname(_AI_SERVER_DIR)
STREAMING_SERVER_EXE = os.path.join(_PROJECT_DIR, "streaming-server", "mediamtx.exe")
STREAMING_SERVER_YML = os.path.join(_PROJECT_DIR, "streaming-server", "mediamtx.yml")

MEDIAMTX_API = "http://localhost:9997"

# Handle to a MediaMTX process started by THIS Python process
_streaming_process = None
_streaming_lock    = threading.Lock()


def check_streaming_online() -> bool:
    """Ping the MediaMTX control API. Returns True if it responds."""
    try:
        r = requests.get(f"{MEDIAMTX_API}/v3/config/global/get", timeout=2)
        return r.status_code == 200
    except Exception:
        return False


def camera_slug(name: str) -> str:
    """Mirror of StreamPlayer.tsx slugify: cameraName.toLowerCase().replace(/[^a-z0-9]+/g, '-')"""
    return re.sub(r'[^a-z0-9]+', '-', name.lower().strip()).strip('-') or 'camera'


def build_rtsp_url(cam: dict) -> str:
    """Return the real RTSP source URL for MediaMTX.
    Priority: location (real camera RTSP) > stream_url if it's an rtsp:// URL.
    Never returns an http://localhost HLS self-reference."""
    location = (cam.get('location') or '').strip()
    if location.startswith('rtsp://'):
        if '@' not in location:
            user = cam.get('username') or ''
            pwd  = cam.get('password') or ''
            if user and pwd:
                scheme, rest = location.split('://', 1)
                location = f"{scheme}://{quote_plus(user)}:{quote_plus(pwd)}@{rest}"
        return location

    url = (cam.get('stream_url') or '').strip()
    if url.startswith('rtsp://'):
        if '@' not in url:
            user = cam.get('username') or ''
            pwd  = cam.get('password') or ''
            if user and pwd:
                scheme, rest = url.split('://', 1)
                url = f"{scheme}://{quote_plus(user)}:{quote_plus(pwd)}@{rest}"
        return url

    return ''


def sync_mediamtx_paths(all_cameras: list) -> None:
    """
    Ensure every camera in `all_cameras` has a live path registered in MediaMTX.
    Uses PATCH so existing paths are updated in-place (no downtime for readers).
    """
    if not all_cameras:
        return

    for cam in all_cameras:
        rtsp = build_rtsp_url(cam)
        if not rtsp:
            continue

        slug = camera_slug(cam.get('name', ''))
        payload = {
            "source": rtsp,
            "rtspTransport": "tcp",
            "sourceOnDemand": True,
            "sourceOnDemandStartTimeout": "10s",
            "sourceOnDemandCloseAfter": "10s",
        }

        try:
            patch_url = f"{MEDIAMTX_API}/v3/config/paths/patch/{slug}"
            r = requests.patch(patch_url, json=payload, timeout=3)
            if r.status_code == 404:
                add_url = f"{MEDIAMTX_API}/v3/config/paths/add/{slug}"
                r = requests.post(add_url, json=payload, timeout=3)
            if r.status_code not in (200, 201):
                print(f"[MediaMTX] Warning: could not sync path '{slug}': {r.status_code} {r.text[:120]}")
            else:
                ai_logger.info(f"[MediaMTX] Path synced: /{slug} -> {rtsp[:60]}...")
        except requests.exceptions.ConnectionError:
            pass
        except Exception as e:
            print(f"[MediaMTX] Unexpected error syncing '{slug}': {e}")
