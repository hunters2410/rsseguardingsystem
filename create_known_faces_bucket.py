"""Clean up remaining duplicates, handling foreign key constraints in camera_models."""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from supabase import create_client

sb = create_client(
    "https://kgepmfgsaxwumhhoiubj.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZXBtZmdzYXh3dW1oaG9pdWJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk2Njc3OSwiZXhwIjoyMDkwNTQyNzc5fQ.Kjr0nY1XtmaE_teVJ4a5WpvbgiBt_0EfJNcASlV0kr8"
)

# The IDs we still need to clean up
remaining = [
    ("74147a9e-a306-4d38-9b27-cc46c6ce0a4d", "YOLOv8 X-Large person_detection copy 1", "person_detection"),
    ("61c5ecfd-7680-4169-b4d9-dc07c7e7b6ab", "YOLOv8 X-Large person_detection copy 2", "person_detection"),
    ("29949757-5cdc-4ff8-9dea-fff0b19aa288", "YOLOv8 X-Large mislabeled as fight_detection", "fight_detection"),
]

# The correct replacement model IDs (what we keep)
KEEP_PERSON_DETECTION = "08ca319a-7126-4a15-9241-3734638328ef"  # YOLOv8 Nano (Fastest) - oldest
KEEP_FIGHT_DETECTION  = "ea1c025a-ffde-4321-b034-416c8906b8f4"  # Fight / Aggression Detection - correct name

for old_id, label, mtype in remaining:
    keep_id = KEEP_PERSON_DETECTION if mtype == 'person_detection' else KEEP_FIGHT_DETECTION
    
    # 1. Remap any camera_models rows pointing to the duplicate -> point to the keeper
    remap = sb.table('camera_models').update({'ai_model_id': keep_id}).eq('ai_model_id', old_id).execute()
    remapped = len(remap.data) if remap.data else 0
    if remapped:
        print(f"  Remapped {remapped} camera_models row(s) from {old_id[:8]}... -> {keep_id[:8]}...")
    
    # 2. Now safe to delete
    sb.table('ai_models').delete().eq('id', old_id).execute()
    print(f"  Deleted: {label}")

# Fix PPE Detection model_type from 'yolo' to 'ppe_detection'
sb.table('ai_models').update({'model_type': 'ppe_detection'}).eq('id', 'cc3a0350-4dff-4367-88e0-8a7a1c82758e').execute()
print("  Fixed: PPE Detection model_type 'yolo' -> 'ppe_detection'")

print("\nAll done! Refresh the Alert Configuration page.")

# Verify final state
res = sb.table('ai_models').select('name, model_type, is_active').order('model_type').execute()
print("\nFinal AI Models:")
for m in res.data:
    print(f"  [{m['model_type']}]  {m['name']}  active={m['is_active']}")
