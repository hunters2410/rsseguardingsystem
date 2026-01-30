import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
supabase = create_client(URL, KEY)

res = supabase.table("cameras").select("id, name, status").execute()
for c in res.data:
    print(f"ID: {c['id']} | NAME: {c['name']} | STATUS: {c['status']}")
