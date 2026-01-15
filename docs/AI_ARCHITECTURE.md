# AI Implementation Architecture

To implement real-time AI analysis where you can upload models and have them process video feeds, we need a dedicated "Inference Engine". This cannot run in the browser or on Netlify; it must run on a server with access to the camera streams (e.g., the same machine as MediaMTX or a cloud server with GPU).

## 1. Architecture Overview

```mermaid
graph TD
    User[User (Web App)] -->|1. Upload Model| SupabaseStorage[Supabase Storage]
    User -->|2. Config| DB[(Supabase DB)]
    
    AIServer[Python AI Server] -->|3. Fetch Model| SupabaseStorage
    AIServer -->|4. Read Stream| Camera[CCTV Camera / MediaMTX]
    
    AIServer -->|5. Detect Objects| Inference[YOLO / TensorFlow]
    Inference -->|6. Save Events| DB
    
    DB -->|7. Realtime Alert| User
```

## 2. Technology Stack

*   **Language**: Python 3.10+ (Industry standard for AI).
*   **Framework**: FastAPI (High performance API).
*   **Computer Vision**: OpenCV (Video processing).
*   **AI Models**: Ultralytics YOLOv8 (Best for object/person detection) or TensorFlow Lite.
*   **Database**: Supabase Python Client (`supabase-py`).

## 3. Implementation Steps

### Phase 1: Frontend (React)
1.  **Enable File Upload**: Update `AIModelManagement.tsx` to allow uploading `.pt` (PyTorch) or `.onnx` model files.
2.  **Storage**: Create a bucket in Supabase called `ai-models`.
3.  **Linkage**: Update the database record with the `download_url` of the uploaded file.

### Phase 2: AI Server (Python)
We will create a specific folder `ai-server/` with a Python script that does the following:
1.  **Listen**: Connects to Supabase Realtime to listen for changes in `cameras` or `ai_models`.
2.  **Load**: When a camera is enabled, it downloads the assigned model from Supabase Storage.
3.  **Process**:
    *   Opens the RTSP stream (e.g., `rtsp://...` or `http://localhost:8888/...`).
    *   Reads frames in a loop.
    *   Passes frames to the Model (e.g., `model.predict(frame)`).
4.  **Action**:
    *   If a detection (e.g., "Person" > 80% confidence) occurs:
    *   Draw a bounding box on the frame.
    *   Upload the snapshot to Supabase Storage (`event-snapshots`).
    *   Insert a record into the `events` table.

### Phase 3: Dashboard (React)
1.  **Real-time Alerts**: The `EventsMonitoring` component will automatically update because it subscribes to the `events` table.

## 4. Example Python Logic (Draft)

```python
from ultralytics import YOLO
import cv2
from supabase import create_client

# 1. Connect to DB
supabase = create_client(URL, KEY)

# 2. Load Model (downloaded from user upload)
model = YOLO('yolov8n.pt') 

# 3. Process Video
cap = cv2.VideoCapture("http://localhost:8888/cam1")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break
    
    # 4. Infer
    results = model(frame)
    
    # 5. Check Detections
    for r in results:
        for box in r.boxes:
            if box.conf > 0.5 and box.cls == 0: # 0 is Person
                # 6. Trigger Event
                print("Intruder Detected!")
                save_event_to_supabase(frame, "Person Detected")
```

## 5. Security Note
Running user-uploaded models (Pickle/PyTorch files) has security risks. In a production environment, you should only allow standard formats like ONNX or TFLite, or sanitized YOLO weights.
