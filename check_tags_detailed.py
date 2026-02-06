
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(url, key)

def print_keys(name, table):
    print(f"--- {name} ---")
    res = supabase.table(table).select('*').limit(1).execute()
    if res.data:
        for k in sorted(res.data[0].keys()):
            print(f"  {k}")
    else:
        print("  Empty")

try:
    print_keys("Camera Models", "camera_models")
    print_keys("AI Models", "ai_models")
    print_keys("Cameras", "cameras")
except Exception as e:
    print(f"Error: {e}")
