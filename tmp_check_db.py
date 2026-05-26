import os, json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('c:/Users/Acer P16/Documents/Real Star Security Systems/realstarsecurityeguarding/.env')

client = create_client(
    os.environ['VITE_SUPABASE_URL'], 
    os.environ['VITE_SUPABASE_SERVICE_ROLE_KEY']
)

res = client.table('system_commands').select('*').order('created_at', desc=True).limit(2).execute()
print(json.dumps(res.data, indent=2))
