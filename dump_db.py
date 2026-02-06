
import os, json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
supabase = create_client(url, key)

server_id = "a96dd4c1-8eee-4d0e-84e1-18966f928738"

data = {
    "server": supabase.table('ai_servers').select('*').eq('id', server_id).execute().data,
    "models": supabase.table('ai_models').select('*').eq('server_id', server_id).execute().data,
    "all_models": supabase.table('ai_models').select('*').limit(10).execute().data,
    "assignments": supabase.table('camera_models').select('*').execute().data,
    "cameras": supabase.table('cameras').select('*').execute().data
}

with open('db_dump.json', 'w') as f:
    json.dump(data, f, indent=2)
print("Dumped to db_dump.json")
