import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("VITE_SUPABASE_URL")
key = os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(url, key)

with open('ai-server/device_id.txt', 'r') as f:
    sid = f.read().strip()

print(f"Fixing assignments for Server: {sid}")

# 1. Update ai_servers to be online for this SID
supabase.table('ai_servers').update({"status": "online"}).eq("id", sid).execute()

# 2. Assign the main model to this server
models = supabase.table('ai_models').select("*").execute().data
if models:
    mid = models[0]['id']
    for m in models:
        print(f"Reassigning model {m['name']} ({m['id']}) to {sid}...")
        supabase.table('ai_models').update({"server_id": sid, "is_active": True}).eq("id", m['id']).execute()

    # 3. Fix camera assignments to use this primary model
    assignments = supabase.table('camera_models').select("*").execute().data
    for a in assignments:
        print(f"Linking camera {a['camera_id']} to model {mid}...")
        supabase.table('camera_models').update({"ai_model_id": mid}).eq("id", a['id']).execute()

print("Done!")
