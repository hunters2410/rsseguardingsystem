import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")

if not URL or not KEY:
    print("❌ Error: Missing credentials in .env")
    exit()

supabase = create_client(URL, KEY)

def check_linkage():
    print("--- SYSTEM LINKAGE DEBUG ---")
    
    # Check Servers
    servers = supabase.table("ai_servers").select("*").execute()
    print(f"\n1. AI Servers Registered: {len(servers.data)}")
    for s in servers.data:
        print(f"   - [{s['status'].upper()}] {s['name']} (ID: {s['id']})")

    # Check Models
    models = supabase.table("ai_models").select("*").execute()
    print(f"\n2. AI Models Configured: {len(models.data)}")
    for m in models.data:
        server_name = next((s['name'] for s in servers.data if s['id'] == m['server_id']), "None")
        print(f"   - [Active: {m['is_active']}] {m['name']} -> Server: {server_name}")

    # Check Camera-Model Assignments
    assignments = supabase.table("camera_models").select("*").execute()
    print(f"\n3. Camera-Model Links: {len(assignments.data)}")
    
    # Check Cameras
    cameras = supabase.table("cameras").select("*").execute()
    print(f"\n4. Cameras Status: {len(cameras.data)}")
    for c in cameras.data:
        active_models = [a for a in assignments.data if a['camera_id'] == c['id']]
        print(f"   - [{c['status'].upper()}] {c['name']} | Models Linked: {len(active_models)}")
        if c['status'] == 'disabled':
            print("     WARNING: This camera is DISABLED. AI will ignore it.")

    print("\n--- DEBUG COMPLETE ---")

if __name__ == "__main__":
    check_linkage()
