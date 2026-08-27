"""Quick test: Compare EasyOCR vs Tesseract on actual plate crops from Supabase."""
import cv2
import numpy as np
import requests
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

# Set Tesseract path
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

from config import supabase, ocr_reader
from detectors.plate import rectify_zim_plate

ALLOWLIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

def run_tesseract(img):
    """Run Tesseract OCR with single-word PSM and character whitelist."""
    try:
        # PSM 8 = single word, PSM 7 = single text line
        config = f'--psm 8 --oem 3 -c tessedit_char_whitelist={ALLOWLIST}'
        text = pytesseract.image_to_string(img, config=config).strip().upper()
        # Also try to get per-character confidences
        data = pytesseract.image_to_data(img, config=config, output_type=pytesseract.Output.DICT)
        confs = [int(c) for c in data['conf'] if int(c) > 0]
        avg_conf = sum(confs) / len(confs) / 100.0 if confs else 0.0
        return text, avg_conf
    except Exception as e:
        return "", 0.0

def run_easyocr(img):
    """Run EasyOCR."""
    try:
        results = ocr_reader.readtext(img, allowlist=ALLOWLIST, paragraph=False)
        if not results:
            return "", 0.0
        results.sort(key=lambda r: r[0][0][0])
        text = "".join([r[1] for r in results]).upper()
        avg_conf = sum(float(r[2]) for r in results) / len(results)
        return text, avg_conf
    except:
        return "", 0.0


# Fetch crops
res = supabase.table('number_plates').select('plate_text, snapshot_url, confidence').order('created_at', desc=True).limit(10).execute()

print("=" * 90)
print(f"Comparing EasyOCR vs Tesseract on {len(res.data)} plate crops")
print("=" * 90)

for row in res.data:
    url = row.get('snapshot_url', '')
    old_text = row['plate_text']
    
    if not url or 'plate-crops' not in url:
        continue
    
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            continue
        img_array = np.frombuffer(resp.content, np.uint8)
        crop = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if crop is None:
            continue
    except:
        continue
    
    h, w = crop.shape[:2]
    print(f"\n{'─' * 70}")
    print(f"Crop: {w}×{h}px  |  DB: {old_text}")
    
    # Test at 5x scale with different preprocessing
    for scale in [3, 4, 5]:
        resized = cv2.resize(crop, (w * scale, h * scale), interpolation=cv2.INTER_LANCZOS4)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        
        # Sharpened Otsu
        gauss = cv2.GaussianBlur(gray, (0, 0), 2.5)
        sharp = cv2.addWeighted(gray, 2.2, gauss, -1.2, 0)
        _, otsu = cv2.threshold(sharp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if np.mean(otsu) < 127:
            otsu = cv2.bitwise_not(otsu)
        otsu_inv = cv2.bitwise_not(otsu)
        
        # EasyOCR
        e_text, e_conf = run_easyocr(otsu_inv)
        e_rect = rectify_zim_plate(e_text) if e_text else ""
        
        # Tesseract on normal Otsu
        t_text, t_conf = run_tesseract(otsu)
        t_rect = rectify_zim_plate(t_text) if t_text else ""
        
        # Tesseract on inverted
        ti_text, ti_conf = run_tesseract(otsu_inv)
        ti_rect = rectify_zim_plate(ti_text) if ti_text else ""
        
        # Tesseract on grayscale
        tg_text, tg_conf = run_tesseract(gray)
        tg_rect = rectify_zim_plate(tg_text) if tg_text else ""
        
        print(f"  [{scale}x] EasyOCR inv: '{e_text:12s}' → '{e_rect}' ({e_conf:.2f})")
        print(f"  [{scale}x] Tess otsu:   '{t_text:12s}' → '{t_rect}' ({t_conf:.2f})")
        print(f"  [{scale}x] Tess inv:    '{ti_text:12s}' → '{ti_rect}' ({ti_conf:.2f})")
        print(f"  [{scale}x] Tess gray:   '{tg_text:12s}' → '{tg_rect}' ({tg_conf:.2f})")

print(f"\n{'=' * 90}")
print("Done.")
