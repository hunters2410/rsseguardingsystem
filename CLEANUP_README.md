# Quick Start - Event Cleanup

## What This Does
Automatically deletes old events from your database to prevent it from growing too large.

## Retention Policies (Configurable)

| Event Type | Retention Period |
|------------|------------------|
| Critical (intrusion, weapon, fire) | 180 days (6 months) |
| Regular (person, vehicle) | 30 days |
| Motion detection | 7 days |
| Acknowledged events | 30 days |
| Unacknowledged events | 90 days |

## Setup (3 Steps)

### 1. Create Archive Table
- Go to **Supabase Dashboard** → **SQL Editor**
- Run the SQL from `sql/create_events_archive.sql`

### 2. Test It
```bash
# See what would be deleted (safe)
python cleanup_events.py --dry-run --verbose
```

### 3. Run It
```bash
# Actually clean up events
python cleanup_events.py --verbose
```

## Automation

Add to Windows Task Scheduler:
- **Run**: Daily at 2 AM
- **Program**: `python`
- **Arguments**: `cleanup_events.py --verbose`
- **Start in**: Your project folder

## Features
✅ Archives events before deletion  
✅ Configurable retention per event type  
✅ Safety limits (keeps minimum 100 events)  
✅ Dry-run mode for testing  
✅ Detailed logging  

## Need Help?
See full documentation: `docs/EVENT_CLEANUP_GUIDE.md`
