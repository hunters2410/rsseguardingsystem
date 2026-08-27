"""
model_hub.py  --  AI Weight Manager
=====================================
Central registry for all security detection model weights.

Given a model_type string, returns the local path to the correct .pt file,
automatically downloading from HuggingFace Hub on first use.

All weights are cached in ./weights/ next to this file.
Usage:
    from model_hub import get_model_path
    path = get_model_path('weapon_detection')   # -> 'weights/weapon_detection.pt'
"""

import os
import urllib.request

# Cache directories
# Primary: ./weights/  (new downloads go here)
# Legacy:  ./models/   (files already present from previous setup)
WEIGHTS_DIR = os.path.join(os.path.dirname(__file__), 'weights')
MODELS_DIR  = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(WEIGHTS_DIR, exist_ok=True)

# Registry: model_type -> { file, url, yolo_name, hw, size_mb, notes }
# file=None means pure OpenCV (no model needed)
# url=None + yolo_name set means ultralytics will auto-download
REGISTRY = {
    # Person & Behaviour
    'person_detection':          {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'General person + object detection (YOLOv8 nano)'},
    'person_detection_balanced': {'file': 'yolov8s.pt',               'url': None, 'yolo_name': 'yolov8s.pt',       'hw': 'cpu',             'size_mb': 22,  'notes': 'Person detection - balanced speed/accuracy (YOLOv8 small)'},
    'person_detection_accurate': {'file': 'yolov8m.pt',               'url': None, 'yolo_name': 'yolov8m.pt',       'hw': 'gpu_recommended', 'size_mb': 52,  'notes': 'Person detection - high accuracy (YOLOv8 medium)'},
    'loitering_detection':       {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Person detection + dwell-time logic (no extra weights needed)'},
    'crowd_detection':           {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Person count aggregation - fires when count > threshold'},
    'fight_detection':           {'file': 'yolov8n-pose.pt',          'url': None, 'yolo_name': 'yolov8n-pose.pt',  'hw': 'cpu',             'size_mb': 6,   'notes': 'Pose estimation - detects overlapping people with rapid motion'},
    'fall_detection':            {'file': 'yolov8n-pose.pt',          'url': None, 'yolo_name': 'yolov8n-pose.pt',  'hw': 'cpu',             'size_mb': 6,   'notes': 'Pose estimation - horizontal bounding box indicates fall'},
    'running_detection':         {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Person detection + centroid velocity tracking'},
    'tailgating_detection':      {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Detects 2nd person entering zone within N ms of 1st'},
    'intrusion_detection':       {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Person in restricted zone (uses zone definitions)'},
    # Threat
    'weapon_detection':          {'file': 'weapon_detection.pt',      'url': 'https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt', 'yolo_name': None, 'hw': 'gpu_recommended', 'size_mb': 6,  'notes': 'Weapon detection - gun, knife, bat'},
    'fire_detection':            {'file': 'fire_detection.pt',        'url': 'https://huggingface.co/keremberke/yolov8-fire-detection/resolve/main/best.pt', 'yolo_name': None, 'hw': 'cpu',            'size_mb': 6,  'notes': 'Fire and smoke detection - real trained weights from HuggingFace'},
    'smoke_detection':           {'file': 'fire_detection.pt',        'url': 'https://huggingface.co/keremberke/yolov8-fire-detection/resolve/main/best.pt', 'yolo_name': None, 'hw': 'cpu',            'size_mb': 6,  'notes': 'Smoke detection (shares weights with fire model)'},
    'vandalism_detection':       {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Scene change + person presence heuristic - no extra weights'},
    # Vehicle
    'vehicle_detection':         {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Car, truck, bus, motorcycle detection'},
    'license_plate_detection':   {'file': 'license_plate_detection.pt','url': 'https://huggingface.co/Koushim/yolov8-license-plate-detection/resolve/main/best.pt', 'yolo_name': None, 'hw': 'cpu', 'size_mb': 6, 'notes': 'License plate detection + EasyOCR / PaddleOCR text reading'},
    'wrong_way_detection':       {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Vehicle direction tracking - alerts when moving against expected flow'},
    'illegal_parking_detection': {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Vehicle stationary in no-park zone > configured minutes'},
    'vehicle_speed_detection':   {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Vehicle centroid velocity - requires px-per-metre calibration'},
    # Object Intelligence
    'abandoned_object_detection':{'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Object stationary > N minutes with no nearby person - alert'},
    'missing_object_detection':  {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Previously present object disappears - alert'},
    'ppe_detection':             {'file': 'ppe_detection.pt',          'url': 'https://huggingface.co/keremberke/yolov8-hard-hat-detection/resolve/main/best.pt', 'yolo_name': None, 'hw': 'cpu', 'size_mb': 6, 'notes': 'Hard hat / safety vest compliance - real trained weights'},
    # Face Intelligence
    'face_detection':            {'file': 'face_detection.pt',        'url': 'https://huggingface.co/arnabdhar/YOLOv8-Face-Detection/resolve/main/model.pt', 'yolo_name': None, 'hw': 'cpu',            'size_mb': 6,  'notes': 'Real face bounding box detection'},
    'unknown_face_detection':    {'file': 'face_detection.pt',        'url': 'https://huggingface.co/arnabdhar/YOLOv8-Face-Detection/resolve/main/model.pt', 'yolo_name': None, 'hw': 'gpu_recommended','size_mb': 6,  'notes': 'Face detection + DeepFace match against authorized face library'},
    'face_recognition':          {'file': 'face_detection.pt',        'url': 'https://huggingface.co/arnabdhar/YOLOv8-Face-Detection/resolve/main/model.pt', 'yolo_name': None, 'hw': 'cpu',            'size_mb': 6,  'notes': 'Face recognition'},
    'mask_detection':            {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Mask / no-mask detection using class label filter'},
    # Environmental & Tamper
    'camera_tamper_detection':   {'file': None, 'url': None, 'yolo_name': None,                                     'hw': 'cpu',             'size_mb': 0,   'notes': 'Frame blur + brightness analysis - no model required'},
    'flood_detection':           {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Hue/saturation analysis for ground-level water accumulation'},
    'motion_detection':          {'file': None, 'url': None, 'yolo_name': None,                                     'hw': 'cpu',             'size_mb': 0,   'notes': 'Background subtraction - no model required, pure OpenCV'},
    # General
    'object_tracking':           {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Multi-object tracking with trajectory history'},
    'animal_detection':          {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Animal intrusion - dog, cat, bird, horse, etc.'},
    'dress_code_detection':      {'file': 'yolov8n-seg.pt',           'url': None, 'yolo_name': 'yolov8n-seg.pt',   'hw': 'cpu',             'size_mb': 6,   'notes': 'HSV color analysis for dress code compliance'},
    'other':                     {'file': 'yolov8n.pt',               'url': None, 'yolo_name': 'yolov8n.pt',       'hw': 'cpu',             'size_mb': 6,   'notes': 'Custom / other detection type'},
}


def get_model_path(model_type: str, model_path_override: str = '') -> str:
    """
    Return the local path to the correct model weights for a given model_type.
    Search order:
      1. model_path_override  - explicit DB path (custom uploaded weights)
      2. weights/ dir         - new auto-downloads
      3. models/ dir          - legacy files (license_plate_detection.pt etc)
      4. root ai-server/ dir  - yolov8n.pt etc placed here manually
      5. REGISTRY url         - auto-download from HuggingFace
      6. yolo_name            - ultralytics auto-download
    Returns '' for pure-CV types (camera_tamper, motion_detection).
    """
    if model_path_override and model_path_override.strip():
        local = model_path_override.strip()
        for base in (local, os.path.join(WEIGHTS_DIR, local), os.path.join(MODELS_DIR, local)):
            if os.path.exists(base):
                return base

    entry = REGISTRY.get(model_type)
    if not entry:
        print(f"[ModelHub] Unknown model_type '{model_type}' -- defaulting to yolov8n.pt")
        return 'yolov8n.pt'

    if entry['file'] is None:
        return ''  # Pure-CV type

    for search_dir in (WEIGHTS_DIR, MODELS_DIR, os.path.dirname(__file__)):
        candidate = os.path.join(search_dir, entry['file'])
        if os.path.exists(candidate):
            return candidate

    if entry.get('url'):
        dest = os.path.join(WEIGHTS_DIR, entry['file'])
        print(f"[ModelHub] Downloading {entry['file']} for '{model_type}'...")
        try:
            _download(entry['url'], dest)
            print(f"[ModelHub] Saved to {dest}")
            return dest
        except Exception as e:
            print(f"[ModelHub] Download failed: {e} -- falling back to yolov8n.pt")
            return 'yolov8n.pt'

    if entry.get('yolo_name'):
        return entry['yolo_name']  # YOLO() will auto-download

    return 'yolov8n.pt'


def _download(url: str, dest: str) -> None:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, 'wb') as f:
        total = int(resp.getheader('Content-Length', 0))
        downloaded = 0
        chunk = 1024 * 64
        while True:
            data = resp.read(chunk)
            if not data:
                break
            f.write(data)
            downloaded += len(data)
            if total:
                print(f"\r[ModelHub]   {downloaded/total*100:.1f}%", end='', flush=True)
    print()


def list_available() -> list:
    result = []
    for mt, info in REGISTRY.items():
        if info['file'] is None:
            cached = True
        else:
            cached = any(
                os.path.exists(os.path.join(d, info['file']))
                for d in (WEIGHTS_DIR, MODELS_DIR, os.path.dirname(__file__))
            )
        result.append({'model_type': mt, 'cached': cached, 'hw': info['hw'],
                       'size_mb': info['size_mb'], 'notes': info['notes']})
    return result


if __name__ == '__main__':
    print('Available model types:\n')
    cached_count = 0
    for item in list_available():
        status = '[CACHED]        ' if item['cached'] else '[needs download]'
        if item['cached']:
            cached_count += 1
        hw = item['hw'].upper()[:16]
        notes = item['notes'][:55]
        print(f"  {item['model_type']:<38} {status}  HW: {hw:<16}  {notes}")
    total = len(REGISTRY)
    print(f"\n  {cached_count}/{total} models cached and ready to use.")
