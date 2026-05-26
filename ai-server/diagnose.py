import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client

url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or
       os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY") or
       os.getenv("VITE_SUPABASE_ANON_KEY"))

sb = create_client(url, key)

print("=" * 60)
print("CAMERAS")
print("=" * 60)
cams = sb.table("cameras").select("id,name,stream_url,status").execute().data
for c in cams:
    url_short = (c["stream_url"] or "NO URL")[:70]
    print(f"  [{c['status']}] {c['name']} => {url_short}")

print()
print("=" * 60)
print("AI MODELS")
print("=" * 60)
models = sb.table("ai_models").select("id,name,model_type,is_active,server_id").execute().data
for m in models:
    sid = (m["server_id"] or "NONE")[:12]
    print(f"  active={m['is_active']} | {m['name']} ({m['model_type']}) | server={sid}")

print()
print("=" * 60)
print("ACTIVE CAMERA-MODEL ASSIGNMENTS (is_active=True)")
print("=" * 60)
assigns = sb.table("camera_models").select("*").eq("is_active", True).execute().data
print(f"  Count: {len(assigns)}")
for a in assigns:
    cam = next((c for c in cams if c["id"] == a["camera_id"]), None)
    mdl = next((m for m in models if m["id"] == a["ai_model_id"]), None)
    cam_name = cam["name"] if cam else a["camera_id"][:8]
    mdl_name = mdl["name"] if mdl else a["ai_model_id"][:8]
    print(f"  {cam_name} <-> {mdl_name}")

print()
print("=" * 60)
print("ALERT RULES")
print("=" * 60)
rules = sb.table("alert_rules").select("id,camera_id,mode,enabled_objects,confidence_threshold").execute().data
for r in rules:
    cid = r["camera_id"] or "GLOBAL"
    cam = next((c for c in cams if c["id"] == r["camera_id"]), None)
    cam_name = cam["name"] if cam else cid
    objs = r["enabled_objects"] or []
    print(f"  [{r['mode']}] {cam_name} | threshold={r['confidence_threshold']} | objects={objs[:5]}")

print()
print("=" * 60)
print("LATEST EVENTS (last 10)")
print("=" * 60)
evts = sb.table("events").select("id,event_type,created_at,camera_id").order("created_at", desc=True).limit(10).execute().data
if not evts:
    print("  *** NO EVENTS FOUND ***")
else:
    for e in evts:
        cam = next((c for c in cams if c["id"] == e["camera_id"]), None)
        cam_name = cam["name"] if cam else "unknown"
        print(f"  {e['created_at'][:19]} | {e['event_type']} | cam={cam_name}")

print()
print("=" * 60)
print("SERVER DEVICE ID")
print("=" * 60)
if os.path.exists("device_id.txt"):
    with open("device_id.txt") as f:
        sid = f.read().strip()
    print(f"  This server ID: {sid}")
    matching = [m for m in models if m["server_id"] == sid]
    print(f"  Models assigned to this server: {len(matching)}")
    for m in matching:
        print(f"    - {m['name']} (active={m['is_active']})")
else:
    print("  device_id.txt NOT FOUND — server has no ID yet")

print()
print("=" * 60)
print("STREAM CONNECTIVITY TEST")
print("=" * 60)
import cv2
for c in cams[:3]:
    url_str = c["stream_url"] or ""
    if not url_str:
        print(f"  {c['name']}: NO URL")
        continue
    cap = cv2.VideoCapture(url_str)
    ok = cap.isOpened()
    cap.release()
    print(f"  {c['name']}: {'OK - stream opens' if ok else 'FAIL - cannot open stream'} ({url_str[:60]})")
