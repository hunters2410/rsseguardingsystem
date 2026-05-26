import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get('VITE_SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('VITE_SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('VITE_SUPABASE_ANON_KEY')
supabase = create_client(url, key)

# Get device ID
try:
    with open('ai-server/device_id.txt') as f:
        server_id = f.read().strip()
except:
    server_id = None

print("=== SERVER ID ===")
print(server_id or "NOT FOUND")

# Check server record
srv = supabase.table('ai_servers').select('*').eq('id', server_id).execute()
print("\n=== SERVER RECORD ===")
if srv.data:
    s = srv.data[0]
    print("Name:", s['name'])
    print("Status:", s['status'])
    print("IP:", str(s['ip_address']) + ":" + str(s['port']))
else:
    print("NOT FOUND in ai_servers table!")

# Check all models
all_models = supabase.table('ai_models').select('*').execute()
print("\n=== ALL AI MODELS (" + str(len(all_models.data)) + " total) ===")
for m in all_models.data:
    sid = m.get('server_id')
    if sid == server_id:
        owns = "(OWNED BY THIS SERVER)"
    elif sid:
        owns = "(server=" + str(sid)[:8] + "...)"
    else:
        owns = "(NO SERVER ASSIGNED)"
    status = "ACTIVE" if m['is_active'] else "INACTIVE"
    print("  [" + status + "] " + m['name'] + " | type=" + m['model_type'] + " | path=" + str(m.get('model_path','N/A')) + " " + owns)

# Check assignments for this server's models
my_model_ids = [m['id'] for m in all_models.data if m.get('server_id') == server_id]
assignments = supabase.table('camera_models').select('*').execute()
my_assignments = [a for a in assignments.data if a['ai_model_id'] in my_model_ids]
print("\n=== CAMERA ASSIGNMENTS FOR THIS SERVER (" + str(len(my_assignments)) + " / " + str(len(assignments.data)) + " total) ===")
for a in my_assignments:
    active = "active" if a.get('is_active') else "inactive"
    print("  Camera " + a['camera_id'][:8] + "... <-> Model " + a['ai_model_id'][:8] + "... (" + active + ")")
if not my_assignments:
    print("  NONE - No cameras are assigned to models on this server!")

# Check cameras
cams = supabase.table('cameras').select('id, name, status, location').execute()
print("\n=== ALL CAMERAS (" + str(len(cams.data)) + " total) ===")
for c in cams.data:
    loc = str(c.get('location', 'N/A'))[:50]
    print("  [" + str(c['status']) + "] " + c['name'] + " | rtsp=" + loc)

print("\n=== SUMMARY ===")
if not srv.data:
    print("PROBLEM: This server is NOT registered in the database.")
elif not my_model_ids:
    print("PROBLEM: No AI models are assigned to this server.")
elif not my_assignments:
    print("PROBLEM: Models exist on this server but NO cameras are linked to them.")
else:
    print("OK: " + str(len(my_assignments)) + " camera-model assignments found for this server.")
    active_count = len([m for m in all_models.data if m.get('server_id') == server_id and m['is_active']])
    print("OK: " + str(active_count) + " active models on this server.")
