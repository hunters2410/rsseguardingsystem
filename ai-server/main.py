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
import ultralytics
import requests
import numpy as np
from datetime import datetime
import torch
# Monkey patch torch.load to default weights_only=False for YOLO compatibility
# This is required because ultralytics/yolo currently doesn't support the new strict default in PyTorch 2.6+
_original_load = torch.load

def safe_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_load(*args, **kwargs)

torch.load = safe_load

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

# Global dictionary to keep track of active streams and models
# Structure: { "camera_id_model_id": { "stop_event": Event, "thread": Thread } }
active_monitors = {}

# Object tracking for movement detection
# Structure: { "camera_id": { "object_id": {"last_position": (x,y), "last_seen": timestamp, "total_movement": float} } }
object_trackers = {}

# Machine Identity
DEVICE_ID_FILE = "device_id.txt"
if os.path.exists(DEVICE_ID_FILE):
    with open(DEVICE_ID_FILE, 'r') as f:
        SERVER_UUID = f.read().strip()
else:
    SERVER_UUID = str(uuid.uuid4())
    with open(DEVICE_ID_FILE, 'w') as f:
        f.write(SERVER_UUID)

# Geometry Helper Functions
def ccw(A, B, C):
    return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])

def intersect(A, B, C, D):
    """Return true if line segments AB and CD intersect"""
    return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)

def check_zone_crossing(prev_pos, curr_pos, zone_line):
    """
    prev_pos: (x1, y1)
    curr_pos: (x2, y2)
    zone_line: [(zx1, zy1), (zx2, zy2)]
    """
    A = prev_pos
    B = curr_pos
    C = tuple(zone_line[0])
    D = tuple(zone_line[1])
    return intersect(A, B, C, D)

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
    """Downloads model from Supabase Storage to local cache or returns standard name"""
    if not model_path: return None
    
    # Clean up path
    model_path = model_path.strip()
    
    # Standard models from Ultralytics (allow any valid YOLOv8 filename)
    valid_yolo_names = ['yolov8n.pt', 'yolov8s.pt', 'yolov8m.pt', 'yolov8l.pt', 'yolov8x.pt', 
                       'yolov8n-pose.pt', 'yolov8s-pose.pt', 'yolov8m-pose.pt', 'yolov8l-pose.pt', 'yolov8x-pose.pt',
                       'yolov8n-seg.pt', 'yolov8s-seg.pt', 'yolov8m-seg.pt', 'yolov8l-seg.pt', 'yolov8x-seg.pt']
                       
    if model_path in valid_yolo_names:
        print(f"Using standard Ultralytics model: {model_path}")
        return model_path
        
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
        print(f"Failed to download model '{model_path}': {e}")
        # FALLBACK CONCEPT: If custom model fails, fallback to Nano for demo continuity
        print("WARNING: Falling back to 'yolov8n.pt' (Nano) to keep system running.")
        return "yolov8n.pt"

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

def should_trigger_alert(camera_id, object_label, alert_rules):
    """
    Determine if detected object should trigger an alert based on configured rules
    
    Args:
        camera_id: Camera UUID
        object_label: Detected object type (e.g., 'person', 'car')
        alert_rules: Rules dictionary from load_alert_rules()
    
    Returns:
        bool: True if should trigger, False otherwise
    """
    # Get camera-specific rule or fall back to global
    rule = alert_rules['cameras'].get(camera_id) or alert_rules['global']
    
    if not rule:
        # No rules configured - default to trigger all (backward compatible)
        # print(f"[Filter Debug] Cam: {camera_id[:5]} | Obj: {object_label} | No Rule -> Result: True (Default)")
        return True
    
    mode = rule.get('mode', 'whitelist')
    
    # Normalize to lowercase for safe comparison
    label_lower = object_label.lower()
    enabled_objects = [str(o).lower() for o in rule.get('enabled_objects', [])]
    disabled_objects = [str(o).lower() for o in rule.get('disabled_objects', [])]
    
    if mode == 'whitelist':
        # Only trigger if object is in enabled list
        result = label_lower in enabled_objects
        # Debug logging for troubleshooting
        if not result and hash(label_lower) % 100 == 0:
             print(f"[Filter] Skipping '{object_label}' (not in whitelist: {enabled_objects})")
        return result
    else:  # blacklist
        # Trigger unless object is in disabled list
        result = label_lower not in disabled_objects
        
        # ALWAYS LOG BLACKLIST CHECKS FOR NOW
        status = "ALLOWED" if result else "BLOCKED"
        log_msg = f"{datetime.now()} | Cam: {camera_id[:5]} | Obj: {object_label} | Mode: {mode} | Blacklist: {disabled_objects} -> {status}\n"
        try:
            with open("debug_filter.log", "a") as f:
                f.write(log_msg)
        except:
            pass
        
        print(f"[Filter Debug] {log_msg.strip()}")
        
        if not result:
            print(f"[Filter] Skipping '{object_label}' (in blacklist: {disabled_objects})")
        return result


def process_stream(camera, model, stop_event):
    """Main processing loop for a single camera + model pair"""
    model_name = model.get('name', 'Unknown Model')
    model_path = model.get('model_path')
    
    print(f"Starting {model_name} analysis on {camera['name']}")
    
    if not model_path:
        print(f"No file path for model {model_name}. Attempting default.")
        model_path = "yolov8n.pt"

    # Download and Load Model
    local_model_path = download_model(model_path)
    if not local_model_path:
        print("Could not load model file and fallback failed. Aborting.")
        return

    try:
        # Re-apply safe globals just in case
        torch.serialization.add_safe_globals([ultralytics.nn.tasks.DetectionModel])
        ai_model = YOLO(local_model_path)
    except Exception as e:
        print(f"Error loading YOLO model: {e}")
        return

    stream_source = camera.get('stream_url')
    
    # Inject credentials if provided
    username = camera.get('username')
    password = camera.get('password')
    if username and password and '@' not in stream_source:
        try:
            scheme, address = stream_source.split('://', 1)
            stream_source = f"{scheme}://{username}:{password}@{address}"
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
        skip_frames = 3  # Check more frequently (every 3rd frame)
        consecutive_failures = 0
        
        # Initialize tracker for this camera
        if camera['id'] not in object_trackers:
            object_trackers[camera['id']] = {}
        
        tracker = object_trackers[camera['id']]
        
        settings = get_system_settings()
        zones_map = load_zones()
        alert_rules = load_alert_rules()  # Load alert rules
        camera_zones = zones_map.get(camera['id'], [])
        last_settings_refresh = time.time()

        while not stop_event.is_set():
            if time.time() - last_settings_refresh > 5:
                settings = get_system_settings()
                zones_map = load_zones()
                alert_rules = load_alert_rules()  # Refresh alert rules
                camera_zones = zones_map.get(camera['id'], [])
                last_settings_refresh = time.time()

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
                conf_threshold = 0.28
                
                # Filter by Model Type
                model_type = model.get('model_type', 'other')
                
                # Mapping of model types to YOLO classes
                TYPE_MAPPING = {
                    'person_detection': ['person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck'],
                    'vehicle_detection': ['bicycle', 'car', 'motorcycle', 'bus', 'truck'],
                    'weapon_detection': ['weapon', 'gun', 'pistol', 'rifle', 'firearm', 'knife', 'handgun'],
                    'animal_detection': ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'],
                    'face_recognition': ['person'],
                    'crowd_detection': ['person'],
                    'intrusion_detection': ['person', 'bicycle', 'car', 'motorcycle', 'dog', 'bus', 'truck'],
                    'fire_detection': ['fire', 'smoke'],
                    'ppe_detection': ['helmet', 'vest', 'glove', 'glasses', 'mask', 'no-helmet', 'no-vest', 'no-glove', 'no-glasses', 'no-mask', 'NO-Hardhat', 'NO-Mask', 'NO-Safety Vest', 'Hardhat', 'Mask', 'Safety Vest']
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
                
                detected = False
                for r in results:
                    for box in r.boxes:
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
                        # if not should_trigger_alert(camera['id'], label, alert_rules):
                        #    continue
                        
                        original_label = label # Preserve for filtering check


                        # DEBUG: Log every detection that passes threshold
                        if frame_count % (skip_frames * 10) == 0:
                            print(f"[{camera['name']}] DETECTED: {label} ({conf:.2f})")

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
                            # Trigger immediately if object is persistent (no movement required for whitelisted objects)
                            should_trigger = True
                        else:
                            tracker[obj_id] = {
                                'last_position': current_position, 
                                'last_seen': current_time, 
                                'total_movement': 0, 
                                'seen_count': 1, 
                                'alerted': False
                            }

                        # Trigger processing
                        if should_trigger and not tracker[obj_id].get('alerted') and tracker[obj_id]['seen_count'] >= 2:
                            
                            # --- LATE FILTERING ---
                            # Logic:
                            # 1. If it IS a zone crossing ("_crossing" in label), ALLOW it (Bypass blacklist).
                            # 2. If it IS NOT a crossing, CHECK blacklist/whitelist rules.
                            
                            is_zone_crossing = "_crossing" in label
                            if is_zone_crossing:
                                print(f"[{camera['name']}] Zone Crossing Event (Allowed despite filter): {label}")
                            else:
                                # Regular detection
                                
                                # CHECK 1: GLOBAL STRICT MODE (Boundary Alerts Only)
                                if settings.get('boundary_alerts_only', False):
                                    print(f"[{camera['name']}] Filtered Event: {label} (BLOCKED - Strict Zone Mode Active)")
                                    continue
                                
                                # CHECK 2: Enforce Blacklist/Whitelist Rules
                                if not should_trigger_alert(camera['id'], original_label, alert_rules):
                                     print(f"[{camera['name']}] Filtered Event: {label} (BLOCKED - Rules)")
                                     continue 

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
                            header_text = "SECURITY BREACH" if is_zone_crossing else "DETECTION"
                            cv2.rectangle(snapshot_frame, (x1, y1 - 35), (x1 + 200, y1), (0, 0, 255), -1)
                            cv2.putText(snapshot_frame, f"{header_text}: {original_label.upper()}", (x1 + 5, y1 - 10),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

                            # If it's a zone crossing, highlight the specific line crossed
                            if is_zone_crossing and 'crossed_zone' in locals() and crossed_zone:
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
                                    
                                    tracker[obj_id]['alerted'] = True
                                    detected = True # Triggers camera cooldown
                                    
                                    threading.Thread(target=send_email_alert, args=(settings, {"event_type": label, "confidence": conf * 100, "camera_name": camera['name'], "snapshot_url": snapshot_url})).start()
                                    threading.Thread(target=send_sms_alert, args=(settings, {"event_type": label, "confidence": conf * 100, "camera_name": camera['name'], "snapshot_url": snapshot_url})).start()
                                except Exception as e:
                                    print(f"[{camera['name']}] Event Upload Error: {e}")

                # Clean up tracks not seen for 10s
                current_time = time.time()
                tracker = {k: v for k, v in tracker.items() if (not isinstance(v, dict)) or (current_time - v.get('last_seen', 0) < 10)}
                object_trackers[camera['id']] = tracker
                
                if detected:
                    time.sleep(5) # Camera-wide cooldown
                    break
                            
            except Exception as e:
                print(f"Inference error: {e}")
                
            time.sleep(0.01)

        cap.release()
        if stop_event.is_set():
            break
            
    print(f"Stopped {model_name} on {camera['name']}")

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
            
            with open("ai_log.txt", "a") as log:
                log.write(f"[{datetime.now()}] Found {len(my_models)} models for sid {server_id}\n")
            
            my_model_ids = [m['id'] for m in my_models]
            
            assignments = []
            if my_model_ids:
                # 2. Get active camera-model links
                res = supabase.table('camera_models').select('*').in_('ai_model_id', my_model_ids).execute()
                assignments = res.data
            
            with open("ai_log.txt", "a") as log:
                log.write(f"[{datetime.now()}] Found {len(assignments)} assignments\n")
            
            # 3. Get Cameras details
            cam_ids = list(set([a['camera_id'] for a in assignments]))
            cameras = []
            if cam_ids:
                 res = supabase.table('cameras').select('*').in_('id', cam_ids).neq('status', 'disabled').execute()
                 cameras = res.data

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

                    elif cmd['command_type'] == 'update_zones':
                         # Zones are now updated in DB directly by frontend. 
                         # This command serves as a notification to logs or potentially to force refresh.
                         # Since load_zones() polls DB, we just ack.
                         print(f"Received zone update notification for {cmd.get('payload', {}).get('camera_id', 'unknown')}")
                         result = "Zones update acknowledged. AI will pick up changes shortly."
                        
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

def sync_mediamtx():
    """Syncs cameras from Supabase to MediaMTX API paths"""
    print("Starting MediaMTX Sync Loop...")
    import requests
    from urllib.parse import quote_plus
    
    MEDIAMTX_API = "http://localhost:9997/v3/config/paths/add"
    
    while True:
        try:
            # 1. Fetch all enabled cameras
            res = supabase.table('cameras').select('*').neq('status', 'disabled').execute()
            cameras = res.data
            
            for cam in cameras:
                stream_url = cam.get('stream_url', '')
                
                # Check if this is a local proxy URL (e.g. http://localhost:8888/NAME/index.m3u8)
                if 'localhost:8888' in stream_url:
                    try:
                        name_part = stream_url.split('8888/')[1].split('/')[0]
                        
                        # Construct the RAW source URL from IP/Port/User/Pass
                        # In the updated frontend, these are available in the URL or preserved in logic
                        # But wait, we stripped them from DB. 
                        # I'll rely on the frontend putting the RTSP source in the description or similar?
                        # No, I previously patched the frontend to use http://localhost:8888/name
                        
                        # IMPROVED DATA FLOW:
                        # We need the ACTUAL source RTSP link to send to MediaMTX.
                        # I will check if the 'location' or a custom field has it.
                        # For now, let's look for a pattern where we can store it.
                        
                        # Actually, I'll update the frontend to save the RTSP source in the 'description' field
                        # and the 'stream_url' for the browser.
                        
                        rtsp_source = cam.get('location', '') # Temporal hack: using location field if it contains rtsp
                        if not rtsp_source.startswith('rtsp'):
                            continue
                            
                        print(f"Syncing path '{name_part}' -> {rtsp_source}")
                        
                        # Add/Update path in MediaMTX
                        config = {
                            "source": rtsp_source,
                            "sourceProtocol": "tcp"
                        }
                        
                        resp = requests.post(f"http://localhost:9997/v3/config/paths/add/{name_part}", json=config)
                        if resp.status_code == 400: # Already exists? Try patch
                            requests.patch(f"http://localhost:9997/v3/config/paths/patch/{name_part}", json=config)
                            
                    except Exception as inner:
                        print(f"Error syncing cam {cam.get('name')}: {inner}")

        except Exception as e:
            print(f"MediaMTX Sync Error: {e}")
            
        time.sleep(30) # Sync every 30 seconds

if __name__ == "__main__":
    with open("ai_log.txt", "a") as log:
        log.write(f"[{datetime.now()}] AI Surveillance Engine Starting...\n")
    
    sid = register_server()
    
    with open("ai_log.txt", "a") as log:
        log.write(f"[{datetime.now()}] sid: {sid}\n")

    # Start Command Processor
    cmd_thread = threading.Thread(target=process_system_commands, daemon=True)
    cmd_thread.start()
    
    # Start MediaMTX Sync
    sync_thread = threading.Thread(target=sync_mediamtx, daemon=True)
    sync_thread.start()
    
    monitor_assignments(sid)
