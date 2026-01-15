import os
import cv2
import time
import threading
import socket
import uuid
import platform
from dotenv import load_dotenv
from supabase import create_client, Client
from ultralytics import YOLO
import requests
import numpy as np
from datetime import datetime

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") # Try VITE prefix first
if not SUPABASE_URL:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_KEY:
    SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in .env")
    exit(1)

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Global dictionary to keep track of active streams and models
# Structure: { "camera_id_model_id": { "stop_event": Event, "thread": Thread } }
active_monitors = {}

# Machine Identity
DEVICE_ID_FILE = "device_id.txt"
if os.path.exists(DEVICE_ID_FILE):
    with open(DEVICE_ID_FILE, 'r') as f:
        SERVER_UUID = f.read().strip()
else:
    SERVER_UUID = str(uuid.uuid4())
    with open(DEVICE_ID_FILE, 'w') as f:
        f.write(SERVER_UUID)

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

def download_model(model_path):
    """Downloads model from Supabase Storage to local cache"""
    local_path = f"models/{os.path.basename(model_path)}"
    
    if not os.path.exists("models"):
        os.makedirs("models")
        
    if os.path.exists(local_path):
        return local_path 

    print(f"Downloading model: {model_path}...")
    try:
        res = supabase.storage.from_("ai-models").download(model_path)
        with open(local_path, 'wb') as f:
            f.write(res)
        print("Download complete.")
        return local_path
    except Exception as e:
        print(f"Failed to download model: {e}")
        return None

import smtplib
from email.mime.text import MIMEText

# ... (Previous imports)

def send_email_alert(settings, event_data):
    if not settings.get('alert_email_enabled'): return
    
    try:
        msg = MIMEText(f"Target Detected: {event_data['event_type']} ({event_data['confidence']:.1f}%)\nCamera: {event_data['camera_name']}\nTime: {datetime.now()}\n\nView Snapshot: {event_data['snapshot_url']}")
        msg['Subject'] = f" Security Alert: {event_data['event_type']} Detected"
        msg['From'] = settings.get('smtp_from')
        msg['To'] = settings.get('admin_email')

        with smtplib.SMTP(settings.get('smtp_host'), settings.get('smtp_port')) as server:
            server.starttls()
            server.login(settings.get('smtp_user'), settings.get('smtp_pass'))
            server.send_message(msg)
        print("Email alert sent.")
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
                "To": "+1234567890", # In real app, this would be the user's phone number or from settings
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
    except:
        return {}
    return {}

def process_stream(camera, model, stop_event):
    """Main processing loop for a single camera + model pair"""
    model_name = model.get('name', 'Unknown Model')
    model_path = model.get('model_path')
    
    print(f"Starting {model_name} analysis on {camera['name']}")
    
    if not model_path:
        print(f"No file path for model {model_name}")
        return

    # Download and Load Model
    local_model_path = download_model(model_path)
    if not local_model_path:
        print("Could not load model file. Aborting.")
        return

    try:
        ai_model = YOLO(local_model_path)
    except Exception as e:
        print(f"Error loading YOLO model: {e}")
        return

    stream_source = camera.get('stream_url')
    cap = cv2.VideoCapture(stream_source)
    
    frame_count = 0
    skip_frames = 5 
    
    # Cache settings to avoid fetching every frame, refresh every minute maybe
    settings = get_system_settings()
    last_settings_refresh = time.time()

    while not stop_event.is_set():
        # Refresh settings occasionally
        if time.time() - last_settings_refresh > 60:
            settings = get_system_settings()
            last_settings_refresh = time.time()

        ret, frame = cap.read()
        if not ret:
            # print(f"Stream interrupted: {camera['name']}") 
            time.sleep(1)
            continue

        frame_count += 1
        if frame_count % skip_frames != 0:
            continue

        # Run Inference
        results = ai_model(frame, verbose=False)
        conf_threshold = 0.6
        
        for r in results:
            for box in r.boxes:
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                label = ai_model.names[cls]
                
                if conf > conf_threshold:
                    print(f"[{model_name}] Detected {label} ({conf:.2f}) on {camera['name']}")
                    
                    ret, buffer = cv2.imencode('.jpg', frame)
                    if ret:
                        file_name = f"events/{camera['id']}_{int(time.time())}.jpg"
                        try:
                            # Upload Snapshot
                            supabase.storage.from_("event-snapshots").upload(
                                file_name,
                                buffer.tobytes(),
                                {"content-type": "image/jpeg"}
                            )
                            snapshot_url = supabase.storage.from_("event-snapshots").get_public_url(file_name)
                            if hasattr(snapshot_url, 'publicUrl'): 
                                snapshot_url = snapshot_url.publicUrl

                            # Save Event
                            supabase.table('events').insert({
                                "camera_id": camera['id'],
                                "ai_model_id": model['id'],
                                "event_type": label,
                                "confidence": conf * 100,
                                "snapshot_url": snapshot_url,
                                "metadata": {"box": box.xywh.tolist()},
                                "acknowledged": False
                            }).execute()
                            
                            # Trigger Alerts
                            event_data = {
                                "event_type": label,
                                "confidence": conf * 100,
                                "camera_name": camera['name'],
                                "snapshot_url": snapshot_url
                            }
                            # Run in background to not block stream
                            threading.Thread(target=send_email_alert, args=(settings, event_data)).start()
                            threading.Thread(target=send_sms_alert, args=(settings, event_data)).start()
                            
                            time.sleep(5) # Cooldown
                        except Exception as e:
                            print(f"Failed to process event actions: {e}")

        time.sleep(0.01)

    cap.release()
    print(f"Stopped {model_name} on {camera['name']}")

def monitor_assignments(server_id):
    """Polls Supabase for active assignments (camera_models)"""
    print(f"Monitoring assignments for Server ID: {server_id}...")
    
    while True:
        try:
            # 1. Get Models assigned to this server (deployed here)
            # Or, arguably, we should run ALL assignments if we are the only server.
            # But stick to architecture: Models are deployed to Servers.
            response = supabase.table('ai_models').select('*').eq('server_id', server_id).eq('is_active', True).execute()
            my_models = response.data
            
            my_model_ids = [m['id'] for m in my_models]
            
            assignments = []
            if my_model_ids:
                # 2. Get active camera-model links
                res = supabase.table('camera_models').select('*').in_('ai_model_id', my_model_ids).execute()
                assignments = res.data
            
            # 3. Get Cameras details
            cam_ids = list(set([a['camera_id'] for a in assignments]))
            cameras = []
            if cam_ids:
                 res = supabase.table('cameras').select('*').in_('id', cam_ids).execute()
                 cameras = res.data

            active_keys = []
            
            for item in assignments:
                cam_id = item['camera_id']
                model_id = item['ai_model_id']
                
                # Unique key for this process pair
                key = f"{cam_id}_{model_id}"
                active_keys.append(key)
                
                cam = next((c for c in cameras if c['id'] == cam_id), None)
                model = next((m for m in my_models if m['id'] == model_id), None)
                
                if not cam or not model: continue
                
                # Start if not running
                if key not in active_monitors:
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
                        
                        msg = MIMEText(f"This is a test email from your AI Surveillance System.\n\nTime: {datetime.now()}\nStatus: System Operational")
                        msg['Subject'] = "Test Email - Real Star Security"
                        msg['From'] = smtp_from
                        msg['To'] = test_settings.get('admin_email')

                        print(f"Connecting to SMTP: {smtp_host}:{smtp_port} as {smtp_user}")

                        if smtp_port == 465:
                            server = smtplib.SMTP_SSL(smtp_host, smtp_port)
                        else:
                            server = smtplib.SMTP(smtp_host, smtp_port)
                            server.starttls()
                            
                        with server:
                            server.login(smtp_user, smtp_pass)
                            server.send_message(msg)
                            
                        result = "Email sent successfully."
                        
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

if __name__ == "__main__":
    print("AI Surveillance Engine Starting...")
    sid = register_server()
    
    # Start Command Processor
    cmd_thread = threading.Thread(target=process_system_commands, daemon=True)
    cmd_thread.start()
    
    monitor_assignments(sid)
