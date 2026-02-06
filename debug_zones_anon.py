
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load env vars
load_dotenv()

# Force use of ANON key only
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")

print(f"URL: {url}")
print(f"Key: {key[:5]}..." if key else "Key: None")

if not url or not key:
    print("Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY")
    exit(1)

supabase: Client = create_client(url, key)

def test_delete_zones():
    # 1. Get a camera ID
    try:
        cameras = supabase.table('cameras').select('id, name').limit(1).execute()
        if not cameras.data:
            print("No cameras found.")
            return
    except Exception as e:
         print(f"Error fetching cameras: {e}")
         return
    
    camera_id = cameras.data[0]['id']
    camera_name = cameras.data[0]['name']
    print(f"Testing with camera: {camera_name} ({camera_id})")

    # 2. Add a dummy zone
    print("Inserting dummy zone...")
    dummy_zone = {
        "camera_id": camera_id,
        "type": "line",
        "points": [[0,0], [1,1]],
        "label": "TEST_ZONE_DELETE",
        "alert_enabled": True
    }
    
    try:
        supabase.table('camera_zones').insert(dummy_zone).execute()
        print("Dummy zone inserted.")
    except Exception as e:
        print(f"Insert failed: {e}")

    # 3. Check it exists
    zones = supabase.table('camera_zones').select('*').eq('camera_id', camera_id).eq('label', 'TEST_ZONE_DELETE').execute()
    print(f"Zones found after insert: {len(zones.data)}")

    # 4. Delete it
    print("Deleting dummy zone...")
    try:
        supabase.table('camera_zones').delete().eq('camera_id', camera_id).eq('label', 'TEST_ZONE_DELETE').execute()
        print("Delete command executed.")
    except Exception as e:
        print(f"Delete failed: {e}")

    # 5. Verify deletion
    zones_after = supabase.table('camera_zones').select('*').eq('camera_id', camera_id).eq('label', 'TEST_ZONE_DELETE').execute()
    print(f"Zones found after delete: {len(zones_after.data)}")
    
    if len(zones_after.data) == 0:
        print("SUCCESS: Zone was deleted.")
    else:
        print("FAILURE: Zone still exists.")

if __name__ == "__main__":
    test_delete_zones()
