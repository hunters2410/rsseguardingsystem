
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(url, key)
try:
    res = supabase.table('events').select("id, event_type, created_at").limit(5).execute()
    print("Recent Events:")
    for e in res.data:
        print(f" - {e['created_at']}: {e['event_type']}")
except Exception as e:
    print("Error:", e)
