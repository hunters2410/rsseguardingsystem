# Real Star Security - E-Guarding System Documentation

## 1. System Overview
The Real Star Security E-Guarding System is a comprehensive AI-powered surveillance platform designed to monitor security cameras, detect potential threats using computer vision, and manage security events in real-time.

### Key Components
*   **Web Dashboard (Frontend)**: A React-based interface for managing cameras, viewing live streams, configuring AI models, and monitoring alerts.
*   **AI Surveillance Engine (Backend)**: A Python-based server leveraging YOLO (You Only Look Once) models for real-time object detection (e.g., weapons, intruders, fire).
*   **Streaming Server**: A low-latency streaming server (MediaMTX) that handles RTSP feeds from cameras and converts them for web playback.
*   **Database**: Supabase (PostgreSQL) is used for storing user data, system settings, camera configurations, and event logs.

---

## 2. Recent Updates (Version 2.0 - Security Optimized)

### 2.1. AI Detection Optimization
-   **Security Class Filtering**: The engine is now hard-filtered to only alert on security-relevant classes: `person`, `car`, `motorcycle`, `bus`, `truck`, `dog`, and `bicycle`. This eliminates false positives from static objects like benches or chairs.
-   **Intelligent Movement-Based Triggering**: To prevent duplicate alerts on static occupants, the system now tracks object movement. An alert is only triggered if an object moves significantly (total displacement > 15px or per-frame shift > 8px).
-   **Enhanced Sensitivity**: Detection confidence threshold tuned to `0.28` (Variable) to ensure reliable "person" detection even in challenging lighting conditions (e.g., Camera 9 optimization).
-   **Reduced Latency**: Optimized inference loop removing redundant model calls and overhead, ensuring smoother real-time analysis.

### 2.2. Frontend Enhancements
-   **Real-time Popup Alerts**: Implemented high-priority toast notifications in the **Live Monitoring** view. When a threat is detected, a popup immediately appears in the top-right corner with the camera name and event type.
-   **Stale-State Prevention**: Implemented `useRef` synchronization for camera lists to ensure real-time alerts always display the correct camera names regardless of component re-renders.
-   **Standardized Grid View**: Re-implemented responsive monitoring grid with 1, 2, and 4-column options for flexible surveillance layouts.

### 2.3. Infrastructure & Reliability
-   **Device ID Synchronization**: Hard-coded machine identity (`device_id.txt`) synchronization to ensure assignments from the cloud dashboard accurately map to the local edge processing server.
-   **Storage Integration**: Automated JPEG snapshot uploads to Supabase Storage (`event-snapshots` bucket) with public URL generation for immediate visual proof in emails and the dashboard.
-   **Automated Assignments**: Created `fix_assignments.py` utility to instantly link all registered cameras to the primary local AI server, reducing manual configuration time.

---

## 3. Prerequisites
Before running the system, ensure the following are installed and configured:

1.  **Node.js**: Version 18+ (for frontend and streaming scripts).
2.  **Python**: Version 3.10+ (for the AI server).
3.  **Supabase Account**: A project set up with the required tables (`cameras`, `ai_models`, `camera_models`, `events`, `system_settings`, etc.).
4.  **MediaMTX**: The strictly required executable for RTSP streaming (should be located in `streaming-server/mediamtx.exe`).

---

## 4. Installation & Setup

### 4.1. Clone and Install
```bash
git clone <repository_url>
cd realstarsecurityeguarding
npm install
```

### 4.2. AI Server Prerequisites
```bash
cd ai-server
pip install -r requirements.txt
# strictly required: ultralytics, opencv-python, supabase, torch
cd ..
```

### 4.3. Environment Configuration
Ensure `.env` in root contains:
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_SERVICE_ROLE_KEY=... # Vital for AI Server
```

---

## 5. Running the System

### Step 1: Start the Streaming Server
```bash
npm run stream
```

### Step 2: Start the AI Surveillance Engine
```bash
npm run ai-server
```
*Note: This process now logs detailed heartbeats to `ai_log.txt` for background debugging.*

### Step 3: Start the Web Dashboard
```bash
npm run dev
```

---

## 6. Technical Details for Developers

### Object Tracking Logic (`ai-server/main.py`)
-   Objects are identified using a composite key: `label + bucketed position`.
-   `seen_count`: Minimum of 2 consecutive frames required before triggering an alert to filter out flickering ghosts.
-   `alerted` flag: Prevents spamming the database; reset only after the object leaves the frame for >10 seconds.

### Event Notification Pipeline
1.  **AI Detection**: YOLOv8 processes the frame.
2.  **Logic Filter**: Checks class and movement.
3.  **Persistence**: Record inserted into `events` table via Supabase client.
4.  **Realtime Broadcast**: Supabase `postgres_changes` pushes detection to UI.
5.  **UI Feedback**: `LiveMonitoring.tsx` catches the event and triggers `toast.error()`.
6.  **External Alert**: Background thread initiates SMTP email relay and SMS (if configured).

---

## 7. Maintenance & CLI Tools
-   `fix_assignments.py`: Syncs local server ID with database models.
-   `check_db.py`: Quick check of the last 5 security events in the cloud.
-   `ai_log.txt`: Primary log file for debugging AI detection flows.

---
*Last Updated: January 30, 2026 - Real Star Security Agent*
