# Event Cleanup System - Setup Guide

## Overview
Automated system to prevent database bloat by cleaning up old events based on configurable retention policies.

## Features
- ✅ Configurable retention periods per event type
- ✅ Different policies for acknowledged vs unacknowledged events
- ✅ Automatic archiving before deletion
- ✅ Safety limits to prevent accidental mass deletion
- ✅ Dry-run mode for testing
- ✅ Detailed logging and statistics

## Setup Instructions

### 1. Create Archive Table in Supabase

1. Go to your **Supabase Dashboard** → **SQL Editor**
2. Copy and run the SQL from `sql/create_events_archive.sql`
3. This creates the `events_archive` table with proper indexes and security policies

### 2. Install Python Dependencies

```bash
pip install supabase python-dotenv
```

### 3. Test the Cleanup Script

**Dry Run (safe - shows what would be deleted):**
```bash
python cleanup_events.py --dry-run --verbose
```

**Live Run (actually deletes):**
```bash
python cleanup_events.py --verbose
```

**Without Archiving (delete directly):**
```bash
python cleanup_events.py --no-archive --verbose
```

## Configuration

Edit `cleanup_events.py` to customize retention policies:

```python
RETENTION_CONFIG = {
    # Default retention
    "default_retention_days": 30,
    
    # Per event type
    "event_retention": {
        "intrusion_detection": 180,  # 6 months
        "weapon_detection": 180,
        "fire_detection": 180,
        "person_detection": 30,
        "vehicle_detection": 30,
        "motion_detection": 7,  # 1 week
    },
    
    # Acknowledged vs unacknowledged
    "acknowledged_retention_days": 30,
    "unacknowledged_retention_days": 90,  # Keep longer
    
    # Safety
    "max_delete_per_run": 10000,
    "min_events_to_keep": 100  # Always keep at least 100
}
```

## Scheduling (Automated Runs)

### Option 1: Windows Task Scheduler

1. Open **Task Scheduler**
2. Create Basic Task
3. **Trigger**: Daily at 2:00 AM
4. **Action**: Start a program
   - Program: `python`
   - Arguments: `"C:\path\to\cleanup_events.py" --verbose`
   - Start in: `C:\path\to\realstarsecurityeguarding`

### Option 2: Add to package.json

Add to your `package.json`:

```json
{
  "scripts": {
    "cleanup:dry": "python cleanup_events.py --dry-run --verbose",
    "cleanup:run": "python cleanup_events.py --verbose",
    "cleanup:schedule": "node -e \"setInterval(() => require('child_process').exec('python cleanup_events.py'), 86400000)\""
  }
}
```

Then run:
```bash
npm run cleanup:dry  # Test first
npm run cleanup:run  # Actual cleanup
```

### Option 3: Node.js Cron Job

Create `scripts/schedule-cleanup.js`:

```javascript
const cron = require('node-cron');
const { exec } = require('child_process');

// Run daily at 2 AM
cron.schedule('0 2 * * *', () => {
  console.log('Running event cleanup...');
  exec('python cleanup_events.py --verbose', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      return;
    }
    console.log(stdout);
  });
});

console.log('Event cleanup scheduler started');
```

Install node-cron: `npm install node-cron`
Run: `node scripts/schedule-cleanup.js`

## Monitoring

The script logs all operations. Check:
- Total events processed
- Number archived
- Number deleted
- Errors (if any)

Example output:
```
============================================================
Event Cleanup Started - 2026-01-30 15:18:00
Mode: LIVE
Archive: Enabled
============================================================
Total events in database: 5000
Found 1500 events to cleanup
Archiving 1500 events...
Archived 1500 events
Deleting 1500 events...
Deleted 1500 events
============================================================
Cleanup Summary:
  Total events in DB: 5000
  Events archived: 1500
  Events deleted: 1500
  Errors: 0
  Remaining events: 3500
============================================================
```

## Viewing Archived Events

Query the archive table in Supabase SQL Editor:

```sql
-- View archived events
SELECT * FROM events_archive 
ORDER BY archived_at DESC 
LIMIT 100;

-- Count archived events by type
SELECT event_type, COUNT(*) 
FROM events_archive 
GROUP BY event_type;

-- Find specific archived event
SELECT * FROM events_archive 
WHERE camera_id = 'your-camera-id'
AND created_at > '2026-01-01';
```

## Best Practices

1. **Always test with --dry-run first**
2. **Monitor disk space** - archive table can grow large
3. **Periodically clean archive** - delete very old archived events
4. **Review retention policies** monthly based on your needs
5. **Check logs** after each run to ensure proper operation

## Troubleshooting

**"Missing Supabase credentials"**
- Ensure `.env` file has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

**"Archive table doesn't exist"**
- Run the SQL from `sql/create_events_archive.sql` in Supabase

**"Permission denied"**
- Check Supabase RLS policies allow your user to insert into archive table

**Too many events deleted**
- Lower `max_delete_per_run` in configuration
- Increase retention days for specific event types

## Next Steps

1. ✅ Run archive table creation SQL
2. ✅ Test with `--dry-run`
3. ✅ Adjust retention policies if needed
4. ✅ Set up automated scheduling
5. ✅ Monitor first few runs
