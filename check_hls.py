
import requests
import time

url = "http://localhost:8888/dahua/index.m3u8"
print(f"Checking HLS Playlist: {url}")

try:
    resp = requests.get(url, timeout=5)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        print("Playlist found!")
        print(resp.text[:200]) # Print first few lines
    else:
        print("Playlist not found or error.")
except Exception as e:
    print(f"Connection Error: {e}")
