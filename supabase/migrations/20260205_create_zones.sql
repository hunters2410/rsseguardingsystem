-- Create camera_zones table for drawing lines and polygons
create table if not exists public.camera_zones (
  id uuid default gen_random_uuid() primary key,
  camera_id uuid references public.cameras(id) on delete cascade,
  type text check (type in ('line', 'zone')), -- 'line' for crossing, 'zone' for dwell/intrusion
  points jsonb not null, -- Array of normalized points e.g. [[0.1, 0.2], [0.5, 0.5]] (0-1 range)
  label text, -- "Restricted Area", "Main Entrance"
  alert_enabled boolean default true,
  created_at timestamptz default now()
);

-- Basic RLS
alter table public.camera_zones enable row level security;
create policy "Allow all access for now" on public.camera_zones for all using (true);

-- Indexes
create index if not exists idx_camera_zones_camera_id on public.camera_zones(camera_id);
