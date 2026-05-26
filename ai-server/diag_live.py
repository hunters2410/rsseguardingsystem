import sys, os
sys.path.insert(0, 'ai-server')
from dotenv import load_dotenv
load_dotenv()
from supabase import create_client
import os

url = os.getenv('VITE_SUPABASE_URL') or os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_ANON_KEY')
sb = create_client(url, key)

server_id = open('ai-server/device_id.txt').read().strip()
print(f"Server ID: {server_id}")

# AI Models assigned to this server
res = sb.table('ai_models').select('id,name,model_type,is_active').eq('server_id', server_id).eq('is_active', True).execute()
print(f"\n=== Active AI Models ({len(res.data)}) ===")
for m in res.data:
    print(f"  [{m['model_type']}] {m['name']}")

# Active camera_models assignments
res2 = sb.table('camera_models').select('*').eq('is_active', True).execute()
print(f"\n=== Active Assignments ({len(res2.data)}) ===")
for r in res2.data:
    print(f"  cam={r['camera_id'][:8]} model={r['ai_model_id'][:8]}")

# Recent events
res3 = sb.table('events').select('event_type,created_at').order('created_at', desc=True).limit(5).execute()
print(f"\n=== Recent Events ===")
for e in res3.data:
    print(f"  {e['created_at'][:19]} | {e['event_type']}")

# Check cameras
res4 = sb.table('cameras').select('id,name,status,location').neq('status','disabled').execute()
print(f"\n=== Cameras ({len(res4.data)} non-disabled) ===")
for c in res4.data:
    has_rtsp = bool(c.get('location','').startswith('rtsp://'))
    print(f"  [{c['status']}] {c['name'][:30]} | RTSP: {has_rtsp}")

# Check model weights on disk
from model_hub import list_available
print(f"\n=== Model Weights on Disk ===")
for item in list_available():
    if item['cached']:
        print(f"  [OK] {item['model_type']}")
    else:
        print(f"  [MISSING] {item['model_type']}")
