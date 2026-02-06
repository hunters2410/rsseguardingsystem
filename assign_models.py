
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
supabase = create_client(url, key)

# Model ID for YOLOv8 X-Large Plus
model_id = "2c55021c-394e-43ba-89f9-5c873e194910"

# Fetch online cameras
res = supabase.table('cameras').select('id').eq('status', 'online').execute()
camera_ids = [c['id'] for c in res.data]

print(f"Found {len(camera_ids)} online cameras.")

for cam_id in camera_ids:
    print(f"Assigning model to camera {cam_id}...")
    try:
        supabase.table('camera_models').upsert({
            "camera_id": cam_id,
            "ai_model_id": model_id,
            "is_active": True
        }).execute()
        print("Success.")
    except Exception as e:
        print(f"Failed: {e}")

print("Done.")
