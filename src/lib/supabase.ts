import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file or deployment settings.');
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
