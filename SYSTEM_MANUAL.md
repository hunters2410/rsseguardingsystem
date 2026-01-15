# Real Star Security - E-Guarding System Documentation

## 1. System Overview
The Real Star Security E-Guarding System is a comprehensive AI-powered surveillance platform designed to monitor security cameras, detect potential threats using computer vision, and manage security events in real-time.

### Key Components
*   **Web Dashboard (Frontend)**: A React-based interface for managing cameras, viewing live streams, configuring AI models, and monitoring alerts.
*   **AI Surveillance Engine (Backend)**: A Python-based server leveraging YOLO (You Only Look Once) models for real-time object detection (e.g., weapons, intruders, fire).
*   **Streaming Server**: A low-latency streaming server (MediaMTX) that handles RTSP feeds from cameras and converts them for web playback.
*   **Database**: Supabase (PostgreSQL) is used for storing user data, system settings, camera configurations, and event logs.

---

## 2. Prerequisites
Before running the system, ensure the following are installed and configured:

1.  **Node.js**: Version 16+ (for frontend and streaming scripts).
2.  **Python**: Version 3.8+ (for the AI server).
3.  **Supabase Account**: A project set up with the required tables (`cameras`, `ai_models`, `security_events`, `system_settings`, etc.).
4.  **MediaMTX**: The strictly required executable for RTSP streaming (should be located in `streaming-server/mediamtx.exe`).

---

## 3. Installation

### 3.1. Clone the Repository
```bash
git clone <repository_url>
cd realstarsecurityeguarding
```

### 3.2. Install Frontend Dependencies
```bash
npm install
```

### 3.3. Install AI Server Dependencies
Navigate to the `ai-server` directory and install the Python requirements:
```bash
cd ai-server
pip install -r requirements.txt
cd ..
```
*Note: Ensure you have `ultralytics`, `opencv-python`, `supabase`, `python-dotenv`, etc., installed.*

### 3.4. Environment Configuration
Ensure you have a `.env` file in the root directory with your Supabase credentials:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key (For AI Server)
```

---

## 4. Running the System
To run the full system, you need to start three separate processes. It is recommended to run them in separate terminal windows.

### Step 1: Start the Streaming Server
This starts the MediaMTX server to handle video feeds.
```bash
npm run stream
```
*Output: You should see the MediaMTX server starting and listening on RTSP/HLS ports.*

### Step 2: Start the AI Surveillance Engine
This starts the Python script that processes video feeds and detects objects.
```bash
npm run ai-server
```
*Output: You will see "AI Surveillance Engine Starting..." and logs indicating it is connecting to Supabase and loading models.*

### Step 3: Start the Web Dashboard
This launches the React frontend.
```bash
npm run dev
```
*Output: Vite will start the development server, usually at http://localhost:5173.*

---

## 5. System Features & Usage

### 5.1. Dashboard
*   **Overview**: View system status, active cameras, and recent alerts.
*   **Quick Stats**: Monitoring uptime and active threats.

### 5.2. Camera Management
*   **Add Cameras**: Configure RSTP URLs for your IP cameras.
*   **Status**: Check if cameras are online or offline.
*   **View Feed**: Watch the live feed from individual cameras.

### 5.3. AI Models
*   **Model Library**: Manage different AI models (e.g., Weapon Detection, Fire Detection).
*   **Assignment**: Assign specific models to specific cameras.
*   **Confidence Thresholds**: Adjust how sensitive the AI should be.

### 5.4. Live Monitoring
*   **Multi-View**: Watch multiple camera feeds simultaneously.
*   **Real-time Detections**: See bounding boxes around detected objects in real-time.

### 5.5. Events & Alerts
*   **Event Log**: A searchable history of all detected security events.
*   **Evidence**: View snapshots/images captured during an event.
*   **Notification Settings**: Configure Email (SMTP) and SMS (Twilio) alerts in the **Settings** tab.

### 5.6. Settings
*   **General**: Company name and data retention policies.
*   **Email Integration**: Configure SMTP settings for email alerts. **test** your configuration with the "Sen Test Email" button.
*   **Security**: Update admin passwords.

---

## 6. Troubleshooting

### Email Testing Fails
*   **Check Console**: Look at the terminal running `npm run ai-server` for detailed error logs.
*   **SMTP Settings**: Verify your Host, Port (587 or 465), Username, and Password.
*   **App Passwords**: If using Gmail, you must use an "App Password", not your login password.

### Video Feed Not Loading
*   **Check RTSP URL**: Ensure the camera URL is correct and accessible from the server's network.
*   **MediaMTX**: Ensure `npm run stream` is running and `mediamtx.exe` is present.
*   **Browser Support**: Some browsers block mixed content if not using HTTPS.

### AI Not Detecting
*   **Model Assignment**: Ensure a model is assigned to the camera in the "AI Models" tab.
*   **Confidence**: Lower the confidence threshold if it's missing obvious objects.
*   **Performance**: Ensure the server has enough CPU/GPU power to process the feeds.
