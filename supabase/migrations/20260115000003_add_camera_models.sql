
create table if not exists camera_models (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid references cameras(id) on delete cascade,
  ai_model_id uuid references ai_models(id) on delete cascade,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique(camera_id, ai_model_id)
);

alter table camera_models enable row level security;

create policy "Enable read access for all users"
on camera_models for select
using (true);

create policy "Enable insert access for all users"
on camera_models for insert
with check (true);

create policy "Enable delete access for all users"
on camera_models for delete
using (true);
