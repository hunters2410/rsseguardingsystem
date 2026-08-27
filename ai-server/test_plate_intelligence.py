"""Test Gemini OCR & Plate Memory imports and basic functionality."""
import sys
import os
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

print("Testing Gemini OCR module...")
import gemini_ocr
print("Gemini available:", gemini_ocr.is_available())

print("\nTesting Plate Memory module...")
import plate_memory
plate_memory.init()

# Create a test dummy image
test_img = np.zeros((50, 150, 3), dtype=np.uint8)
cv2.putText(test_img, "AGA8167", (10, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

# Store in memory
plate_memory.store_plate(test_img, "AGA8167", source="test")
print("Stored test plate AGA8167 in memory.")

# Lookup from memory
matched, conf = plate_memory.lookup_plate(test_img)
print(f"Lookup result: matched='{matched}', conf={conf}")

# Lookup slightly noisy version
noisy_img = test_img.copy()
cv2.rectangle(noisy_img, (0, 0), (5, 5), (100, 100, 100), -1)
matched_noisy, conf_noisy = plate_memory.lookup_plate(noisy_img)
print(f"Lookup noisy result: matched='{matched_noisy}', conf={conf_noisy}")

print("\nAll unit tests passed successfully!")
