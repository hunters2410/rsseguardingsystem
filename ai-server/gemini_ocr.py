"""
gemini_ocr.py — Google Gemini Vision client using the official google-genai Interactions API.

Uses Gemini 3.7 Flash multimodal model to read plate text from crop images with human-level accuracy.
Falls back gracefully if API key is not configured or network error occurs.
"""

import os
import base64
import time
import threading
import cv2
import re
from dotenv import load_dotenv

load_dotenv()

# Gemini client
_client = None
_init_lock = threading.Lock()
_last_request_time = 0.0
_MIN_REQUEST_INTERVAL = 2.0  # Safe rate limit for free tier

# Prompt engineered specifically for Zimbabwe plates
PLATE_PROMPT = (
    "You are an expert license plate reader. Look at this license plate image carefully. "
    "Read the exact characters on the plate. "
    "Zimbabwe license plates have EXACTLY 3 uppercase letters (A-Z) followed by 4 digits (0-9), "
    "for example: AGA8167, AGV2063, or AGC6689. "
    "Return ONLY the 7-character plate text (3 letters + 4 digits) in uppercase without spaces, punctuation, or any extra text. "
    "If unreadable, return 'UNREADABLE'."
)


def _init_gemini():
    """Lazy-initialize the google-genai Client."""
    global _client
    with _init_lock:
        if _client is not None:
            return True
        
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            print("[Gemini OCR] No GEMINI_API_KEY found in environment. Gemini OCR disabled.")
            return False
        
        try:
            from google import genai
            _client = genai.Client(api_key=api_key)
            print("[Gemini OCR] Google GenAI Client ready (model: gemini-3.7-flash)")
            return True
        except Exception as e:
            print(f"[Gemini OCR] Failed to initialize: {e}")
            _client = None
            return False


def read_plate_gemini(crop_image, scale=2):
    """
    Use Gemini 3.7 Flash to read the plate text from a crop image.
    
    Args:
        crop_image: OpenCV BGR image (numpy array) of the plate crop
        scale: Upscale factor for better readability (default 2x)
    
    Returns:
        (plate_text, confidence) tuple. confidence is 0.98 for valid Gemini reads.
        Returns ("", 0.0) if Gemini is unavailable or can't read the plate.
    """
    global _last_request_time
    
    if _client is None and not _init_gemini():
        return "", 0.0
    
    if _client is None:
        return "", 0.0
    
    # Rate limiting: wait if needed
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < _MIN_REQUEST_INTERVAL:
        time.sleep(_MIN_REQUEST_INTERVAL - elapsed)
    
    try:
        h, w = crop_image.shape[:2]
        if scale > 1:
            upscaled = cv2.resize(crop_image, (w * scale, h * scale), interpolation=cv2.INTER_LANCZOS4)
        else:
            upscaled = crop_image
        
        # Encode as JPEG base64
        ret, buffer = cv2.imencode('.jpg', upscaled, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if not ret:
            return "", 0.0
        
        b64_str = base64.b64encode(buffer).decode('utf-8')
        
        _last_request_time = time.time()
        
        # Try gemini-3.6-flash first, then gemini-3.5-flash
        interaction = None
        for model_name in ["gemini-3.6-flash", "gemini-3.5-flash"]:
            try:
                interaction = _client.interactions.create(
                    model=model_name,
                    input=[
                        {"type": "text", "text": PLATE_PROMPT},
                        {"type": "image", "data": b64_str, "mime_type": "image/jpeg"}
                    ]
                )
                if interaction and hasattr(interaction, 'output_text') and interaction.output_text:
                    break
            except Exception as e_sub:
                if 'quota' in str(e_sub).lower() or '429' in str(e_sub):
                    continue
                raise e_sub
        
        if interaction and hasattr(interaction, 'output_text') and interaction.output_text:
            raw = interaction.output_text.strip().upper()
            cleaned = re.sub(r'[^A-Z0-9]', '', raw)
            
            if cleaned == "UNREADABLE" or len(cleaned) < 4:
                return "", 0.0
            
            return cleaned, 0.98
        
        return "", 0.0
        
    except Exception as e:
        print(f"[Gemini OCR] Exception details: {type(e).__name__} -> {e}")
        return "", 0.0


def is_available():
    """Check if Gemini OCR is configured and available."""
    if _client is not None:
        return True
    return _init_gemini()
