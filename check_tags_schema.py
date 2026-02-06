
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(url, key)

try:
    print("--- Camera Models Schema ---")
    res = supabase.table('camera_models').select('*').limit(1).execute()
    if res.data:
        print(res.data[0].keys())
    else:
        print("No camera_models records found.")

    print("\n--- AI Models Schema ---")
    res = supabase.table('ai_models').select('*').limit(1).execute()
    if res.data:
        print(res.data[0].keys())

    print("\n--- Cameras Schema ---")
    res = supabase.table('cameras').select('*').limit(1).execute()
    if res.data:
        print(res.data[0].keys())

except Exception as e:
    print(f"Error: {e}")
