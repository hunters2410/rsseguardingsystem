"""
monitor.py — Assignment monitoring loop.

Polls Supabase for active camera-model assignments and manages inference threads.
Also triggers MediaMTX path sync on every poll cycle.
"""

import time
import threading

from config import supabase, ai_logger, active_monitors
from server import SERVER_UUID
from process_stream import process_stream
from streaming import sync_mediamtx_paths


def monitor_assignments(server_id):
    """Polls Supabase for active assignments (camera_models)."""
    ai_logger.info(f"Monitoring assignments for Server ID: {server_id}...")

    while True:
        try:
            from datetime import datetime

            # 1. Get ALL active models, then auto-claim any that have no server_id
            all_active = supabase.table('ai_models').select('*').eq('is_active', True).execute().data

            # Auto-claim undeployed models (server_id is NULL) for this server
            unclaimed = [m for m in all_active if not m.get('server_id')]
            if unclaimed:
                for m in unclaimed:
                    try:
                        supabase.table('ai_models').update({'server_id': server_id}).eq('id', m['id']).execute()
                        m['server_id'] = server_id
                        ai_logger.info(f"[Monitor] Auto-claimed model: {m['name']} → this server")
                    except Exception as e:
                        ai_logger.warning(f"[Monitor] Failed to claim {m['name']}: {e}")

            # Filter to models belonging to this server
            my_models = [m for m in all_active if m.get('server_id') == server_id]

            ai_logger.info(f"Found {len(my_models)} models for this server")

            my_model_ids = [m['id'] for m in my_models]

            assignments = []
            if my_model_ids:
                # 2. Get active camera-model links
                res = supabase.table('camera_models').select('*').in_('ai_model_id', my_model_ids).eq('is_active', True).execute()
                assignments = res.data

            ai_logger.info(f"Found {len(assignments)} active camera assignments")

            # 3. Get Camera details
            cam_ids = list(set([a['camera_id'] for a in assignments]))
            cameras = []
            if cam_ids:
                res = supabase.table('cameras').select('*').in_('id', cam_ids).neq('status', 'disabled').execute()
                cameras = res.data

            # 4. Sync ALL cameras → MediaMTX
            try:
                all_cams_res = supabase.table('cameras').select('id, name, location, stream_url, username, password').neq('status', 'disabled').execute()
                sync_mediamtx_paths(all_cams_res.data or [])
            except Exception as mtx_err:
                ai_logger.warning(f"[MediaMTX] Sync error: {mtx_err}")

            active_keys = []

            for item in assignments:
                cam_id = item['camera_id']
                model_id = item['ai_model_id']

                key = f"{cam_id}_{model_id}"
                active_keys.append(key)

                cam = next((c for c in cameras if c['id'] == cam_id), None)
                model = next((m for m in my_models if m['id'] == model_id), None)

                if not cam or not model:
                    continue

                # Check if thread died
                if key in active_monitors and not active_monitors[key]['thread'].is_alive():
                    ai_logger.warning(f"Thread for {cam['name']} + {model['name']} died. Restarting...")
                    del active_monitors[key]

                # Start if not running
                if key not in active_monitors:
                    ai_logger.info(f"[Monitor] Starting: {cam['name']} + {model['name']} ({model.get('model_type', '?')})")
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
                    ai_logger.info(f"[Monitor] Assignment removed: {k}. Stopping thread...")
                    active_monitors[k]['stop_event'].set()
                    # Use a timeout so we don't block the entire loop if the
                    # stream is stuck reconnecting (10s sleep + retries).
                    active_monitors[k]['thread'].join(timeout=5)
                    if active_monitors[k]['thread'].is_alive():
                        ai_logger.warning(f"[Monitor] Thread {k} did not stop in 5s — will be cleaned up next cycle")
                    del active_monitors[k]

        except Exception as e:
            ai_logger.error(f"Error in monitor loop: {e}")

        time.sleep(5)

