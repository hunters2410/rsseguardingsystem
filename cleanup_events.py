"""
Event Cleanup and Archival Script
==================================
Automatically cleans up old events from the database based on retention policies.
Optionally archives events before deletion for compliance.

Usage:
    python cleanup_events.py [--dry-run] [--archive] [--verbose]
    
Arguments:
    --dry-run: Show what would be deleted without actually deleting
    --archive: Archive events to a separate table before deletion
    --verbose: Show detailed logging
"""

import os
import argparse
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()

# Configuration
RETENTION_CONFIG = {
    # Days to keep events (0 = keep forever)
    "default_retention_days": 30,
    
    # Event-specific retention (overrides default)
    "event_retention": {
        "intrusion_detection": 180,  # Critical events - keep 6 months
        "weapon_detection": 180,
        "fire_detection": 180,
        "person_detection": 30,
        "vehicle_detection": 30,
        "motion_detection": 7,  # Short retention for motion
        "other": 30
    },
    
    # Acknowledged vs unacknowledged
    "acknowledged_retention_days": 30,  # Acknowledged events
    "unacknowledged_retention_days": 90,  # Unacknowledged kept longer
    
    # Archive settings
    "archive_before_delete": True,
    "archive_table": "events_archive",
    
    # Safety limits
    "max_delete_per_run": 10000,  # Prevent accidental mass deletion
    "min_events_to_keep": 100  # Always keep at least this many recent events
}

class EventCleanup:
    def __init__(self, dry_run=False, archive=True, verbose=False):
        self.dry_run = dry_run
        self.archive = archive and RETENTION_CONFIG["archive_before_delete"]
        self.verbose = verbose
        
        # Initialize Supabase client
        url = os.getenv("VITE_SUPABASE_URL")
        key = os.getenv("VITE_SUPABASE_ANON_KEY")
        
        if not url or not key:
            raise ValueError("Missing Supabase credentials in .env file")
        
        self.supabase: Client = create_client(url, key)
        self.stats = {
            "total_events": 0,
            "archived": 0,
            "deleted": 0,
            "errors": 0
        }
    
    def log(self, message, force=False):
        """Log message if verbose or forced"""
        if self.verbose or force:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}")
    
    def get_retention_date(self, event_type, acknowledged):
        """Calculate retention cutoff date for an event"""
        # Check event-specific retention
        if event_type in RETENTION_CONFIG["event_retention"]:
            days = RETENTION_CONFIG["event_retention"][event_type]
        else:
            # Use acknowledged/unacknowledged policy
            if acknowledged:
                days = RETENTION_CONFIG["acknowledged_retention_days"]
            else:
                days = RETENTION_CONFIG["unacknowledged_retention_days"]
        
        if days == 0:
            return None  # Keep forever
        
        return datetime.now() - timedelta(days=days)
    
    def ensure_archive_table(self):
        """Ensure archive table exists (should be created in Supabase)"""
        # Note: This assumes the archive table is already created in Supabase
        # You should create it manually with the same schema as events table
        self.log("Archive table should exist in Supabase (events_archive)")
    
    def get_events_to_cleanup(self):
        """Get list of events that should be deleted"""
        self.log("Fetching events to cleanup...")
        
        # Get total event count first
        total_response = self.supabase.table('events').select('id', count='exact').execute()
        self.stats["total_events"] = total_response.count or 0
        
        self.log(f"Total events in database: {self.stats['total_events']}")
        
        # Safety check: ensure we keep minimum events
        if self.stats["total_events"] <= RETENTION_CONFIG["min_events_to_keep"]:
            self.log(f"Total events ({self.stats['total_events']}) is below minimum to keep ({RETENTION_CONFIG['min_events_to_keep']}). Skipping cleanup.", force=True)
            return []
        
        # Fetch all events to process
        response = self.supabase.table('events')\
            .select('id, event_type, acknowledged, created_at')\
            .order('created_at', desc=False)\
            .execute()
        
        events = response.data
        events_to_delete = []
        
        for event in events:
            cutoff_date = self.get_retention_date(
                event.get('event_type', 'other'),
                event.get('acknowledged', False)
            )
            
            if cutoff_date is None:
                continue  # Keep forever
            
            event_date = datetime.fromisoformat(event['created_at'].replace('Z', '+00:00'))
            
            if event_date < cutoff_date:
                events_to_delete.append(event)
        
        # Apply max deletion limit
        if len(events_to_delete) > RETENTION_CONFIG["max_delete_per_run"]:
            self.log(f"Limiting cleanup to {RETENTION_CONFIG['max_delete_per_run']} events (found {len(events_to_delete)} eligible)", force=True)
            events_to_delete = events_to_delete[:RETENTION_CONFIG["max_delete_per_run"]]
        
        # Ensure we're not deleting too many (keep minimum)
        max_can_delete = self.stats["total_events"] - RETENTION_CONFIG["min_events_to_keep"]
        if len(events_to_delete) > max_can_delete:
            self.log(f"Reducing deletion count to maintain minimum events", force=True)
            events_to_delete = events_to_delete[:max_can_delete]
        
        return events_to_delete
    
    def archive_events(self, events):
        """Archive events to archive table"""
        if not events:
            return
        
        self.log(f"Archiving {len(events)} events...")
        
        if self.dry_run:
            self.log(f"[DRY RUN] Would archive {len(events)} events", force=True)
            self.stats["archived"] = len(events)
            return
        
        # Fetch full event data
        event_ids = [e['id'] for e in events]
        full_events = self.supabase.table('events')\
            .select('*')\
            .in_('id', event_ids)\
            .execute()
        
        # Add archive timestamp
        archived_events = []
        for event in full_events.data:
            event['archived_at'] = datetime.now().isoformat()
            archived_events.append(event)
        
        # Insert into archive table in batches
        batch_size = 100
        for i in range(0, len(archived_events), batch_size):
            batch = archived_events[i:i + batch_size]
            try:
                self.supabase.table(RETENTION_CONFIG["archive_table"]).insert(batch).execute()
                self.stats["archived"] += len(batch)
            except Exception as e:
                self.log(f"Error archiving batch: {e}", force=True)
                self.stats["errors"] += len(batch)
        
        self.log(f"Archived {self.stats['archived']} events")
    
    def delete_events(self, events):
        """Delete events from main table"""
        if not events:
            return
        
        self.log(f"Deleting {len(events)} events...")
        
        if self.dry_run:
            self.log(f"[DRY RUN] Would delete {len(events)} events", force=True)
            self.stats["deleted"] = len(events)
            return
        
        event_ids = [e['id'] for e in events]
        
        # Delete in batches
        batch_size = 100
        for i in range(0, len(event_ids), batch_size):
            batch_ids = event_ids[i:i + batch_size]
            try:
                # FIRST: Extract storage paths to delete from storage as well
                batch_full_data = self.supabase.table('events').select('snapshot_url').in_('id', batch_ids).execute()
                storage_paths = []
                for row in batch_full_data.data:
                    url = row.get('snapshot_url')
                    if url and 'event-snapshots/' in url:
                        # Extract relative path from URL (anything after bucket name)
                        path = url.split('event-snapshots/')[-1]
                        storage_paths.append(path)
                
                # SECOND: Delete from Database
                self.supabase.table('events').delete().in_('id', batch_ids).execute()
                self.stats["deleted"] += len(batch_ids)
                
                # THIRD: Delete from Storage
                if storage_paths:
                    try:
                        self.supabase.storage.from_("event-snapshots").remove(storage_paths)
                        self.log(f"  Successfully removed {len(storage_paths)} files from storage")
                    except Exception as storage_err:
                        self.log(f"  Warning: Database records deleted, but storage cleanup failed for {len(storage_paths)} files: {storage_err}", force=True)
            except Exception as e:
                self.log(f"Error deleting batch: {e}", force=True)
                self.stats["errors"] += len(batch_ids)
        
        self.log(f"Deleted {self.stats['deleted']} events")
    
    def run(self):
        """Run the cleanup process"""
        self.log("=" * 60, force=True)
        self.log(f"Event Cleanup Started - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", force=True)
        self.log(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE'}", force=True)
        self.log(f"Archive: {'Enabled' if self.archive else 'Disabled'}", force=True)
        self.log("=" * 60, force=True)
        
        # Get events to cleanup
        events_to_cleanup = self.get_events_to_cleanup()
        
        if not events_to_cleanup:
            self.log("No events to cleanup", force=True)
            return
        
        self.log(f"Found {len(events_to_cleanup)} events to cleanup", force=True)
        
        # Archive if enabled
        if self.archive:
            self.archive_events(events_to_cleanup)
        
        # Delete events
        self.delete_events(events_to_cleanup)
        
        # Print summary
        self.log("=" * 60, force=True)
        self.log("Cleanup Summary:", force=True)
        self.log(f"  Total events in DB: {self.stats['total_events']}", force=True)
        self.log(f"  Events archived: {self.stats['archived']}", force=True)
        self.log(f"  Events deleted: {self.stats['deleted']}", force=True)
        self.log(f"  Errors: {self.stats['errors']}", force=True)
        self.log(f"  Remaining events: {self.stats['total_events'] - self.stats['deleted']}", force=True)
        self.log("=" * 60, force=True)

def main():
    parser = argparse.ArgumentParser(description='Clean up old events from database')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be deleted without deleting')
    parser.add_argument('--no-archive', action='store_true', help='Skip archiving (delete directly)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose logging')
    
    args = parser.parse_args()
    
    cleanup = EventCleanup(
        dry_run=args.dry_run,
        archive=not args.no_archive,
        verbose=args.verbose
    )
    
    try:
        cleanup.run()
    except Exception as e:
        print(f"ERROR: {e}")
        raise

if __name__ == "__main__":
    main()
