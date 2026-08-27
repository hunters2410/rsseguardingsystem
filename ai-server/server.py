"""
server.py — AI server identity and registration.

Manages the device_id.txt file and registers this machine as an AI server
in the Supabase database on startup.
"""

import os
import uuid
import socket

from config import supabase


# ── Machine Identity ──────────────────────────────────────────────────────────
DEVICE_ID_FILE = "device_id.txt"
if os.path.exists(DEVICE_ID_FILE):
    with open(DEVICE_ID_FILE, 'r') as f:
        SERVER_UUID = f.read().strip()
else:
    SERVER_UUID = str(uuid.uuid4())
    with open(DEVICE_ID_FILE, 'w') as f:
        f.write(SERVER_UUID)


def register_server():
    """Registers this local computer as an AI Server in the database."""
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)

    print(f"Registering local server: {hostname} ({SERVER_UUID})")

    data = {
        "id": SERVER_UUID,
        "name": f"{hostname} (Local)",
        "ip_address": ip_address,
        "port": 8888,
        "status": "online",
        "gpu_model": "Integrated/CPU",
        "cpu_cores": os.cpu_count(),
        "memory_gb": 8
    }

    try:
        supabase.table('ai_servers').upsert(data).execute()
        print("Server registered successfully!")
        return SERVER_UUID
    except Exception as e:
        print(f"Registration failed: {e}")
        return SERVER_UUID
