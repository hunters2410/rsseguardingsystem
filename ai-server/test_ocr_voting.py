"""Test the improved multi-pipeline OCR + character voting on actual plate crops from Supabase."""
import cv2
import numpy as np
import requests
import sys
import os

# Add parent to path
sys.path.insert(0, os.path.dirname(__file__))

from config import supabase, ocr_reader
from detectors.plate import _extract_plate_text, _preprocess_pipelines, _run_ocr_on_image, rectify_zim_plate

# Fetch latest plate crops from Supabase
res = supabase.table('number_plates').select('plate_text, snapshot_url, confidence').order('created_at', desc=True).limit(10).execute()

print("=" * 80)
print(f"Testing {len(res.data)} plate crops with improved multi-pipeline OCR")
print("=" * 80)

for row in res.data:
    url = row.get('snapshot_url', '')
    old_text = row['plate_text']
    old_conf = row['confidence']
    
    if not url or 'plate-crops' not in url:
        print(f"\n[SKIP] {old_text} - No plate crop URL")
        continue
    
    # Download crop image
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            print(f"\n[SKIP] {old_text} - HTTP {resp.status_code}")
            continue
        img_array = np.frombuffer(resp.content, np.uint8)
        crop = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if crop is None:
            print(f"\n[SKIP] {old_text} - Could not decode image")
            continue
    except Exception as e:
        print(f"\n[SKIP] {old_text} - Download error: {e}")
        continue
    
    print(f"\n{'─' * 60}")
    print(f"Crop: {crop.shape[1]}×{crop.shape[0]}px  |  Old reading: {old_text} ({old_conf}%)")
    
    # Run each pipeline individually for debugging
    pipeline_images = _preprocess_pipelines(crop)
    pipeline_results = []
    for name, img in pipeline_images:
        text, conf = _run_ocr_on_image(img)
        rectified = rectify_zim_plate(text) if text else ""
        pipeline_results.append((name, text, rectified, conf))
        status = "✓" if len(rectified) == 7 else "·"
        print(f"  {status} [{name:16s}] raw='{text:12s}' → rectified='{rectified}' (conf={conf:.2f})")
    
    # Now run the full voting pipeline
    new_text, new_conf = _extract_plate_text(crop)
    
    match = "✅" if new_text == old_text else "🔄"
    print(f"  ── VOTED RESULT: {new_text} (conf={new_conf:.2f}) {match}")
    print(f"  ── Old DB value: {old_text} ({old_conf}%)")

print(f"\n{'=' * 80}")
print("Done.")
