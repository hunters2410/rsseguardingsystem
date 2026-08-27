"""
plate_memory.py — Visual Plate Memory using perceptual hashing.

Remembers previously identified license plates by their visual appearance.
When a plate crop is detected, it can be matched against known plates
without running OCR — similar to face recognition but for plates.

Uses perceptual hashing (pHash) for robust image matching that handles:
- Slightly different camera angles
- Lighting variations
- Minor scale differences
"""

import threading
import time
import cv2
import numpy as np
from collections import OrderedDict

try:
    import imagehash
    from PIL import Image
    IMAGEHASH_AVAILABLE = True
except ImportError:
    IMAGEHASH_AVAILABLE = False
    print("[PlateMemory] imagehash not installed. Visual plate memory disabled.")

from config import supabase


# In-memory LRU cache of known plates
# Key: plate_text -> { hash: imagehash, last_seen: timestamp }
_known_plates = OrderedDict()
_memory_lock = threading.Lock()
_MAX_CACHE_SIZE = 200
_last_db_sync = 0.0
_DB_SYNC_INTERVAL = 300.0  # Sync from DB every 5 minutes

# Matching threshold for hash_size=8 (64 bits):
# Distance <= 10 allows lighting/angle variation while preventing false positives
MATCH_THRESHOLD = 10


def _cv2_to_pil(cv2_img):
    """Convert OpenCV image to PIL."""
    if len(cv2_img.shape) == 2:
        return Image.fromarray(cv2_img)
    return Image.fromarray(cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB))


def _compute_hash(crop_image):
    """Compute perceptual hash of a plate crop image using 64-bit pHash."""
    if not IMAGEHASH_AVAILABLE:
        return None
    try:
        # Resize to standard size before hashing for consistency
        std_w, std_h = 200, 60
        resized = cv2.resize(crop_image, (std_w, std_h), interpolation=cv2.INTER_LANCZOS4)
        pil_img = _cv2_to_pil(resized)
        return imagehash.phash(pil_img, hash_size=8)
    except Exception as e:
        print(f"[PlateMemory] Hash computation error: {e}")
        return None


def _load_from_db():
    """Load known plates from the Supabase `known_plates` table into cache with owner details."""
    global _last_db_sync
    try:
        try:
            res = supabase.table('known_plates').select(
                'plate_text, image_hash, owner_name, vehicle_desc, tag, highlight_color, alert_on_detect, notes, last_seen, times_seen'
            ).order('last_seen', desc=True).limit(_MAX_CACHE_SIZE).execute()
        except:
            # Fallback if owner columns not yet migrated
            res = supabase.table('known_plates').select(
                'plate_text, image_hash, last_seen, times_seen'
            ).order('last_seen', desc=True).limit(_MAX_CACHE_SIZE).execute()
        
        if res.data:
            with _memory_lock:
                for row in res.data:
                    text = row['plate_text']
                    hash_str = row.get('image_hash', '')
                    h = None
                    if hash_str and IMAGEHASH_AVAILABLE:
                        try:
                            if len(hash_str) == 16:
                                h = imagehash.hex_to_hash(hash_str)
                        except:
                            h = None
                    
                    _known_plates[text] = {
                        'hash': h,
                        'owner_name': row.get('owner_name') or '',
                        'vehicle_desc': row.get('vehicle_desc') or '',
                        'tag': row.get('tag') or 'unknown',
                        'highlight_color': row.get('highlight_color') or '#64748B',
                        'alert_on_detect': row.get('alert_on_detect', False),
                        'notes': row.get('notes') or '',
                        'last_seen': row.get('last_seen', ''),
                        'times_seen': row.get('times_seen', 1),
                    }
            print(f"[PlateMemory] Loaded {len(res.data)} known plates into memory.")
        _last_db_sync = time.time()
    except Exception as e:
        print(f"[PlateMemory] DB load error: {e}")
        _last_db_sync = time.time()


def get_plate_info(plate_text):
    """Retrieve owner and highlight details for a given plate text."""
    if not plate_text:
        return None
    
    clean_text = plate_text.strip().upper()
    with _memory_lock:
        if clean_text in _known_plates:
            info = _known_plates[clean_text]
            return {
                'plate_text': clean_text,
                'owner_name': info.get('owner_name', ''),
                'vehicle_desc': info.get('vehicle_desc', ''),
                'tag': info.get('tag', 'unknown'),
                'highlight_color': info.get('highlight_color', '#64748B'),
                'alert_on_detect': info.get('alert_on_detect', False),
                'notes': info.get('notes', ''),
                'times_seen': info.get('times_seen', 1),
            }
    
    # Fallback to DB query if not in cache
    try:
        res = supabase.table('known_plates').select(
            'plate_text, owner_name, vehicle_desc, tag, highlight_color, alert_on_detect, notes, times_seen'
        ).eq('plate_text', clean_text).limit(1).execute()
        if res.data and len(res.data) > 0:
            row = res.data[0]
            return {
                'plate_text': clean_text,
                'owner_name': row.get('owner_name') or '',
                'vehicle_desc': row.get('vehicle_desc') or '',
                'tag': row.get('tag') or 'unknown',
                'highlight_color': row.get('highlight_color') or '#64748B',
                'alert_on_detect': row.get('alert_on_detect', False),
                'notes': row.get('notes') or '',
                'times_seen': row.get('times_seen', 1),
            }
    except:
        pass
    
    return {
        'plate_text': clean_text,
        'owner_name': '',
        'vehicle_desc': '',
        'tag': 'unknown',
        'highlight_color': '#64748B',
        'alert_on_detect': False,
        'notes': '',
        'times_seen': 1,
    }


def lookup_plate(crop_image):
    """
    Check if this plate crop matches any known plate in memory.
    
    Args:
        crop_image: OpenCV BGR image of the plate crop
    
    Returns:
        (plate_text, confidence, plate_info) if match found, else (None, 0.0, None)
    """
    if not IMAGEHASH_AVAILABLE:
        return None, 0.0, None
    
    # Periodic DB sync
    now = time.time()
    if now - _last_db_sync > _DB_SYNC_INTERVAL:
        threading.Thread(target=_load_from_db, daemon=True).start()
    
    new_hash = _compute_hash(crop_image)
    if new_hash is None:
        return None, 0.0, None
    
    best_match = None
    best_distance = 999
    best_info = None
    
    with _memory_lock:
        for plate_text, info in _known_plates.items():
            stored_hash = info.get('hash')
            if stored_hash is None or not hasattr(stored_hash, 'hash'):
                continue
            if stored_hash.hash.shape != new_hash.hash.shape:
                continue
            distance = new_hash - stored_hash  # Hamming distance
            if distance < best_distance:
                best_distance = distance
                best_match = plate_text
                best_info = info
    
    if best_match and best_distance <= MATCH_THRESHOLD:
        confidence = max(0.80, 1.0 - (best_distance / MATCH_THRESHOLD) * 0.2)
        plate_details = {
            'plate_text': best_match,
            'owner_name': best_info.get('owner_name', '') if best_info else '',
            'vehicle_desc': best_info.get('vehicle_desc', '') if best_info else '',
            'tag': best_info.get('tag', 'registered') if best_info else 'registered',
            'highlight_color': best_info.get('highlight_color', '#10B981') if best_info else '#10B981',
            'alert_on_detect': best_info.get('alert_on_detect', True) if best_info else True,
            'notes': best_info.get('notes', '') if best_info else '',
        }
        return best_match, confidence, plate_details
    
    return None, 0.0, None


def store_plate(crop_image, plate_text, source='auto', owner_name=None, vehicle_desc=None, tag=None, highlight_color=None, alert_on_detect=None, notes=None):
    """
    Store a plate crop and its verified text in the memory system.
    """
    if not IMAGEHASH_AVAILABLE or crop_image is None:
        return
    
    new_hash = _compute_hash(crop_image)
    hash_str = str(new_hash) if new_hash is not None else ''
    
    # Update in-memory cache
    with _memory_lock:
        if plate_text in _known_plates:
            entry = _known_plates[plate_text]
            if new_hash is not None:
                entry['hash'] = new_hash
            entry['last_seen'] = time.time()
            entry['times_seen'] = entry.get('times_seen', 0) + 1
            if owner_name is not None: entry['owner_name'] = owner_name
            if vehicle_desc is not None: entry['vehicle_desc'] = vehicle_desc
            if tag is not None: entry['tag'] = tag
            if highlight_color is not None: entry['highlight_color'] = highlight_color
            if alert_on_detect is not None: entry['alert_on_detect'] = alert_on_detect
            if notes is not None: entry['notes'] = notes
            _known_plates.move_to_end(plate_text)
        else:
            _known_plates[plate_text] = {
                'hash': new_hash,
                'owner_name': owner_name or '',
                'vehicle_desc': vehicle_desc or '',
                'tag': tag or 'registered',
                'highlight_color': highlight_color or '#10B981',
                'alert_on_detect': alert_on_detect if alert_on_detect is not None else True,
                'notes': notes or '',
                'last_seen': time.time(),
                'times_seen': 1,
            }
        
        while len(_known_plates) > _MAX_CACHE_SIZE:
            _known_plates.popitem(last=False)
    
    # Persist to Supabase in background
    def _save():
        try:
            update_data = {
                'last_seen': 'now()',
                'source': source,
            }
            if hash_str:
                update_data['image_hash'] = hash_str
            if owner_name is not None: update_data['owner_name'] = owner_name
            if vehicle_desc is not None: update_data['vehicle_desc'] = vehicle_desc
            if tag is not None: update_data['tag'] = tag
            if highlight_color is not None: update_data['highlight_color'] = highlight_color
            if alert_on_detect is not None: update_data['alert_on_detect'] = alert_on_detect
            if notes is not None: update_data['notes'] = notes

            existing = supabase.table('known_plates').select('id, times_seen').eq('plate_text', plate_text).limit(1).execute()
            if existing.data and len(existing.data) > 0:
                row = existing.data[0]
                update_data['times_seen'] = row.get('times_seen', 0) + 1
                try:
                    supabase.table('known_plates').update(update_data).eq('id', row['id']).execute()
                except:
                    # Fallback without extra columns if not migrated yet
                    supabase.table('known_plates').update({'image_hash': hash_str, 'last_seen': 'now()', 'times_seen': update_data['times_seen']}).eq('id', row['id']).execute()
            else:
                insert_data = {
                    'plate_text': plate_text,
                    'image_hash': hash_str,
                    'source': source,
                }
                if owner_name: insert_data['owner_name'] = owner_name
                if vehicle_desc: insert_data['vehicle_desc'] = vehicle_desc
                if tag: insert_data['tag'] = tag
                if highlight_color: insert_data['highlight_color'] = highlight_color
                if alert_on_detect is not None: insert_data['alert_on_detect'] = alert_on_detect
                if notes: insert_data['notes'] = notes
                try:
                    supabase.table('known_plates').insert(insert_data).execute()
                except:
                    supabase.table('known_plates').insert({'plate_text': plate_text, 'image_hash': hash_str, 'source': source}).execute()
        except Exception as e:
            print(f"[PlateMemory] DB save error: {e}")
    
    threading.Thread(target=_save, daemon=True).start()


def store_correction(plate_text, snapshot_url=None, owner_name=None, vehicle_desc=None, tag=None, highlight_color=None, alert_on_detect=None, notes=None):
    """
    Store a manual user correction or owner assignment from frontend.
    """
    crop = None
    if snapshot_url:
        try:
            import requests
            resp = requests.get(snapshot_url, timeout=10)
            if resp.status_code == 200:
                img_array = np.frombuffer(resp.content, np.uint8)
                crop = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        except Exception as e:
            print(f"[PlateMemory] Image download error: {e}")
    
    store_plate(
        crop, plate_text, source='manual_correction',
        owner_name=owner_name, vehicle_desc=vehicle_desc, tag=tag,
        highlight_color=highlight_color, alert_on_detect=alert_on_detect, notes=notes
    )
    print(f"[PlateMemory] Saved vehicle profile: {plate_text} (Owner: {owner_name or 'None'}, Tag: {tag or 'None'})")


def init():
    """Initialize the plate memory system. Call at server startup."""
    if IMAGEHASH_AVAILABLE:
        print("[PlateMemory] Initializing visual plate memory & vehicle owner directory...")
        _load_from_db()
    else:
        print("[PlateMemory] imagehash not available. Plate memory disabled.")
