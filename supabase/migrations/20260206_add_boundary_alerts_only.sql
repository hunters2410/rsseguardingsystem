
-- Add boundary_alerts_only column to system_settings table
ALTER TABLE system_settings 
ADD COLUMN boundary_alerts_only BOOLEAN DEFAULT FALSE;
