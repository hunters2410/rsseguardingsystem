import os
import cv2
import time
import threading
from dotenv import load_dotenv
from supabase import create_client, Client
from ultralytics import YOLO
import requests
import numpy as np
from datetime import datetime

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # Use Service Role Key for backend processing
STREAMING_SERVER_URL = os.getenv("STREAMING_SERVER_URL", "http://localhost:8888")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in .env")
    exit(1)

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Global dictionary to keep track of active streams and models
# Structure: { camera_id: { "stop_event": Event, "thread": Thread, "model_id": str } }
active_monitors = {}

def download_model(model_path):
    """Downloads model from Supabase Storage to local cache"""
    local_path = f"models/{os.path.basename(model_path)}"
    
    if not os.path.exists("models"):
        os.makedirs("models")
        
    if os.path.exists(local_path):
        return local_path # Return cached path if exists

    print(f"Downloading model: {model_path}...")
    try:
        # Generate signed URL or public URL depending on bucket setting
        # For public bucket:
        # url = f"{SUPABASE_URL}/storage/v1/object/public/ai-models/{model_path}"
        
        # Using download method
        res = supabase.storage.from_("ai-models").download(model_path)
        with open(local_path, 'wb') as f:
            f.write(res)
        print("Download complete.")
        return local_path
    except Exception as e:
        print(f"Failed to download model: {e}")
        return None

def process_stream(camera, model_path, stop_event):
    """Main processing loop for a single camera"""
    print(f"Starting analysis for camera: {camera['name']}")
    
    # Download and Load Model
    local_model_path = download_model(model_path)
    if not local_model_path:
        print("Could not load model. Aborting.")
        return

    try:
        model = YOLO(local_model_path)
    except Exception as e:
        print(f"Error loading YOLO model: {e}")
        return

    # Open Video Stream
    # Assuming Camera stream_url is usable, or use the transformed HLS/HTTP URL if needed
    # For OpenCV, mostly RTSP or HTTP-MJPEG works best. HLS can be laggy in CV2.
    # We will try to use the raw RTSP URL if available, otherwise the stream_url
    stream_source = camera.get('stream_url') 
    
    # If the stored stream_url is HLS (http://...m3u8), OpenCV might struggle with latency.
    # It is often better to process the RTSP source directly if possible.
    
    cap = cv2.VideoCapture(stream_source)
    
    frame_count = 0
    skip_frames = 5 # Process every 5th frame to save CPU
    
    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            print(f"Stream interrupted: {camera['name']}. Retrying in 5s...")
            time.sleep(5)
            cap.release()
            cap = cv2.VideoCapture(stream_source)
            continue

        frame_count += 1
        if frame_count % skip_frames != 0:
            continue

        # Run Inference
        results = model(frame, verbose=False)
        
        # Parse Detections
        # We only care about high confidence detections
        conf_threshold = 0.6
        
        for r in results:
            for box in r.boxes:
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                label = model.names[cls]
                
                if conf > conf_threshold:
                    # Check if this is a relevant class (person, weapon, etc)
                    # For now, we log everything high confidence
                    
                    # Create Alert
                    print(f"Detected {label} ({conf:.2f}) on {camera['name']}")
                    
                    # Upload Snapshot
                    # 1. Encode frame
                    ret, buffer = cv2.imencode('.jpg', frame)
                    if ret:
                        file_name = f"events/{camera['id']}_{int(time.time())}.jpg"
                        try:
                            supabase.storage.from_("event-snapshots").upload(
                                file_name,
                                buffer.tobytes(),
                                {"content-type": "image/jpeg"}
                            )
                            
                            # Get Public URL
                            snapshot_url = supabase.storage.from_("event-snapshots").get_public_url(file_name)
                            
                            # Insert Event Record
                            supabase.table('events').insert({
                                "camera_id": camera['id'],
                                "ai_model_id": camera.get('ai_model_id'),
                                "event_type": label,
                                "confidence": conf * 100,
                                "snapshot_url": snapshot_url,
                                "metadata": {"box": box.xywh.tolist()},
                                "acknowledged": False
                            }).execute()
                            
                            # Cooldown to prevent spamming db for same event
                            time.sleep(2) 
                            
                        except Exception as e:
                            print(f"Failed to save event: {e}")

        # Small sleep to prevent 100% CPU usage loop
        time.sleep(0.01)

    cap.release()
    print(f"Stopped analysis for {camera['name']}")

def monitor_assignments():
    """Polls Supabase for changes in Camera-Model assignments"""
    print("Monitoring database for changes...")
    
    while True:
        try:
            # Fetch all cameras with an active AI model assigned
            response = supabase.table('cameras').select('*, ai_models(*)').neq('ai_model_id', None).execute()
            cameras = response.data
            
            active_ids = []
            
            for cam in cameras:
                cam_id = cam['id']
                model = cam.get('ai_models')
                active_ids.append(cam_id)
                
                # Check if model is valid and active
                if not model or not model.get('is_active'):
                    continue
                    
                # If path is missing, can't process
                model_path = model.get('model_path') # We need to add this column to DB
                if not model_path:
                    continue

                # Start thread if not running
                if cam_id not in active_monitors:
                    stop_event = threading.Event()
                    t = threading.Thread(target=process_stream, args=(cam, model_path, stop_event))
                    t.start()
                    active_monitors[cam_id] = {
                        "stop_event": stop_event,
                        "thread": t,
                        "model_id": model['id']
                    }
                else:
                    # If model changed, restart
                    curr = active_monitors[cam_id]
                    if curr['model_id'] != model['id']:
                        print(f"Model changed for {cam['name']}. Restarting...")
                        curr['stop_event'].set()
                        curr['thread'].join()
                        
                        stop_event = threading.Event()
                        t = threading.Thread(target=process_stream, args=(cam, model_path, stop_event))
                        t.start()
                        active_monitors[cam_id] = {
                            "stop_event": stop_event,
                            "thread": t,
                            "model_id": model['id']
                        }

            # Stop monitors for cameras that no longer have AI assigned
            existing_ids = list(active_monitors.keys())
            for eid in existing_ids:
                if eid not in active_ids:
                    print(f"AI disabled for camera {eid}. Stopping...")
                    active_monitors[eid]['stop_event'].set()
                    active_monitors[eid]['thread'].join()
                    del active_monitors[eid]

        except Exception as e:
            print(f"Error in monitor loop: {e}")
        
        time.sleep(10) # Poll every 10 seconds

if __name__ == "__main__":
    print("AI Surveillance Engine Starting...")
    monitor_assignments()
