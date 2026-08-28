import cv2, os, sys
sys.path.insert(0, '.')
import detectors.plate as plate

frame = cv2.imread('test_frame_carpark.jpg')
if frame is None:
    print('Failed to read test_frame_carpark.jpg')
    sys.exit(1)

print('HAS_GEMINI:', plate.HAS_GEMINI)
print('gemini_available():', plate.gemini_available() if plate.HAS_GEMINI else 'N/A')
print('HAS_PLATE_MEMORY:', plate.HAS_PLATE_MEMORY)
print('ocr_reader:', plate.ocr_reader is not None)

v_detector = plate._get_vehicle_detector()
v_results = v_detector(frame, verbose=False)

from ultralytics import YOLO
from model_hub import get_model_path
ai_model = YOLO(get_model_path('license_plate_detection'))

camera = {'id': 'b5e98d04-7e69-42e3-a3e0-febb0f5edd39', 'name': 'Car Park'}
model = {'id': 'c4a2ae24-5ae2-4284-8dbf-0095ba0f2813', 'name': 'Vehicle Number Plate Detection'}
settings = {}

candidates = []
for vr in v_results:
    for vb in vr.boxes:
        lbl = v_detector.names[int(vb.cls[0])]
        if lbl in ('car', 'truck', 'bus', 'motorcycle') and float(vb.conf[0]) >= 0.35:
            vx1, vy1, vx2, vy2 = map(int, vb.xyxy[0].tolist())
            vcrop = frame[vy1:vy2, vx1:vx2]
            p_res = ai_model(vcrop, verbose=False)
            for pr in p_res:
                for pb in pr.boxes:
                    p_conf = float(pb.conf[0])
                    if p_conf >= 0.30:
                        px1, py1, px2, py2 = map(int, pb.xyxy[0].tolist())
                        candidates.append((vx1+px1, vy1+py1, vx1+px2, vy1+py2, p_conf))

print(f'Total plate candidates found: {len(candidates)}')
for i, (x1, y1, x2, y2, conf) in enumerate(candidates):
    print(f'\n--- Testing candidate {i+1}: ({x1},{y1},{x2},{y2}) conf={conf:.2f} ---')
    h_frame, w_frame = frame.shape[:2]
    w = x2 - x1
    h = y2 - y1
    pad_x = int(w * 0.10)
    pad_y = int(h * 0.10)
    crop_x1 = max(0, x1 - pad_x)
    crop_y1 = max(0, y1 - pad_y)
    crop_x2 = min(w_frame, x2 + pad_x)
    crop_y2 = min(h_frame, y2 + pad_y)
    plate_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
    print(f'Plate crop shape: {plate_crop.shape}')

    # Test local OCR extraction
    text, ocr_conf = plate._extract_plate_text_local(plate_crop)
    print(f'EasyOCR extracted text: "{text}", conf: {ocr_conf}')
    print(f'Valid Zim plate?: {plate._validate_zim_plate(text)}')
    rect = plate.rectify_zim_plate(text)
    print(f'Rectified: "{rect}"')

    # Test Gemini if available
    if plate.HAS_GEMINI and plate.gemini_available():
        try:
            g_text, g_conf = plate.read_plate_gemini(plate_crop, scale=2)
            print(f'Gemini extracted: "{g_text}", conf: {g_conf}')
            print(f'Gemini rectified: "{plate.rectify_zim_plate(g_text)}"')
        except Exception as ge:
            print(f'Gemini error: {ge}')
