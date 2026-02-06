import os
import requests
import uuid
import time
from supabase import create_client
from dotenv import load_dotenv

# Load from parent .env if valid, otherwise current directory
if os.path.exists("../.env"):
    load_dotenv("../.env")
else:
    load_dotenv()

# Setup Supabase
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_KEY:
     SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Could not load Supabase credentials.")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1. Download Model
# Using a publicly available YOLOv8n gun detection model
MODEL_URL = "https://github.com/BecayeSoft/Guns-Detection-YOLOv8/raw/main/yolov8n.pt"
MODEL_NAME = "weapon_detection.pt"
LOCAL_DIR = "models"
LOCAL_PATH = os.path.join(LOCAL_DIR, MODEL_NAME)

if not os.path.exists(LOCAL_DIR):
    os.makedirs(LOCAL_DIR)

print(f"Downloading weapon model from {MODEL_URL}...")
try:
    response = requests.get(MODEL_URL, timeout=60)
    response.raise_for_status()
    with open(LOCAL_PATH, 'wb') as f:
        f.write(response.content)
    print(f"Model saved to {LOCAL_PATH}")
except Exception as e:
    print(f"Failed to download model: {e}")
    print("Creating a dummy file if you want to test logic manually (optional)")
    # exit(1) 

# 2. Register in Database
try:
    with open("device_id.txt", "r") as f:
        server_id = f.read().strip()
except FileNotFoundError:
    print("device_id.txt not found. Please run the AI server at least once.")
    # Try to find a server in DB or just use a placeholder if we are setting up fresh
    res = supabase.table('ai_servers').select('*').limit(1).execute()
    if res.data:
        server_id = res.data[0]['id']
        print(f"Using server ID from DB: {server_id}")
    else:
        print("No servers found. Cannot register model.")
        exit(1)

print(f"Registering model for Server: {server_id}")

model_data = {
    "name": "Weapon Detection (YOLOv8n)",
    "description": "Specialized AI model for detecting guns, pistols, and firearms.",
    "model_type": "yolo",
    "version": "v1.0-gun",
    "accuracy": 0.85,
    "server_id": server_id,
    "is_active": True,
    "model_path": MODEL_NAME, 
    "smart_reporting": True
}

# Check if exists
try:
    res = supabase.table('ai_models').select('*').eq('model_path', MODEL_NAME).execute()
    if res.data:
        print("Model already registered. Updating...")
        supabase.table('ai_models').update(model_data).eq('id', res.data[0]['id']).execute()
    else:
        print("Inserting new model...")
        supabase.table('ai_models').insert(model_data).execute()
    
    print("Weapon detection model setup complete! You can now assign it to cameras.")
except Exception as e:
    print(f"Database error: {e}")
