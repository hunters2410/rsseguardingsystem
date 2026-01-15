
-- Table for Datasets
create table if not exists datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text default 'object_detection', -- 'object_detection', 'classification'
  format text default 'yolo_zip', -- 'yolo_zip'
  storage_path text not null, -- Path to zip file in 'datasets' bucket
  image_count int default 0,
  created_at timestamptz default now()
);

-- Table for Training Jobs
create table if not exists training_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid references datasets(id),
  server_id uuid not null, -- Which server picks up the job
  status text default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  base_model text default 'yolov8n.pt',
  epochs int default 100,
  current_epoch int default 0,
  progress float default 0.0,
  logs text[],
  resulting_model_id uuid references ai_models(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Storage bucket for Datasets
insert into storage.buckets (id, name, public)
values ('datasets', 'datasets', true)
on conflict (id) do nothing;

-- RLS Policies
alter table datasets enable row level security;
alter table training_jobs enable row level security;

create policy "Public Dataset Access" on datasets for select using (true);
create policy "Public Dataset Insert" on datasets for insert with check (true);
create policy "Public Dataset Delete" on datasets for delete using (true);

create policy "Public Job Access" on training_jobs for select using (true);
create policy "Public Job Insert" on training_jobs for insert with check (true);
create policy "Public Job Update" on training_jobs for update using (true);

-- Storage Policies
create policy "Dataset Public Access"
  on storage.objects for select
  using ( bucket_id = 'datasets' );

create policy "Dataset Upload"
  on storage.objects for insert
  with check ( bucket_id = 'datasets' );
