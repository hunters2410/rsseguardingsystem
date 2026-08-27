"""
commands.py — System command processor.

Polls the `system_commands` table for pending commands from the frontend
and executes them (test email, test camera, start/stop streaming, etc.)
"""

import os
import sys
import time
import socket
import smtplib
import threading
from datetime import datetime
from email.mime.text import MIMEText

import cv2
import requests

from config import supabase, ai_logger, active_monitors
from rules import config_cache, get_config_lock, get_system_settings
from streaming import (
    check_streaming_online, STREAMING_SERVER_EXE, STREAMING_SERVER_YML,
    _streaming_lock,
)
from server import SERVER_UUID
import streaming as _streaming_mod  # for writing _streaming_process


def process_system_commands():
    """Polls for pending commands from the frontend."""
    print("Starting System Command Processor...")
    while True:
        try:
            response = supabase.table('system_commands').select('*').eq('status', 'pending').execute()
            commands = response.data

            if not commands:
                time.sleep(2)
                continue

            for cmd in commands:
                print(f"Processing command: {cmd['command_type']} ({cmd['id']})")
                supabase.table('system_commands').update({'status': 'processing'}).eq('id', cmd['id']).execute()

                try:
                    settings = get_system_settings()
                    payload = cmd.get('payload', {})

                    if cmd['command_type'] == 'test_email':
                        result = _handle_test_email(settings, payload)

                    elif cmd['command_type'] == 'test_camera_connection':
                        result = _handle_test_camera(payload)

                    elif cmd['command_type'] == 'force_refresh':
                        _config_lock = get_config_lock()
                        with _config_lock:
                            config_cache.force_refresh = True
                        print(f"[ConfigCache] force_refresh command received — config will reload within 0.1s")
                        result = "Force refresh queued. AI server will reload config within 100ms."

                    elif cmd['command_type'] == 'update_zones':
                        print(f"Received zone update notification for {payload.get('camera_id', 'unknown')}")
                        result = "Zones update acknowledged. AI will pick up changes shortly."

                    elif cmd['command_type'] == 'start_streaming_server':
                        result = _handle_start_streaming()

                    elif cmd['command_type'] == 'stop_streaming_server':
                        result = _handle_stop_streaming()

                    elif cmd['command_type'] == 'restart_server':
                        result = _handle_restart_server(cmd)
                        continue  # Already marked completed inside handler

                    elif cmd['command_type'] == 'shutdown_server':
                        result = _handle_shutdown_server(cmd)
                        continue  # Process exits inside handler

                    else:
                        result = "Unknown command type."

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


# ─────────────────────────────────────────────────────────────────────────────
#  Individual command handlers
# ─────────────────────────────────────────────────────────────────────────────

def _handle_test_email(settings, payload):
    test_settings = settings.copy()
    test_settings.update(payload)

    smtp_host = test_settings.get('smtp_host')
    smtp_port = int(test_settings.get('smtp_port', 587))
    smtp_user = test_settings.get('smtp_user')
    smtp_pass = test_settings.get('smtp_pass')
    smtp_from = test_settings.get('smtp_from')

    recipients = []
    if test_settings.get('admin_email'):
        recipients.append(test_settings.get('admin_email'))

    try:
        resp = supabase.table('notification_emails').select('email').execute()
        if resp.data:
            extra = [r['email'] for r in resp.data]
            recipients.extend(extra)
    except Exception:
        pass

    unique_recipients = list(set([r for r in recipients if r]))
    if not unique_recipients:
        raise Exception("No recipients found. Please enter an Admin Email.")

    msg = MIMEText(
        f"This is a test email from your AI Surveillance System.\n\n"
        f"Time: {datetime.now()}\nStatus: System Operational\n\n"
        f"This message was sent to confirm your configuration is working and "
        f"capable of reaching all {len(unique_recipients)} recipients."
    )
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

    return f"Email sent successfully to {len(unique_recipients)} recipients."


def _handle_test_camera(payload):
    from urllib.parse import quote_plus

    stream_url = payload.get('stream_url')
    username = payload.get('username')
    password = payload.get('password')

    if not stream_url:
        raise Exception("Missing stream_url")

    if username and password and '@' not in stream_url:
        try:
            scheme, address = stream_url.split('://', 1)
            safe_user = quote_plus(username)
            safe_pass = quote_plus(password)
            stream_url = f"{scheme}://{safe_user}:{safe_pass}@{address}"
        except ValueError:
            pass

    print(f"Testing connection to {stream_url.split('@')[-1]}...")

    # Pre-check socket
    try:
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

    return f"Success! Resolution: {int(width)}x{int(height)}, FPS: {int(fps)}"


def _handle_start_streaming():
    if check_streaming_online():
        return "Streaming server is already running (MediaMTX API responded on :9997)."
    if not os.path.exists(STREAMING_SERVER_EXE):
        raise Exception(f"MediaMTX executable not found at: {STREAMING_SERVER_EXE}")

    import subprocess as _sp
    ai_logger.info(f"[Streaming] Starting MediaMTX: {STREAMING_SERVER_EXE}")
    with _streaming_lock:
        _streaming_mod._streaming_process = _sp.Popen(
            [STREAMING_SERVER_EXE, STREAMING_SERVER_YML],
            cwd=os.path.dirname(STREAMING_SERVER_EXE),
            stdout=_sp.DEVNULL,
            stderr=_sp.DEVNULL,
            creationflags=_sp.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
        )
    online = False
    for _ in range(16):
        time.sleep(0.5)
        if check_streaming_online():
            online = True
            break
    if online:
        ai_logger.info("[Streaming] MediaMTX is online.")
        return f"Streaming server started successfully (PID {_streaming_mod._streaming_process.pid}). MediaMTX API is responding."
    else:
        return f"MediaMTX launched (PID {_streaming_mod._streaming_process.pid}) but did not respond within 8s. Check streaming-server/mediamtx.log."


def _handle_stop_streaming():
    import subprocess as _sp
    if not check_streaming_online():
        return "Streaming server is already offline."

    stopped = False
    with _streaming_lock:
        if _streaming_mod._streaming_process and _streaming_mod._streaming_process.poll() is None:
            _streaming_mod._streaming_process.terminate()
            try:
                _streaming_mod._streaming_process.wait(timeout=5)
            except Exception:
                _streaming_mod._streaming_process.kill()
            _streaming_mod._streaming_process = None
            stopped = True

    if not stopped:
        if sys.platform == 'win32':
            kill_result = _sp.run(['taskkill', '/F', '/IM', 'mediamtx.exe'], capture_output=True, text=True)
            stopped = kill_result.returncode == 0
        else:
            kill_result = _sp.run(['pkill', '-f', 'mediamtx'], capture_output=True)
            stopped = kill_result.returncode == 0

    if stopped:
        ai_logger.info("[Streaming] MediaMTX stopped.")
        return "Streaming server stopped successfully."
    return "Could not stop streaming server. It may have already exited."


def _handle_restart_server(cmd):
    import subprocess as _sp
    result = f"Restarting AI server — {len(active_monitors)} streams will reconnect within ~15s."
    supabase.table('system_commands').update({
        'status': 'completed',
        'result': result,
        'updated_at': datetime.now().isoformat()
    }).eq('id', cmd['id']).execute()
    ai_logger.info("[Restart] Received restart command — stopping all streams and relaunching...")
    supabase.table('ai_servers').update({'status': 'restarting'}).eq('id', SERVER_UUID).execute()
    for k, v in list(active_monitors.items()):
        v['stop_event'].set()
    time.sleep(2)
    ai_logger.info("[Restart] Relaunching process now...")
    _sp.Popen([sys.executable] + sys.argv)
    os._exit(0)


def _handle_shutdown_server(cmd):
    result = f"AI server shutting down — {len(active_monitors)} streams stopped."
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
    os.write(1, b"[Shutdown] Process terminated by user command.\n")
    os._exit(0)
