
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(url, key)

server_id = "a96dd4c1-8eee-4d0e-84e1-18966f928738"

print(f"Checking status for Server ID: {server_id}")

try:
    # Check server record
    srv = supabase.table('ai_servers').select('*').eq('id', server_id).execute()
    if srv.data:
        print(f"Server record found: {srv.data[0].get('name')} (Status: {srv.data[0].get('status')})")
    else:
        print("Server record NOT found!")

    # Check models
    models = supabase.table('ai_models').select('*').eq('server_id', server_id).execute()
    print(f"Found {len(models.data)} models assigned to this server:")
    for m in models.data:
        print(f" - [{m['id']}] {m['name']} (Active: {m['is_active']})")

    # Check active models
    active_model_ids = [m['id'] for m in models.data if m['is_active']]
    
    if active_model_ids:
        assignments = supabase.table('camera_models').select('*').in_('ai_model_id', active_model_ids).execute()
        print(f"Found {len(assignments.data)} camera-model assignments:")
        for a in assignments.data:
            print(f" - Camera {a['camera_id']} <-> Model {a['ai_model_id']}")
    else:
        print("No active models found for this server.")

    # Check cameras
    cams = supabase.table('cameras').select('id, name, status').execute()
    print(f"Total cameras in DB: {len(cams.data)}")
    for c in cams.data:
        print(f" - [{c['id']}] {c['name']} (Status: {c['status']})")

except Exception as e:
    print("Error during check:", e)
