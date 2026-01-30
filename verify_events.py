import os
from dotenv import load_dotenv
from supabase import create_client
import time

load_dotenv()

url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing Supabase credentials")
    exit(1)

supabase = create_client(url, key)

print("--- Checking Recent AI Events ---")
try:
    # Get last 5 events
    response = supabase.table('events').select('*, cameras(name), ai_models(name)').order('created_at', desc=True).limit(5).execute()
    
    if not response.data:
        print("No events found in the database yet.")
    else:
        for event in response.data:
            cam_name = event['cameras']['name'] if event['cameras'] else 'Unknown Camera'
            model_name = event['ai_models']['name'] if event['ai_models'] else 'Unknown Model'
            print(f"[{event['created_at']}] {event['event_type']} ({event['confidence']:.1f}%) on {cam_name} using {model_name}")
            print(f"   Snapshot: {event['snapshot_url']}")
            print("-" * 30)
            
except Exception as e:
    print(f"Error querying events: {e}")
