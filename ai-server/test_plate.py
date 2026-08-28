"""Quick test: read one frame from the Car Park stream via the drain approach and run plate inference."""
import os, sys, time, threading, cv2
from dotenv import load_dotenv
load_dotenv()

# Set RTSP transport
os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp|stimeout;30000000'

RTSP_URL = "rtsp://admin:%40Bc24680@192.168.1.126:554/cam/realmonitor?channel=1&subtype=0"
print(f"Connecting to: {RTSP_URL[:60]}...")

cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
if not cap.isOpened():
    print("ERROR: Could not open stream!")
    sys.exit(1)

print("Stream opened. Reading frames...")

# Read a few frames
for i in range(5):
    ret, frame = cap.read()
    if ret:
        print(f"  Frame {i+1}: {frame.shape} (OK)")
    else:
        print(f"  Frame {i+1}: FAILED")
    time.sleep(0.1)

if frame is None:
    print("No frames captured!")
    cap.release()
    sys.exit(1)

# Now test the plate model
print("\nLoading plate detection model...")
from model_hub import get_model_path
model_path = get_model_path('license_plate_detection')
print(f"  Model path: {model_path}")

from ultralytics import YOLO
ai_model = YOLO(model_path)
print("  Model loaded.")

# Run inference
print(f"\nRunning inference on frame {frame.shape}...")
t0 = time.time()
results = ai_model(frame, verbose=False)
t1 = time.time()
print(f"  Inference took: {t1-t0:.3f}s")

# Check results
total_boxes = 0
for r in results:
    for box in r.boxes:
        conf = float(box.conf[0])
        cls = int(box.cls[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        w, h = x2 - x1, y2 - y1
        label = ai_model.names.get(cls, f"cls{cls}")
        print(f"  Detection: {label} conf={conf:.2f} box=({x1},{y1},{x2},{y2}) size={w}x{h}")
        total_boxes += 1

print(f"\nTotal detections: {total_boxes}")

if total_boxes == 0:
    # Try the two-stage zoom approach
    print("\nNo direct detections. Trying two-stage zoom (vehicle detector -> plate crop)...")
    vehicle_model = YOLO('yolov8n.pt')
    v_results = vehicle_model(frame, verbose=False)
    vehicles = 0
    for vr in v_results:
        for vb in vr.boxes:
            lbl = vehicle_model.names[int(vb.cls[0])]
            vconf = float(vb.conf[0])
            if lbl in ('car', 'truck', 'bus', 'motorcycle') and vconf >= 0.35:
                vehicles += 1
                vx1, vy1, vx2, vy2 = map(int, vb.xyxy[0].tolist())
                print(f"  Vehicle: {lbl} conf={vconf:.2f} box=({vx1},{vy1},{vx2},{vy2})")
                
                # Crop and run plate model on vehicle
                vcrop = frame[vy1:vy2, vx1:vx2]
                if vcrop.size > 0:
                    p_res = ai_model(vcrop, verbose=False)
                    for pr in p_res:
                        for pb in pr.boxes:
                            pc = float(pb.conf[0])
                            px1, py1, px2, py2 = map(int, pb.xyxy[0].tolist())
                            print(f"    -> Plate in vehicle: conf={pc:.2f} box=({px1},{py1},{px2},{py2})")
    
    print(f"  Vehicles found: {vehicles}")

# Save the frame for inspection
cv2.imwrite("test_frame_carpark.jpg", frame)
print("\nSaved frame to test_frame_carpark.jpg")

cap.release()
print("Done.")
