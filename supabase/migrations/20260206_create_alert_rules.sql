-- Create alert_rules table for configurable alert triggers
-- This allows users to specify which detected objects should trigger alerts

create table if not exists public.alert_rules (
  id uuid default gen_random_uuid() primary key,
  camera_id uuid references public.cameras(id) on delete cascade,
  -- If camera_id is NULL, this is a global rule applying to all cameras
  
  enabled_objects jsonb not null default '[]'::jsonb,
  -- Array of object types that should trigger alerts
  -- Example: ["person", "car", "weapon", "dog"]
  
  disabled_objects jsonb default '[]'::jsonb,
  -- Array of objects to explicitly exclude (used in blacklist mode)
  -- Example: ["bicycle", "bird"]
  
  mode text check (mode in ('whitelist', 'blacklist')) default 'whitelist',
  -- whitelist: Only trigger for enabled_objects
  -- blacklist: Trigger for everything EXCEPT disabled_objects
  
  apply_to_zones_only boolean default false,
  -- If true, only trigger when object crosses a zone boundary
  
  confidence_threshold numeric(5,2) default 0.28,
  -- Minimum confidence for this camera (overrides global)
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_alert_rules_camera on public.alert_rules(camera_id);
create index if not exists idx_alert_rules_mode on public.alert_rules(mode);

-- RLS policies
alter table public.alert_rules enable row level security;
create policy "Allow all access for alert rules" on public.alert_rules for all using (true);

-- Insert default global rule with common security objects
insert into public.alert_rules (camera_id, enabled_objects, mode, confidence_threshold)
values (
  null, -- Global rule
  '["person", "car", "truck", "motorcycle", "weapon", "gun", "knife", "dog"]'::jsonb,
  'whitelist',
  0.28
)
on conflict do nothing;

-- Add comment
comment on table public.alert_rules is 'Configurable rules for which detected objects should trigger alerts and events';
