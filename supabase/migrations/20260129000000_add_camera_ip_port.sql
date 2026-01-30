ALTER TABLE cameras 
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS port INTEGER,
ADD COLUMN IF NOT EXISTS camera_type TEXT; -- to store 'Dahua', 'Hikvision' etc distinct from brand if needed, but we used brand field.

-- We basically just need IP and Port for convenience
COMMENT ON COLUMN cameras.ip_address IS 'IP Address for easier reconfiguration';
COMMENT ON COLUMN cameras.port IS 'Port number for camera connection';
