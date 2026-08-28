"""
Full assignment audit — traces every camera_models row through the monitor logic
to show exactly which assignments are picked up and which are ignored (and why).
"""
import os
from dotenv import load_dotenv
from supabase import create_client
load_dotenv()
sb = create_client(
    os.getenv('VITE_SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_ANON_KEY')
)

SERVER_ID = None

# 1. Get server
servers = sb.table('ai_servers').select('*').execute().data
for s in servers:
    if s.get('status') == 'online':
        SERVER_ID = s['id']
        print(f"AI Server: {s['name']} ({s['id'][:8]}...)  Status: {s['status']}")
        break

if not SERVER_ID:
    print("ERROR: No online AI server found!")
    exit(1)

# 2. Get ALL models
all_models = sb.table('ai_models').select('*').execute().data
model_map = {m['id']: m for m in all_models}
print(f"\nTotal models in DB: {len(all_models)}")

# 3. Which models does the monitor see? (server_id = this server AND is_active = True)
monitor_models = [m for m in all_models if m.get('server_id') == SERVER_ID and m.get('is_active') == True]
monitor_model_ids = set(m['id'] for m in monitor_models)
print(f"Models visible to monitor (server_id match + is_active): {len(monitor_models)}")

# Show models NOT visible to monitor
invisible = [m for m in all_models if m['id'] not in monitor_model_ids]
if invisible:
    print("\n  ** INVISIBLE MODELS (won't be picked up by monitor):")
    for m in invisible:
        reasons = []
        if m.get('server_id') != SERVER_ID:
            if m.get('server_id'):
                reasons.append(f"server_id={m['server_id'][:8]}... (not this server)")
            else:
                reasons.append("server_id is NULL (no server assigned)")
        if not m.get('is_active'):
            reasons.append(f"is_active={m.get('is_active')}")
        print(f"    {m['name']:40s} | Reasons: {', '.join(reasons)}")

# 4. Get ALL camera_models rows
all_assignments = sb.table('camera_models').select('*').execute().data
print(f"\nTotal camera_models rows: {len(all_assignments)}")

# 5. Get ALL cameras
all_cameras = sb.table('cameras').select('*').execute().data
cam_map = {c['id']: c for c in all_cameras}

# 6. Trace each assignment
print("\n" + "=" * 90)
print("ASSIGNMENT AUDIT — tracing each camera_models row through monitor logic")
print("=" * 90)

picked_up = 0
ignored = 0

for a in all_assignments:
    cam = cam_map.get(a['camera_id'])
    model = model_map.get(a['ai_model_id'])
    cam_name = cam['name'] if cam else f"UNKNOWN ({a['camera_id'][:8]}...)"
    model_name = model['name'] if model else f"UNKNOWN ({a['ai_model_id'][:8]}...)"
    
    print(f"\n  {cam_name} + {model_name}")
    
    problems = []
    
    # Check is_active on camera_models row
    if a.get('is_active') != True:
        problems.append(f"camera_models.is_active = {a.get('is_active')} (must be True)")
    
    # Check model exists
    if not model:
        problems.append("Model not found in ai_models table")
    else:
        # Check model server_id
        if model.get('server_id') != SERVER_ID:
            if model.get('server_id'):
                problems.append(f"Model server_id = {model['server_id'][:8]}... (not this server: {SERVER_ID[:8]}...)")
            else:
                problems.append("Model has NO server_id assigned")
        
        # Check model is_active
        if not model.get('is_active'):
            problems.append(f"Model is_active = {model.get('is_active')}")
    
    # Check camera exists and not disabled
    if not cam:
        problems.append("Camera not found")
    elif cam.get('status') == 'disabled':
        problems.append(f"Camera status = 'disabled'")
    
    # Check camera has RTSP URL
    if cam and not (cam.get('location') or cam.get('stream_url', '')).strip():
        problems.append("Camera has no RTSP URL (location is empty)")
    
    if problems:
        ignored += 1
        print(f"    --> IGNORED! Reasons:")
        for p in problems:
            print(f"        - {p}")
    else:
        picked_up += 1
        model_type = model.get('model_type', '?') if model else '?'
        print(f"    --> OK (will run as {model_type})")

print(f"\n{'=' * 90}")
print(f"RESULT: {picked_up} assignments will run, {ignored} ignored")
print(f"{'=' * 90}")

# 7. Show cameras with AI enabled in UI but no working assignments
print("\n--- CAMERAS SHOWING AI BADGE BUT NO WORKING ASSIGNMENT ---")
# The UI shows AI badge for any camera_models row (now filtered by is_active)
ui_cameras = set()
for a in all_assignments:
    if a.get('is_active') == True:
        ui_cameras.add(a['camera_id'])

working_cameras = set()
for a in all_assignments:
    if a.get('is_active') != True:
        continue
    model = model_map.get(a['ai_model_id'])
    cam = cam_map.get(a['camera_id'])
    if not model or not cam:
        continue
    if model.get('server_id') != SERVER_ID:
        continue
    if not model.get('is_active'):
        continue
    if cam.get('status') == 'disabled':
        continue
    working_cameras.add(a['camera_id'])

badge_only = ui_cameras - working_cameras
if badge_only:
    for cid in badge_only:
        c = cam_map.get(cid)
        print(f"  {c['name'] if c else cid[:8]} - shows AI badge but no model will actually run!")
else:
    print("  None - all badges are accurate")
