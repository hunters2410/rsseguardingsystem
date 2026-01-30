import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(URL, KEY)

def fix_status():
    print("Checking cameras 'Gate 3' and 'camera 1'...")
    
    # Fetch cameras
    res = supabase.table("cameras").select("*").execute()
    cameras = res.data
    
    targets = ["Gate 3", "camera 1"]
    
    for cam in cameras:
        if cam['name'] in targets:
            print(f"Found {cam['name']}. Current status: {cam['status']}. Updating to 'online'...")
            supabase.table("cameras").update({"status": "online"}).eq("id", cam["id"]).execute()
            print(f"✅ {cam['name']} set to ONLINE.")

if __name__ == "__main__":
    fix_status()
