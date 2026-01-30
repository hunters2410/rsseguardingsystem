-- Events Archive Table Setup
-- =============================
-- Run this SQL in your Supabase SQL Editor to create the archive table

-- Create events_archive table with same structure as events
CREATE TABLE IF NOT EXISTS events_archive (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    confidence NUMERIC(5,2),
    snapshot_url TEXT,
    metadata JSONB,
    acknowledged BOOLEAN DEFAULT false,
    ai_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for faster queries on archive
CREATE INDEX IF NOT EXISTS idx_events_archive_created_at ON events_archive(created_at);
CREATE INDEX IF NOT EXISTS idx_events_archive_archived_at ON events_archive(archived_at);
CREATE INDEX IF NOT EXISTS idx_events_archive_camera_id ON events_archive(camera_id);
CREATE INDEX IF NOT EXISTS idx_events_archive_event_type ON events_archive(event_type);

-- Enable Row Level Security (RLS)
ALTER TABLE events_archive ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read archive
CREATE POLICY "Allow authenticated users to read archive" 
ON events_archive FOR SELECT 
TO authenticated 
USING (true);

-- Create policy to allow service role to insert into archive
CREATE POLICY "Allow service role to insert archive" 
ON events_archive FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Grant permissions
GRANT ALL ON events_archive TO authenticated;
GRANT ALL ON events_archive TO service_role;

-- Optional: Create a function to automatically archive old events
CREATE OR REPLACE FUNCTION archive_old_events()
RETURNS void AS $$
BEGIN
    -- This function can be called by a scheduled job
    -- Insert old events into archive
    INSERT INTO events_archive (id, camera_id, event_type, confidence, snapshot_url, metadata, acknowledged, ai_model_id, created_at)
    SELECT id, camera_id, event_type, confidence, snapshot_url, metadata, acknowledged, ai_model_id, created_at
    FROM events
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND acknowledged = true;
    
    -- Delete archived events
    DELETE FROM events
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND acknowledged = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
