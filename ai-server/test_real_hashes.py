"""Test Plate Memory against actual historical crops from Supabase."""
import requests
import cv2
import numpy as np
from config import supabase
import plate_memory
import imagehash
from PIL import Image

plate_memory.init()

res = supabase.table('number_plates').select('id, plate_text, snapshot_url').order('created_at', desc=True).limit(20).execute()

crops_by_plate = {}

for row in res.data:
    text = row['plate_text']
    url = row.get('snapshot_url', '')
    if not url or 'plate-crops' not in url:
        continue
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            arr = np.frombuffer(resp.content, np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is not None:
                if text not in crops_by_plate:
                    crops_by_plate[text] = []
                crops_by_plate[text].append(img)
    except Exception as e:
        pass

print(f"Loaded crops for plates: {list(crops_by_plate.keys())}")

# Compute hashes and distances
for text, images in crops_by_plate.items():
    print(f"\n--- Plate: {text} ({len(images)} samples) ---")
    hashes = []
    for i, img in enumerate(images):
        h = plate_memory._compute_hash(img)
        hashes.append(h)
        print(f"  Sample {i+1} hash: {h}")
    
    if len(hashes) >= 2:
        for i in range(len(hashes)):
            for j in range(i+1, len(hashes)):
                dist = hashes[i] - hashes[j]
                print(f"  Distance between Sample {i+1} and Sample {j+1}: {dist}")
