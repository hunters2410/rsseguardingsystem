
-- Create ai_servers table if not exists (just in case)
create table if not exists ai_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ip_address text,
  port int,
  status text,
  gpu_model text,
  cpu_cores int,
  memory_gb int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Turn on RLS
alter table ai_servers enable row level security;

-- Allow Anon/Public to register servers (for local dev convenience)
create policy "Allow Public Registration"
  on ai_servers for insert
  with check ( true );

create policy "Allow Public Updates"
  on ai_servers for update
  using ( true );

create policy "Allow Public Read"
  on ai_servers for select
  using ( true );
