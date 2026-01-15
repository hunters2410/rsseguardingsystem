-- Migration to support AI Model uploads and file linkin

-- 1. Add model_path column to ai_models table
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS model_path TEXT;

-- 2. Create bucket for AI Models if not exists (This usually needs to be done in Supabase UI or via Client, but here is SQL representation)
insert into storage.buckets (id, name, public)
values ('ai-models', 'ai-models', true)
on conflict (id) do nothing;

-- 3. Create bucket for Event Snapshots if not exists
insert into storage.buckets (id, name, public)
values ('event-snapshots', 'event-snapshots', true)
on conflict (id) do nothing;

-- 4. Enable RLS for Storage (simplified policy for demo)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id in ('ai-models', 'event-snapshots') );

create policy "Authenticated Upload"
  on storage.objects for insert
  with check ( bucket_id in ('ai-models', 'event-snapshots') and auth.role() = 'authenticated' );
