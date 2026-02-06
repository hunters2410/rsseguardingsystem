
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(url, key)

try:
    with open("device_id.txt", "r") as f:
        my_server_id = f.read().strip()
    print(f"My Server ID: {my_server_id}")
    
    res = supabase.table('ai_models').select('*').execute()
    print(f"Total Models: {len(res.data)}")
    for m in res.data:
        print(f"Model: {m['name']} | Server: {m['server_id']} | ID: {m['id']}")
        if m['server_id'] == my_server_id:
            print("  -> THIS IS OUR MODEL")
            
    res_servers = supabase.table('ai_servers').select('*').execute()
    print(f"\nTotal Servers: {len(res_servers.data)}")
    for s in res_servers.data:
        print(f"Server: {s['name']} | ID: {s['id']} | Status: {s['status']}")
        if s['id'] == my_server_id:
            print("  -> THIS IS US")

except Exception as e:
    print(f"Error: {e}")
