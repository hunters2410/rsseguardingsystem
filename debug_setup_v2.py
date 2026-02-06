
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

if not url or not key:
    print("Error: Supabase credentials not found in env")
    exit(1)

supabase = create_client(url, key)

# 1. Get Device ID
try:
    with open("device_id.txt", "r") as f:
        device_id = f.read().strip()
    print(f"Device ID from file: {device_id}")
except FileNotFoundError:
    print("device_id.txt not found! Server might not have run yet.")
    exit(1)

# 2. Check AI Server Registration
try:
    res = supabase.table('ai_servers').select('*').eq('id', device_id).execute()
    if not res.data:
        print("❌ Server NOT found in 'ai_servers' table!")
    else:
        print(f"✅ Server found: {res.data[0]['name']} (Status: {res.data[0]['status']})")
except Exception as e:
    print(f"Error checking ai_servers: {e}")

# 3. Check ALL AI Models
try:
    res = supabase.table('ai_models').select('*').execute()
    models = res.data
    print(f"Total AI Models in DB: {len(models)}")
    for m in models:
        print(f"  - Model: {m['name']} (ID: {m['id']}, Server: {m['server_id']})")
except Exception as e:
    print(f"Error checking ai_models: {e}")

# 4. Check Camera Assignments for these models
if models:
    model_ids = [m['id'] for m in models]
    try:
        res = supabase.table('camera_models').select('*').in_('ai_model_id', model_ids).execute()
        assignments = res.data
        print(f"Found {len(assignments)} assignments (camera -> model links).")
        for a in assignments:
            print(f"  - Camera {a['camera_id']} linked to Model {a['ai_model_id']}")
            
        # 5. Check Cameras
        if assignments:
            cam_ids = list(set([a['camera_id'] for a in assignments]))
            res = supabase.table('cameras').select('*').in_('id', cam_ids).execute()
            cameras = res.data
            print(f"Found {len(cameras)} cameras linked.")
            for c in cameras:
                print(f"  - Cam: {c['name']} (Status: {c['status']}, URL: {c['stream_url']})")

    except Exception as e:
        print(f"Error checking camera_models: {e}")
else:
    print("⚠️ No models assigned to this server. This is why no events are detected.")
    
# 6. Check events count
try:
    res = supabase.table('events').select('id', count='exact').execute()
    print(f"Total events in DB: {res.count}")
except Exception as e:
    print(f"Error checking events: {e}")
