
import os
import uuid
import time
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
# strict priority for service role key
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

if not url or not key:
    print("Error: Supabase credentials not found")
    exit(1)

print(f"Using key starting with: {key[:5]}...")

supabase = create_client(url, key)

# 1. Get Device ID
try:
    with open("device_id.txt", "r") as f:
        server_id = f.read().strip()
    print(f"Server ID: {server_id}")
except FileNotFoundError:
    print("device_id.txt not found.")
    exit(1)

# 2. Ensure an AI Model exists for this server
print("Checking for AI Models...")
try:
    res = supabase.table('ai_models').select('*').eq('server_id', server_id).execute()
    model_id = None

    if not res.data:
        print("No models found for this server. Creating default 'YOLOv8 Base' model...")
        new_id = str(uuid.uuid4())
        new_model = {
            "id": new_id,
            "name": "YOLOv8 Base",
            "description": "Standard object detection model",
            "server_id": server_id,
            "model_path": "yolov8n.pt",
            "is_active": True,
            "configuration": {"conf_threshold": 0.5}
        }
        # Try upsert
        print(f"Attempting to upsert model {new_id}...")
        res = supabase.table('ai_models').upsert(new_model).execute()
        
        # Check
        time.sleep(1) 
        res_check = supabase.table('ai_models').select('*').eq('id', new_id).execute()
        if res_check.data:
            model_id = res_check.data[0]['id']
            print(f"Successfully created Model ID: {model_id}")
        else:
            print("Model upserted but not found. Check RLS policies?")
            exit(1)
    else:
        model_id = res.data[0]['id']
        print(f"Using existing Model ID: {model_id} ({res.data[0]['name']})")
except Exception as e:
    print(f"Error during model synchronization: {e}")
    # Attempt to use ANY existing model as fallback if we can't create one
    print("Attempting to find any existing model as fallback...")
    fallback = supabase.table('ai_models').select('*').limit(1).execute()
    if fallback.data:
        model_id = fallback.data[0]['id']
        print(f"Fallback to Model ID: {model_id}")
    else:
        print("Critical Error: No models available and could not create one.")
        exit(1)

# 3. Assign this model to ALL enabled cameras
print("Checking Active Cameras...")
cameras = supabase.table('cameras').select('*').neq('status', 'disabled').execute().data
print(f"Found {len(cameras)} enabled cameras.")

if not cameras:
    print("No cameras enabled. Please enable a camera in the dashboard first.")
    exit(0)

print(f"Assigning Model {model_id} to all cameras...")
count = 0
for cam in cameras:
    # Check if assignment exists
    check = supabase.table('camera_models').select('*').eq('camera_id', cam['id']).eq('ai_model_id', model_id).execute()
    if not check.data:
        try:
            supabase.table('camera_models').insert({
                "camera_id": cam['id'],
                "ai_model_id": model_id,
                "is_active": True
            }).execute()
            print(f"Assigned to {cam['name']}")
            count += 1
        except Exception as e:
            print(f"Failed to assign to {cam['name']}: {e}")
    else:
        print(f"Already assigned to {cam['name']}")

print(f"Done. Created {count} new assignments.")
