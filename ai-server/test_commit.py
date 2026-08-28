import cv2, os, sys
sys.path.insert(0, '.')
import detectors.plate as plate
from config import supabase

frame = cv2.imread('test_frame_carpark.jpg')
if frame is None:
    print('Failed to read test_frame_carpark.jpg')
    sys.exit(1)

# Real Camera ID
camera = {'id': 'b5e98d04-c11d-4c69-bef5-dab6c5eebdf5', 'name': 'Car Park'}
model = {'id': 'c4a2ae24-5ae2-4284-8dbf-0095ba0f2813', 'name': 'Vehicle Number Plate Detection'}
settings = {}

print('Testing _process_candidate_plate directly with REAL camera ID...')
x1, y1, x2, y2, conf = 2197, 515, 2266, 560, 0.95
res = plate._process_candidate_plate(frame, x1, y1, x2, y2, conf, camera, model, settings)
print(f'_process_candidate_plate returned: {res}')

# Check number_plates table
plates = supabase.table('number_plates').select('*').order('created_at', desc=True).limit(2).execute().data
print('\nLatest number_plates in DB:')
for p in plates:
    print(f"  {p.get('created_at')} | {p.get('plate_text')} | {p.get('confidence')}% | {p.get('vehicle_state')}")

# Check events table
events = supabase.table('events').select('*').ilike('event_type', '%plate%').order('created_at', desc=True).limit(2).execute().data
print('\nLatest plate events in DB:')
for e in events:
    print(f"  {e.get('created_at')} | {e.get('event_type')} | {e.get('confidence')}%")
