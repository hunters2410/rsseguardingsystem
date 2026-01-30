
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)

res = supabase.table("cameras").select("*").limit(1).execute()
if res.data:
    print("Columns:", list(res.data[0].keys()))
else:
    print("No cameras found to check columns.")
