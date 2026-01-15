
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(url, key)
try:
    res = supabase.table('ai_servers').select("*").limit(1).execute()
    print("Data:", res.data)
except Exception as e:
    print("Error:", e)
