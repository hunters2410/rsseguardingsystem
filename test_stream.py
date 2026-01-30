
import cv2
import time
import os

stream_url = "http://localhost:8888/dahua/index.m3u8"
print(f"Testing Stream: {stream_url}")

try:
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        print("FAIL: Could not open stream")
    else:
        print("SUCCESS: Stream Opened!")
        # Try to read a frame
        ret, frame = cap.read()
        if ret:
            print(f"Frame Captured: {frame.shape}")
            cv2.imwrite("test_snapshot.jpg", frame)
            print("Saved test_snapshot.jpg")
        else:
            print("FAIL: Opened but no frame")
except Exception as e:
    print(f"Error: {e}")
