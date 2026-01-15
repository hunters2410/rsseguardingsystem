# How to Set Up Real-Time Camera Streaming

Since web browsers cannot play raw RTSP streams (the standard format for Security Cameras) directly, you need a "Media Server" to convert the stream into a web-friendly format like **HLS** or **WebRTC**.

We have implemented a **Universal Stream Player** in the application that supports both formats.

## 🚀 Step 1: Install a Media Server (MediaMTX)

We recommend **MediaMTX** (formerly rtsp-simple-server) as it is free, open-source, and extremely easy to use.

1.  **Download MediaMTX**:
    *   Go to: [MediaMTX Releases](https://github.com/bluenviron/mediamtx/releases)
    *   Download the version for your OS (e.g., `mediamtx_v1.9.0_windows_amd64.zip`).
2.  **Extract the folder**.
3.  **Run `mediamtx.exe`**.
    *   It will open a terminal window. Keep this running.

## 🔗 Step 2: Connect Your Camera

You need to "publish" your camera's RTSP stream to the Media Server.

**Option A: On-Demand (Simplest)**
You don't need to configure anything! If you have an RTSP link, MediaMTX can re-stream it automatically if you enable it, OR you can use FFmpeg to push it.

**Option B: Using FFmpeg (Recommended for Stability)**
If you have FFmpeg installed, run this command in a new terminal to push your camera stream to the server:

```bash
ffmpeg -re -stream_loop -1 -i rtsp://YOUR_CAMERA_IP:554/stream1 -c copy -f rtsp rtsp://localhost:8554/cam1
```

*   Replace `rtsp://YOUR_CAMERA_IP:554/stream1` with your actual camera URL.
*   `cam1` is the name you give to this stream.

## 📺 Step 3: Get the Web Stream URL

Once the stream is running, MediaMTX provides it in different formats.

*   **HLS (Best for this App)**: `http://localhost:8888/cam1`
*   **WebRTC**: `http://localhost:8889/cam1`

## 📲 Step 4: Update the App

1.  Go to your **Security Dashboard**.
2.  Navigate to **Camera Management**.
3.  Edit your camera (or add a new one).
4.  In the **Stream URL** field, paste the **HLS URL**:
    `http://localhost:8888/cam1`
5.  Save.

## ✅ Step 5: View Live Stream

Go to the **Live Monitoring** page. You should now see the video stream appearing!

---

### Troubleshooting

*   **Black Screen?** Check the Console (F12) for CORS errors. MediaMTX usually allows CORS by default.
*   **"Stream Error"?** Ensure the URL starts with `http://` (not `rtsp://`) in the dashboard.
*   **Mobile Access?** If accessing from a phone, replace `localhost` with your PC's local IP address (e.g., `http://192.168.1.5:8888/cam1`).
