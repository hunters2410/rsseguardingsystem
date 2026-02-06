-- Create notification_emails table
create table if not exists public.notification_emails (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.notification_emails enable row level security;

-- Policies (Allow all for now as per other tables in this dev setup)
create policy "Allow all access" on public.notification_emails for all using (true);
