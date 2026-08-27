import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables. Using placeholder values to prevent crash.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Camera = {
  id: string;
  name: string;
  location: string;
  brand: string;
  connection_type: string;
  stream_url: string;
  username?: string;
  password?: string;
  ip_address?: string; // For saving configuration
  port?: number;      // For saving configuration
  status: string;
  resolution?: string;
  fps?: number;
  ai_server_id?: string;
  ai_model_id?: string;
  is_recording: boolean;
  created_at: string;
  updated_at: string;
};

export type AIServer = {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  status: string;
  gpu_model?: string;
  cpu_cores?: number;
  memory_gb?: number;
  created_at: string;
  updated_at: string;
};

export type AIModel = {
  id: string;
  name: string;
  description?: string;
  model_type: string;
  version: string;
  accuracy?: number;
  server_id?: string;
  is_active: boolean;
  model_path?: string; // Path to the .pt/.onnx file in Storage
  smart_reporting?: boolean;
  created_at: string;
};

export type Event = {
  id: string;
  camera_id: string;
  ai_model_id?: string;
  event_type: string;
  confidence?: number;
  snapshot_url?: string;
  metadata: Record<string, any>;
  acknowledged: boolean;
  created_at: string;
};

export type Dataset = {
  id: string;
  name: string;
  description?: string;
  type: string;
  format: string;
  storage_path: string;
  image_count: number;
  created_at: string;
};

export type TrainingJob = {
  id: string;
  dataset_id: string;
  server_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  base_model: string;
  epochs: number;
  current_epoch: number;
  progress: number;
  logs?: string[];
  resulting_model_id?: string;
  created_at: string;
  updated_at: string;
};

export type CameraModel = {
  id: string;
  camera_id: string;
  ai_model_id: string;
  is_active: boolean;
  created_at: string;
};

export type SystemSettings = {
  id: string;
  company_name: string;
  admin_email: string;
  retention_days: number;
  boundary_alerts_only: boolean;
  alert_email_enabled: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
  alert_sms_enabled: boolean;
  sms_provider?: string;
  sms_account_sid?: string;
  sms_auth_token?: string;
  sms_from?: string;
  updated_at: string;
};

export type AlertRule = {
  id: string;
  camera_id: string | null;
  enabled_objects: string[];
  disabled_objects: string[];
  mode: 'whitelist' | 'blacklist';
  apply_to_zones_only: boolean;
  confidence_threshold: number;
  schedule_enabled: boolean;
  schedule_start: string;   // "HH:MM" e.g. "19:00"
  schedule_end: string;     // "HH:MM" e.g. "06:00"
  schedule_days: string[];  // ["Mon","Tue",...]
  created_at: string;
  updated_at: string;
};

// Known Faces Library — used by unknown_face_detection
export type KnownFace = {
  id: string;
  name: string;
  role: string;                  // 'employee' | 'vip' | 'contractor' | 'blacklist'
  department?: string;
  photo_url: string;             // Primary/profile photo
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Virtual join field (loaded separately)
  photos?: KnownFacePhoto[];
};

// Multiple angles per person — minimum 5 for 90%+ accuracy
export type KnownFacePhoto = {
  id: string;
  known_face_id: string;
  photo_url: string;
  angle: 'front' | 'left_45' | 'right_45' | 'left_profile' | 'right_profile' | 'angled_down' | 'other';
  created_at: string;
};

// Known Color Profiles — saved dress code presets reusable across models
export type KnownColorProfile = {
  id: string;
  name: string;                  // e.g. 'Security Uniform', 'Construction Hi-Vis'
  required_colors: string[];     // Colors that must be present
  prohibited_colors: string[];   // Colors that must NOT be present
  region: 'top' | 'bottom' | 'full';
  coverage: number;              // 0.05 - 0.50
  cooldown: number;              // seconds
  created_at: string;
};

// Unknown Faces — captured by AI, pending operator labeling
export type UnknownFace = {
  id: string;
  camera_id: string;
  crop_url: string;
  snapshot_url?: string;
  confidence: number;
  status: 'pending' | 'labeled' | 'dismissed';
  labeled_as?: string;           // known_faces.id when labeled
  camera_name?: string;
  created_at: string;
};

// Known Plates & Vehicle Directory
export type KnownPlate = {
  id: string;
  plate_text: string;
  image_hash?: string;
  owner_name?: string;
  vehicle_desc?: string;
  tag: 'unknown' | 'vip' | 'staff' | 'resident' | 'visitor' | 'watchlist' | 'blocked' | string;
  highlight_color: string;
  alert_on_detect: boolean;
  notes?: string;
  source?: string;
  times_seen: number;
  last_seen: string;
  created_at: string;
};

// Number Plate Detection Log
export type NumberPlate = {
  id: string;
  plate_text: string;
  camera_id: string;
  confidence: number;
  snapshot_url: string;
  owner_name?: string;
  tag?: string;
  vehicle_state?: 'MOVING' | 'PARKED' | 'ARRIVING' | string;
  highlight_color?: string;
  created_at: string;
  cameras?: { name: string };
};
