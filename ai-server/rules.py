"""
rules.py — Alert rules, schedule checking, config caching, and DB loaders.

Provides:
  - load_zones(), load_alert_rules(), get_system_settings()
  - is_within_schedule()
  - should_trigger_alert()
  - _ConfigCache + _config_refresh_thread()
"""

import time
import threading
from datetime import datetime

from config import supabase, ai_logger


# ─────────────────────────────────────────────────────────────────────────────
#  DB LOADERS
# ─────────────────────────────────────────────────────────────────────────────

def get_system_settings():
    """Fetch the first row from system_settings."""
    try:
        data = supabase.table('system_settings').select('*').limit(1).execute()
        if data.data:
            return data.data[0]
    except Exception as e:
        print(f"[Settings] Error fetching system settings: {e}")
        return {}
    return {}


def load_zones():
    """Load zones from Supabase camera_zones table, grouped by camera_id."""
    try:
        response = supabase.table('camera_zones').select('*').execute()
        zones_data = response.data

        zones_map = {}
        for zone in zones_data:
            cid = zone['camera_id']
            if cid not in zones_map:
                zones_map[cid] = []

            zones_map[cid].append({
                'type': zone['type'],
                'points': zone['points'],
                'label': zone.get('label', 'Zone'),
                'alert_enabled': zone.get('alert_enabled', True)
            })

        return zones_map
    except Exception as e:
        print(f"Error loading zones from DB: {e}")
        return {}


def load_alert_rules():
    """Load alert rules from Supabase alert_rules table."""
    try:
        response = supabase.table('alert_rules').select('*').execute()
        rules_data = response.data

        rules_map = {}
        global_rule = None

        for rule in rules_data:
            if rule['camera_id'] is None:
                global_rule = rule
            else:
                rules_map[rule['camera_id']] = rule

        if global_rule:
            ai_logger.info(
                f"[AlertRules] Global rule updated_at={global_rule.get('updated_at', '?')} | "
                f"{len(rules_map)} camera overrides loaded"
            )

        return {
            'global': global_rule,
            'cameras': rules_map
        }
    except Exception as e:
        print(f"Error loading alert rules from DB: {e}")
        return {
            'global': None,
            'cameras': {}
        }


# ─────────────────────────────────────────────────────────────────────────────
#  SCHEDULE CHECK
# ─────────────────────────────────────────────────────────────────────────────

def is_within_schedule(rule):
    """
    Returns True if the current time/day falls within the rule's active schedule.
    If schedule_enabled is False or missing, always returns True (24/7 mode).
    Supports overnight ranges e.g. 22:00 -> 06:00.
    """
    if not rule or not rule.get('schedule_enabled', False):
        return True

    now = datetime.now()
    day_map = {0: 'Mon', 1: 'Tue', 2: 'Wed', 3: 'Thu', 4: 'Fri', 5: 'Sat', 6: 'Sun'}
    today = day_map[now.weekday()]

    active_days = rule.get('schedule_days', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    if today not in active_days:
        return False

    try:
        start_str = rule.get('schedule_start', '00:00')
        end_str   = rule.get('schedule_end',   '23:59')
        sh, sm = map(int, start_str.split(':'))
        eh, em = map(int, end_str.split(':'))
    except Exception:
        return True  # Bad format — don't block

    cur   = now.hour * 60 + now.minute
    start = sh * 60 + sm
    end   = eh * 60 + em

    if start <= end:
        return start <= cur <= end
    else:
        # Overnight: e.g. 22:00 -> 06:00
        return cur >= start or cur <= end


# ─────────────────────────────────────────────────────────────────────────────
#  WHITELIST / BLACKLIST FILTER
# ─────────────────────────────────────────────────────────────────────────────

def should_trigger_alert(camera_id, object_label, alert_rules):
    """
    Determine if a detected object should trigger an alert based on the
    configured whitelist / blacklist rules for this camera (or the global rule).

    Returns:
        (allowed: bool, reason: str)
    """
    rule = alert_rules['cameras'].get(camera_id) or alert_rules['global']

    if not rule:
        return True, "no-rule (default allow)"

    mode             = rule.get('mode', 'whitelist')
    label_lower      = object_label.lower()
    enabled_objects  = [str(o).lower() for o in rule.get('enabled_objects',  [])]
    disabled_objects = [str(o).lower() for o in rule.get('disabled_objects', [])]

    if mode == 'whitelist':
        if not enabled_objects:
            return False, "whitelist is empty — no objects selected"
        allowed = label_lower in enabled_objects
        reason  = f"whitelist {'PASS' if allowed else 'BLOCK'}: '{label_lower}' {'in' if allowed else 'not in'} {enabled_objects}"
        return allowed, reason
    else:  # blacklist
        allowed = label_lower not in disabled_objects
        reason  = f"blacklist {'PASS' if allowed else 'BLOCK'}: '{label_lower}' {'not in' if allowed else 'in'} {disabled_objects}"
        return allowed, reason


# ─────────────────────────────────────────────────────────────────────────────
#  SHARED CONFIG CACHE
#  A single background thread refreshes settings / zones / alert-rules every 5 s.
#  Per-stream inference threads read from this cache instead of hitting Supabase
#  directly, reducing DB load from O(cameras × 3) queries / 5 s  →  3 queries / 5 s.
# ─────────────────────────────────────────────────────────────────────────────

_config_lock = threading.Lock()


class _ConfigCache:
    """Holds the latest snapshot of system settings, camera zones, and alert rules."""
    def __init__(self):
        self.settings:      dict = {}
        self.zones_map:     dict = {}
        self.alert_rules:   dict = {'global': None, 'cameras': {}}
        self.force_refresh: bool = False  # Set True by commands to skip next 5s sleep


config_cache = _ConfigCache()


def get_config_lock():
    """Return the config lock for external callers."""
    return _config_lock


def _config_refresh_thread():
    """Background daemon: keeps config_cache fresh with one set of DB queries every 5 s.
    Supports early wakeup via config_cache.force_refresh = True."""
    # Populate immediately so process_stream threads don't start with empty config.
    try:
        with _config_lock:
            config_cache.settings    = get_system_settings()
            config_cache.zones_map   = load_zones()
            config_cache.alert_rules = load_alert_rules()
    except Exception as _e:
        ai_logger.warning(f"[ConfigCache] Initial load error: {_e}")

    while True:
        # Wait up to 5 s but wake immediately if force_refresh is requested
        for _ in range(50):   # 50 × 0.1s = 5 s
            time.sleep(0.1)
            with _config_lock:
                if config_cache.force_refresh:
                    config_cache.force_refresh = False
                    ai_logger.info("[ConfigCache] Force-refresh triggered — reloading immediately")
                    break
        try:
            s = get_system_settings()
            z = load_zones()
            r = load_alert_rules()
            with _config_lock:
                config_cache.settings    = s
                config_cache.zones_map   = z
                config_cache.alert_rules = r
        except Exception as _e:
            ai_logger.warning(f"[ConfigCache] Refresh error: {_e}")
