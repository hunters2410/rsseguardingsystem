import cv2, os, sys, time
sys.path.insert(0, '.')
import detectors.plate as plate
from config import supabase
from ultralytics import YOLO
from model_hub import get_model_path

os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|stimeout;10000000'
RTSP_URL = "rtsp://admin:%40Bc24680@192.168.1.126:554/cam/realmonitor?channel=1&subtype=0"

print("Connecting to live Car Park stream...")
cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
if not cap.isOpened():
    print("Could not open stream")
    sys.exit(1)

ret, frame = cap.read()
cap.release()

if not ret or frame is None:
    print("Failed to read live frame")
    sys.exit(1)

print(f"Live frame read: {frame.shape}")

ai_model = YOLO(get_model_path('license_plate_detection'))
camera = {'id': 'b5e98d04-c11d-4c69-bef5-dab6c5eebdf5', 'name': 'Car Park'}
model = {'id': 'c4a2ae24-5ae2-4284-8dbf-0095ba0f2813', 'name': 'Vehicle Number Plate Detection'}
settings = {}

print("Running YOLO plate model on full frame...")
results = ai_model(frame, verbose=False)

print("Running plate.handle()...")
detected = plate.handle(frame, results, camera, model, ai_model, 0.28, settings, [], {}, {}, 1, 1)
print(f"plate.handle() returned: {detected}")

plates = supabase.table('number_plates').select('*').order('created_at', desc=True).limit(3).execute().data
print("\nLatest number_plates in DB:")
for p in plates:
    print(f"  {p.get('created_at')} | {p.get('plate_text')} | {p.get('confidence')}% | State: {p.get('vehicle_state')}")
