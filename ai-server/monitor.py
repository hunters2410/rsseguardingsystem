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
    print(f"Monitoring assignments for Server ID: {server_id}...")

    while True:
        try:
            from datetime import datetime
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Polling Supabase for assignments...")

            # 1. Get Models assigned to this server
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
                print(f"[MediaMTX] Sync error: {mtx_err}")

            active_keys = []

            for item in assignments:
                cam_id = item['camera_id']
                model_id = item['ai_model_id']
                print(f"Found active requirement: Cam {cam_id[:5]}... + Model {model_id[:5]}...")

                key = f"{cam_id}_{model_id}"
                active_keys.append(key)

                cam = next((c for c in cameras if c['id'] == cam_id), None)
                model = next((m for m in my_models if m['id'] == model_id), None)

                if not cam or not model:
                    continue

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
