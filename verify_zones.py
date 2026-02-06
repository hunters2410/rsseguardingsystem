"""
Zone & Boundaries System Verification Script
Run this to verify your zone configuration is working correctly
"""

import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment
load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: Missing Supabase credentials in .env")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("=" * 60)
print("🔍 ZONE & BOUNDARIES SYSTEM VERIFICATION")
print("=" * 60)
print()

# 1. Check if camera_zones table exists and has data
print("1️⃣  Checking camera_zones table...")
try:
    response = supabase.table('camera_zones').select('*').execute()
    zones = response.data
    
    if not zones:
        print("   ⚠️  No zones configured yet")
        print("   💡 Go to 'Zones & Boundaries' page to create zones")
    else:
        print(f"   ✅ Found {len(zones)} zone(s) configured")
        
        # Group by camera
        cameras_with_zones = {}
        for zone in zones:
            cam_id = zone['camera_id']
            if cam_id not in cameras_with_zones:
                cameras_with_zones[cam_id] = []
            cameras_with_zones[cam_id].append(zone)
        
        print(f"   📊 Zones distributed across {len(cameras_with_zones)} camera(s)")
        
        # Show details
        for cam_id, cam_zones in cameras_with_zones.items():
            # Get camera name
            cam_response = supabase.table('cameras').select('name').eq('id', cam_id).single().execute()
            cam_name = cam_response.data['name'] if cam_response.data else 'Unknown'
            
            print(f"\n   📹 Camera: {cam_name}")
            for zone in cam_zones:
                alert_status = "🔔 Alerts ON" if zone.get('alert_enabled', True) else "🔕 Alerts OFF"
                print(f"      • {zone['label']} ({zone['type']}) - {alert_status}")
                print(f"        Points: {zone['points']}")
                
except Exception as e:
    print(f"   ❌ Error: {e}")

print()

# 2. Check if cameras have AI models assigned
print("2️⃣  Checking camera-model assignments...")
try:
    response = supabase.table('camera_models').select('camera_id, ai_model_id').execute()
    assignments = response.data
    
    if not assignments:
        print("   ⚠️  No camera-model assignments found")
        print("   💡 Assign AI models to cameras in Camera Management")
    else:
        print(f"   ✅ Found {len(assignments)} active assignment(s)")
        
        # Check if cameras with zones have models
        if zones:
            for cam_id in cameras_with_zones.keys():
                has_model = any(a['camera_id'] == cam_id for a in assignments)
                cam_response = supabase.table('cameras').select('name').eq('id', cam_id).single().execute()
                cam_name = cam_response.data['name'] if cam_response.data else 'Unknown'
                
                if has_model:
                    print(f"   ✅ {cam_name} - Has AI model assigned")
                else:
                    print(f"   ⚠️  {cam_name} - NO AI model assigned (zones won't trigger)")
                    
except Exception as e:
    print(f"   ❌ Error: {e}")

print()

# 3. Check recent zone crossing events
print("3️⃣  Checking for zone crossing events...")
try:
    response = supabase.table('events').select('*').like('event_type', '%_crossing').order('created_at', desc=True).limit(10).execute()
    crossing_events = response.data
    
    if not crossing_events:
        print("   ℹ️  No zone crossing events detected yet")
        print("   💡 Test by having an object cross a configured tripwire")
    else:
        print(f"   ✅ Found {len(crossing_events)} recent crossing event(s)")
        for event in crossing_events[:5]:  # Show last 5
            cam_response = supabase.table('cameras').select('name').eq('id', event['camera_id']).single().execute()
            cam_name = cam_response.data['name'] if cam_response.data else 'Unknown'
            print(f"      • {event['event_type']} on {cam_name} - {event['created_at']}")
            
except Exception as e:
    print(f"   ❌ Error: {e}")

print()

# 4. Check system_commands for zone updates
print("4️⃣  Checking zone update commands...")
try:
    response = supabase.table('system_commands').select('*').eq('command_type', 'update_zones').order('created_at', desc=True).limit(5).execute()
    commands = response.data
    
    if not commands:
        print("   ℹ️  No zone update commands found")
    else:
        print(f"   ✅ Found {len(commands)} recent update command(s)")
        for cmd in commands:
            status_emoji = "✅" if cmd['status'] == 'completed' else "⏳" if cmd['status'] == 'pending' else "❌"
            print(f"      {status_emoji} {cmd['status'].upper()} - {cmd['created_at']}")
            
except Exception as e:
    print(f"   ❌ Error: {e}")

print()
print("=" * 60)
print("📋 SUMMARY")
print("=" * 60)

# Overall status
has_zones = zones and len(zones) > 0
has_assignments = assignments and len(assignments) > 0
has_events = crossing_events and len(crossing_events) > 0

if has_zones and has_assignments:
    print("✅ System is FULLY CONFIGURED and ready to detect zone crossings")
    if has_events:
        print("✅ Zone crossing detection is WORKING (events detected)")
    else:
        print("⏳ Waiting for first zone crossing event...")
elif has_zones and not has_assignments:
    print("⚠️  Zones configured but NO AI models assigned to cameras")
    print("   → Go to Camera Management and assign AI models")
elif not has_zones and has_assignments:
    print("⚠️  AI models assigned but NO zones configured")
    print("   → Go to Zones & Boundaries and draw tripwires")
else:
    print("❌ System NOT configured")
    print("   → Configure zones AND assign AI models to cameras")

print()
print("💡 Next Steps:")
if not has_zones:
    print("   1. Go to 'Zones & Boundaries' page")
    print("   2. Select a camera")
    print("   3. Click 'Add Tripwire' and draw a line")
    print("   4. Click 'Save Configuration'")
if not has_assignments:
    print("   1. Go to 'Camera Management' page")
    print("   2. Click the Brain icon on a camera")
    print("   3. Assign an AI model")
if has_zones and has_assignments and not has_events:
    print("   1. Ensure AI server is running (npm run ai-server)")
    print("   2. Have an object cross the tripwire line")
    print("   3. Check Events page for new detections")

print()
print("=" * 60)
