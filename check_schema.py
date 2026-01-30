
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY")

if not url:
    # Try finding in parent directory .env? 
    # Or just hardcode based on what read_file might show or previous context?
    # Actually, main.py successfully connects, so .env exists.
    pass

supabase = create_client(url, key)

print("Checking database schema...")

# Try to insert a dummy entry with new columns. 
# We use a transaction or just delete it immediately.
try:
    data = {
        "name": "SchemaTest",
        "location": "Test",
        "stream_url": "test",
        "status": "offline",
        "connection_type": "rtsp",
        "brand": "Generic",
        "ip_address": "0.0.0.0",
        "port": 0
    }
    # This will fail if columns don't exist
    res = supabase.table("cameras").insert(data).execute()
    print("Schema Check Passed: Columns exist.")
    # Clean up
    if res.data:
        supabase.table("cameras").delete().eq("id", res.data[0]['id']).execute()
except Exception as e:
    print(f"Schema Check Failed: {e}")
    # If it failed, we might need to run the SQL. 
    # Since we can't run DDL via client easily, we might just have to inform the user.
