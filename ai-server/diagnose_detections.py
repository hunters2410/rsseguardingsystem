"""
diagnose_detections.py — Quick diagnostic to check why AI detections aren't working.
"""

import os
import sys
import threading
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase credentials")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=" * 70)
print("AI DETECTION DIAGNOSTIC REPORT")
print(f"Time: {datetime.now()}")
print("=" * 70)

# 1. Check AI Servers
print("\n--- AI SERVERS ---")
servers = sb.table('ai_servers').select('*').execute().data
for s in servers:
    print(f"  ID: {s['id'][:8]}...  Status: {s.get('status')}  Name: {s.get('name', '?')}")

# 2. Check AI Models
print("\n--- AI MODELS (active) ---")
models = sb.table('ai_models').select('*').eq('is_active', True).execute().data
for m in models:
    print(f"  ID: {m['id'][:8]}...  Name: {m.get('name','?'):30s}  Type: {m.get('model_type','?'):30s}  Server: {(m.get('server_id') or '?')[:8]}...")

# 3. Check camera_models assignments
print("\n--- CAMERA_MODELS (active assignments) ---")
assignments = sb.table('camera_models').select('*').eq('is_active', True).execute().data
print(f"  Total active assignments: {len(assignments)}")
for a in assignments:
    print(f"  Camera: {a.get('camera_id','?')[:8]}...  Model: {a.get('ai_model_id','?')[:8]}...")

# 4. Cross-reference: which cameras + models are actually paired?
print("\n--- ASSIGNMENT DETAILS ---")
cam_ids = list(set([a['camera_id'] for a in assignments]))
cameras = []
if cam_ids:
    cameras = sb.table('cameras').select('*').in_('id', cam_ids).execute().data

for a in assignments:
    cam = next((c for c in cameras if c['id'] == a['camera_id']), None)
    model = next((m for m in models if m['id'] == a['ai_model_id']), None)
    cam_name = cam['name'] if cam else 'UNKNOWN CAMERA'
    cam_status = cam.get('status', '?') if cam else '?'
    model_name = model['name'] if model else 'UNKNOWN MODEL'
    model_type = model.get('model_type', '?') if model else '?'
    model_server = (model.get('server_id') or '?')[:8] if model else '?'
    has_location = bool(cam.get('location', '').strip()) if cam else False
    print(f"  {cam_name:25s} [{cam_status:8s}] + {model_name:30s} ({model_type})")
    print(f"    Has RTSP URL: {has_location}  | Camera disabled: {cam_status == 'disabled'}")

# 5. Check alert rules
print("\n--- ALERT RULES ---")
rules = sb.table('alert_rules').select('*').execute().data
for r in rules:
    cam_id = r.get('camera_id')
    scope = f"Camera {cam_id[:8]}..." if cam_id else "GLOBAL"
    print(f"  [{scope:25s}]")
    print(f"    Mode: {r.get('mode', '?')}")
    print(f"    Enabled objects: {r.get('enabled_objects', [])}")
    print(f"    Disabled objects: {r.get('disabled_objects', [])}")
    print(f"    Schedule enabled: {r.get('schedule_enabled', False)}")
    if r.get('schedule_enabled'):
        print(f"    Schedule: {r.get('schedule_start')} - {r.get('schedule_end')}  Days: {r.get('schedule_days')}")
    print(f"    Confidence threshold: {r.get('confidence_threshold', 'default')}")
    print(f"    apply_to_zones_only: {r.get('apply_to_zones_only', False)}")
    print(f"    boundary_alerts_only: {r.get('boundary_alerts_only', False)}")

# 6. Check system_settings
print("\n--- SYSTEM SETTINGS ---")
settings = sb.table('system_settings').select('*').limit(1).execute().data
if settings:
    s = settings[0]
    print(f"  boundary_alerts_only: {s.get('boundary_alerts_only', False)}")
    print(f"  alert_email_enabled: {s.get('alert_email_enabled')}")
    print(f"  alert_sms_enabled: {s.get('alert_sms_enabled')}")
else:
    print("  No system settings found!")

# 7. Check recent events
print("\n--- RECENT EVENTS (last 10) ---")
events = sb.table('events').select('*').order('created_at', desc=True).limit(10).execute().data
if events:
    for e in events:
        print(f"  {e.get('created_at','?')[:19]}  Type: {e.get('event_type','?'):20s}  Conf: {e.get('confidence', 0):.1f}%  Camera: {e.get('camera_id','?')[:8]}...")
else:
    print("  No events found!")

# 8. Check camera zones
print("\n--- CAMERA ZONES ---")
zones = sb.table('camera_zones').select('*').execute().data
print(f"  Total zones: {len(zones)}")
for z in zones:
    print(f"  Camera: {z.get('camera_id','?')[:8]}...  Type: {z.get('type','?')}  Label: {z.get('label','?')}  Alert: {z.get('alert_enabled', True)}")

print("\n" + "=" * 70)
print("DIAGNOSIS SUMMARY")
print("=" * 70)

# Checks
issues = []

# Check: whitelist empty
for r in rules:
    if r.get('mode') == 'whitelist' and not r.get('enabled_objects'):
        scope = f"Camera {r.get('camera_id','?')[:8]}" if r.get('camera_id') else "GLOBAL"
        issues.append(f"WHITELIST EMPTY: {scope} has mode='whitelist' but enabled_objects is empty — ALL detections blocked!")

# Check: schedule blocking
for r in rules:
    if r.get('schedule_enabled'):
        from rules import is_within_schedule
        if not is_within_schedule(r):
            scope = f"Camera {r.get('camera_id','?')[:8]}" if r.get('camera_id') else "GLOBAL"
            issues.append(f"SCHEDULE BLOCKING: {scope} — outside active schedule window right now")

# Check: boundary_alerts_only
if settings and settings[0].get('boundary_alerts_only', False):
    issues.append("SYSTEM SETTING: boundary_alerts_only is ON — only zone-boundary alerts fire (no general detections)")

# Check: apply_to_zones_only with no zones
for r in rules:
    if r.get('apply_to_zones_only', False):
        cam_id = r.get('camera_id')
        cam_zones = [z for z in zones if z.get('camera_id') == cam_id]
        if not cam_zones:
            issues.append(f"ZONES REQUIRED: apply_to_zones_only is True for camera {cam_id[:8] if cam_id else 'GLOBAL'} but no zones defined!")

# Check: no assignments
if not assignments:
    issues.append("NO ASSIGNMENTS: No active camera_models entries — no cameras linked to AI models!")

# Check: models not assigned to this server
if servers:
    server_ids = [s['id'] for s in servers]
    orphan_models = [m for m in models if m.get('server_id') not in server_ids]
    if orphan_models:
        issues.append(f"ORPHANED MODELS: {len(orphan_models)} active models not assigned to any registered server")

if issues:
    print("\n[!] ISSUES FOUND:")
    for i, issue in enumerate(issues, 1):
        print(f"  {i}. {issue}")
else:
    print("\n[OK] No obvious configuration issues found.")
    print("   If still no detections, check:")
    print("   - AI server console (stdout) for 'Connecting to stream...' messages")
    print("   - Whether RTSP streams are actually accessible")
    print("   - Model weight files exist on disk")

print()
