"""
clothing.py — Clothing color analysis, dress code config parsing, and CLIP classification.

Used by the dress_code detector to analyze HSV colors in person bounding boxes.
"""

import re
import json

import cv2
import numpy as np


# ─────────────────────────────────────────────────────────────────────────────
#  HSV COLOR RANGE DEFINITIONS
#  OpenCV HSV: H 0-180, S 0-255, V 0-255
#  Each entry: list of (h_min, h_max, s_min, v_min, v_max)
# ─────────────────────────────────────────────────────────────────────────────

_COLOR_DEFS = {
    'red':    [(0, 10, 80, 60, 255), (160, 180, 80, 60, 255)],
    'orange': [(10, 25, 120, 80, 255)],
    'yellow': [(25, 35, 120, 100, 255)],
    'green':  [(35, 85, 60, 40, 255)],
    'blue':   [(85, 130, 60, 40, 255)],
    'navy':   [(100, 130, 80, 20, 80)],
    'purple': [(130, 160, 60, 40, 255)],
    'white':  [(0, 180, 0, 180, 255)],
    'gray':   [(0, 180, 0, 55, 175)],
    'black':  [(0, 180, 0, 0, 55)],
    'brown':  [(10, 25, 60, 30, 130)],
    'khaki':  [(18, 30, 40, 130, 220)],
    'pink':   [(150, 175, 60, 140, 255)],
}


def analyze_clothing_colors(crop_bgr, region='top', coverage_threshold=0.15):
    """
    Analyze the dominant clothing colors in a person bounding-box crop.

    Args:
        crop_bgr           : BGR image of the person crop
        region             : 'top' (upper torso), 'bottom' (lower body), 'full' (whole)
        coverage_threshold : minimum fraction of pixels for a color to be reported

    Returns:
        list[str]  : color names detected, sorted by coverage (most dominant first)
        dict[str, float]: color -> coverage fraction (0-1)
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return [], {}
    h, w = crop_bgr.shape[:2]
    if h < 20 or w < 10:
        return [], {}

    # Slice region of interest — avoid head/feet
    if region == 'top':
        roi = crop_bgr[int(h * 0.15): int(h * 0.50), int(w * 0.1): int(w * 0.9)]
    elif region == 'bottom':
        roi = crop_bgr[int(h * 0.50): int(h * 0.90), int(w * 0.1): int(w * 0.9)]
    else:  # full
        roi = crop_bgr[int(h * 0.10): int(h * 0.90), int(w * 0.05): int(w * 0.95)]

    if roi.size == 0:
        return [], {}

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    total_pixels = hsv.shape[0] * hsv.shape[1]
    if total_pixels == 0:
        return [], {}

    coverage = {}
    for color_name, ranges in _COLOR_DEFS.items():
        mask = np.zeros((hsv.shape[0], hsv.shape[1]), dtype=np.uint8)
        for h_min, h_max, s_min, v_min, v_max in ranges:
            lower = np.array([h_min, s_min, v_min])
            upper = np.array([h_max, 255,   v_max])
            mask |= cv2.inRange(hsv, lower, upper)
        coverage[color_name] = cv2.countNonZero(mask) / total_pixels

    # Sort by coverage; filter below threshold
    sorted_colors = sorted(coverage.items(), key=lambda x: x[1], reverse=True)
    detected = [c for c, v in sorted_colors if v >= coverage_threshold]

    # Always return at least the dominant color so callers have something
    if not detected and sorted_colors:
        detected = [sorted_colors[0][0]]

    return detected, coverage


def parse_dress_code_config(description):
    """
    Parse dress code configuration from the AI model description field.

    Supported JSON format (embed anywhere in the description):
      dress_code:{"required":["blue","white"],"prohibited":["red"],
                  "check":"top","alert_on":"violation",
                  "coverage":0.15,"cooldown":90}

    Returns: dict with all fields defaulted.
    """
    cfg = {
        'required':   [],
        'prohibited': [],
        'check':      'top',
        'alert_on':   'violation',
        'coverage':   0.15,
        'cooldown':   90,
    }
    if not description:
        return cfg
    m = re.search(r'dress_code\s*:\s*(\{.*?\})', description, re.DOTALL | re.IGNORECASE)
    if m:
        try:
            cfg.update(json.loads(m.group(1)))
        except Exception:
            pass
    return cfg


# ─────────────────────────────────────────────────────────────────────────────
#  Optional CLIP upgrade — gracefully disabled if not installed
# ─────────────────────────────────────────────────────────────────────────────
try:
    import clip as _clip
    import torch as _torch
    _clip_model, _clip_preprocess = _clip.load('ViT-B/32', device='cpu')
    _CLIP_AVAILABLE = True
    print('[DressCode] CLIP loaded — zero-shot clothing classification enabled')
except Exception:
    _CLIP_AVAILABLE = False


def classify_with_clip(crop_bgr, prompts):
    """
    Use CLIP to classify a person crop against a list of text prompts.
    Returns (best_prompt, confidence_0_1) or (None, 0) if CLIP not available.
    """
    if not _CLIP_AVAILABLE or crop_bgr is None or crop_bgr.size == 0:
        return None, 0.0
    try:
        from PIL import Image as _Image
        import torch as _torch
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        pil_img = _Image.fromarray(rgb)
        img_tensor = _clip_preprocess(pil_img).unsqueeze(0)
        text_tokens = _clip.tokenize(prompts)
        with _torch.no_grad():
            logits, _ = _clip_model(img_tensor, text_tokens)
            probs = logits.softmax(dim=-1)[0].tolist()
        best_idx = probs.index(max(probs))
        return prompts[best_idx], probs[best_idx]
    except Exception as e:
        print(f'[CLIP] Error: {e}')
        return None, 0.0
