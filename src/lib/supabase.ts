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
