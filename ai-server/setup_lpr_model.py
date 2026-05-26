import os
import requests
import uuid
import time
from supabase import create_client
from dotenv import load_dotenv

if os.path.exists("../.env"):
    load_dotenv("../.env")
else:
    load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Could not load Supabase credentials.")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1. Download Model
# Using KeremBerke's model for License Plate Detection (YOLOv8 Nano)
MODEL_URL = "https://huggingface.co/keremberke/yolov8n-license-plate-detection/resolve/main/best.pt"
MODEL_NAME = "license_plate_detection.pt"
LOCAL_DIR = "models"
LOCAL_PATH = os.path.join(LOCAL_DIR, MODEL_NAME)

if not os.path.exists(LOCAL_DIR):
    os.makedirs(LOCAL_DIR)

print(f"Downloading LPR model from {MODEL_URL}...")
try:
    response = requests.get(MODEL_URL, timeout=120)
    response.raise_for_status()
    with open(LOCAL_PATH, 'wb') as f:
        f.write(response.content)
    print(f"Model saved to {LOCAL_PATH}")
except Exception as e:
    print(f"Failed to download model: {e}")

# 2. Get Server ID
try:
    with open("device_id.txt", "r") as f:
        server_id = f.read().strip()
except FileNotFoundError:
    print("device_id.txt not found.")
    res = supabase.table('ai_servers').select('*').limit(1).execute()
    if res.data:
        server_id = res.data[0]['id']
    else:
        print("No servers found. Cannot register model.")
        exit(1)

print(f"Registering LPR model for Server: {server_id}")

model_data = {
    "name": "Vehicle Number Plate Detection",
    "description": "Detects vehicle license/number plates specifically for access control and tracking.",
    "model_type": "license_plate_detection",
    "version": "v1.0-lpr",
    "accuracy": 92.5,
    "server_id": server_id,
    "is_active": True,
    "model_path": MODEL_NAME, 
    "smart_reporting": True
}

try:
    res = supabase.table('ai_models').select('*').eq('model_path', MODEL_NAME).execute()
    if res.data:
        print("Model already registered. Updating...")
        supabase.table('ai_models').update(model_data).eq('id', res.data[0]['id']).execute()
    else:
        print("Inserting new model...")
        supabase.table('ai_models').insert(model_data).execute()
    
    print("License Plate tracking model setup complete!")
except Exception as e:
    print(f"Database error: {e}")
