
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

supabase = create_client(url, key)

try:
    with open("device_id.txt", "r") as f:
        my_id = f.read().strip()
    print(f"OUR DEVICE ID: {my_id}")
    
    models = supabase.table('ai_models').select('*').execute().data
    print(f"\nUPDATING {len(models)} MODELS TO POINT TO OUR SERVER...")
    for m in models:
        old_sid = m['server_id']
        if old_sid != my_id:
            print(f"Updating Model '{m['name']}' from {old_sid} to {my_id}")
            supabase.table('ai_models').update({'server_id': my_id}).eq('id', m['id']).execute()
        else:
            print(f"Model '{m['name']}' already points to us.")
            
    # Also ensure there is at least one assignment for each camera
    cameras = supabase.table('cameras').select('*').neq('status', 'disabled').execute().data
    if models and cameras:
        model_id = models[0]['id']
        print(f"\nENSURING ASSIGNMENTS FOR {len(cameras)} CAMERAS TO MODEL '{models[0]['name']}'...")
        for c in cameras:
            check = supabase.table('camera_models').select('*').eq('camera_id', c['id']).eq('ai_model_id', model_id).execute()
            if not check.data:
                print(f"Assigning camera '{c['name']}' to model '{models[0]['name']}'")
                supabase.table('camera_models').insert({'camera_id': c['id'], 'ai_model_id': model_id, 'is_active': True}).execute()
            else:
                print(f"Camera '{c['name']}' already assigned.")

    print("\nSUCCESS: All models and cameras should now be linked to this local server.")
except Exception as e:
    print(f"Error: {e}")
