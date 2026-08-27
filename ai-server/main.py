"""
main.py — AI Surveillance Engine entry point.

This is the slim entry point that:
  1. Registers this machine as an AI server
  2. Starts the config cache refresher thread
  3. Starts the system command processor thread
  4. Starts the training job runner thread
  5. Runs the assignment monitor loop (blocking)

All business logic lives in the surrounding modules:
  config.py, rules.py, server.py, commands.py, training.py,
  monitor.py, process_stream.py, and detectors/*.
"""

import threading
from datetime import datetime

from config import ai_logger
from server import register_server
from rules import _config_refresh_thread
from commands import process_system_commands
from training import run_training_jobs
from monitor import monitor_assignments


if __name__ == "__main__":
    with open("ai_log.txt", "a") as log:
        log.write(f"[{datetime.now()}] AI Surveillance Engine Starting...\n")

    sid = register_server()

    with open("ai_log.txt", "a") as log:
        log.write(f"[{datetime.now()}] sid: {sid}\n")

    # Start Config Cache Refresher
    # Single background thread replacing per-stream DB polling (3 queries / 5 s total)
    cfg_thread = threading.Thread(target=_config_refresh_thread, daemon=True)
    cfg_thread.start()

    # Start Command Processor
    cmd_thread = threading.Thread(target=process_system_commands, daemon=True)
    cmd_thread.start()

    # Start Training Job Runner
    train_thread = threading.Thread(target=run_training_jobs, daemon=True, name='TrainingRunner')
    train_thread.start()
    ai_logger.info('[Main] Training job runner started')

    monitor_assignments(sid)
