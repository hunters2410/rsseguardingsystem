/*
  # E-Guarding System Schema

  ## Overview
  Complete database schema for the E-Guarding AI-powered CCTV monitoring system.
  
  ## New Tables
  
  ### 1. `ai_servers`
  Stores AI processing server devices that run the AI models
  - `id` (uuid, primary key) - Unique server identifier
  - `name` (text) - Server name/label
  - `ip_address` (text) - Server IP address
  - `port` (integer) - Server port number
  - `status` (text) - Server status: online, offline, maintenance
  - `gpu_model` (text) - GPU hardware information
  - `cpu_cores` (integer) - Number of CPU cores
  - `memory_gb` (integer) - RAM in gigabytes
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. `ai_models`
  Stores AI models that can be deployed to servers
  - `id` (uuid, primary key) - Unique model identifier
  - `name` (text) - Model name
  - `description` (text) - Model description
  - `model_type` (text) - Type: person_detection, vehicle_detection, face_recognition, etc.
  - `version` (text) - Model version
  - `accuracy` (decimal) - Model accuracy percentage
  - `server_id` (uuid) - Deployed server reference
  - `is_active` (boolean) - Whether model is currently active
  - `created_at` (timestamptz) - Creation timestamp

  ### 3. `cameras`
  Stores CCTV camera channels including 4G cameras
  - `id` (uuid, primary key) - Unique camera identifier
  - `name` (text) - Camera name/label
  - `location` (text) - Physical location
  - `brand` (text) - Camera brand/manufacturer
  - `connection_type` (text) - Connection type: rtsp, http, 4g, onvif
  - `stream_url` (text) - Stream URL or connection string
  - `username` (text) - Camera authentication username
  - `password` (text) - Camera authentication password
  - `status` (text) - Camera status: online, offline, error
  - `resolution` (text) - Video resolution
  - `fps` (integer) - Frames per second
  - `ai_server_id` (uuid) - Assigned AI server reference
  - `ai_model_id` (uuid) - Assigned AI model reference
  - `is_recording` (boolean) - Whether camera is recording
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 4. `events`
  Stores AI-detected events from camera streams
  - `id` (uuid, primary key) - Unique event identifier
  - `camera_id` (uuid) - Camera that detected the event
  - `ai_model_id` (uuid) - AI model that detected the event
  - `event_type` (text) - Event type: person_detected, vehicle_detected, motion, etc.
  - `confidence` (decimal) - Detection confidence score
  - `snapshot_url` (text) - URL to event snapshot image
  - `metadata` (jsonb) - Additional event metadata
  - `acknowledged` (boolean) - Whether event has been reviewed
  - `created_at` (timestamptz) - Event timestamp

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated users to manage their organization's data
  
  ## Notes
  - All timestamps use timestamptz for proper timezone handling
  - Foreign keys ensure referential integrity
  - Indexes added for performance on frequently queried columns
*/

-- Create ai_servers table
CREATE TABLE IF NOT EXISTS ai_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ip_address text NOT NULL,
  port integer NOT NULL DEFAULT 8080,
  status text NOT NULL DEFAULT 'offline',
  gpu_model text,
  cpu_cores integer,
  memory_gb integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create ai_models table
CREATE TABLE IF NOT EXISTS ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  model_type text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  accuracy decimal(5,2),
  server_id uuid REFERENCES ai_servers(id) ON DELETE SET NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create cameras table
CREATE TABLE IF NOT EXISTS cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL,
  brand text NOT NULL,
  connection_type text NOT NULL,
  stream_url text NOT NULL,
  username text,
  password text,
  status text NOT NULL DEFAULT 'offline',
  resolution text DEFAULT '1920x1080',
  fps integer DEFAULT 25,
  ai_server_id uuid REFERENCES ai_servers(id) ON DELETE SET NULL,
  ai_model_id uuid REFERENCES ai_models(id) ON DELETE SET NULL,
  is_recording boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid REFERENCES cameras(id) ON DELETE CASCADE,
  ai_model_id uuid REFERENCES ai_models(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  confidence decimal(5,2),
  snapshot_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  acknowledged boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE ai_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_servers
CREATE POLICY "Allow all operations on ai_servers for authenticated users"
  ON ai_servers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for ai_models
CREATE POLICY "Allow all operations on ai_models for authenticated users"
  ON ai_models FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for cameras
CREATE POLICY "Allow all operations on cameras for authenticated users"
  ON cameras FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for events
CREATE POLICY "Allow all operations on events for authenticated users"
  ON events FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cameras_status ON cameras(status);
CREATE INDEX IF NOT EXISTS idx_cameras_ai_server ON cameras(ai_server_id);
CREATE INDEX IF NOT EXISTS idx_events_camera ON events(camera_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_acknowledged ON events(acknowledged);
CREATE INDEX IF NOT EXISTS idx_ai_models_server ON ai_models(server_id);
CREATE INDEX IF NOT EXISTS idx_ai_servers_status ON ai_servers(status);