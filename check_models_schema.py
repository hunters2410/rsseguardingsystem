
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(url, key)

try:
    # Try to insert into ai_models with minimal fields
    res = supabase.table('ai_models').select('*').limit(1).execute()
    print("AI Models sample:")
    print(res.data)
    
    if res.data:
        print("Columns available:")
        print(res.data[0].keys())
    else:
        print("No models found. Attempting to find any record to see schema...")
        # Try to get any record from any table
        res = supabase.table('cameras').select('*').limit(1).execute()
        print("Cameras sample:")
        print(res.data)

except Exception as e:
    print(f"Error: {e}")
