-- Create a table for queuing system commands from frontend to backend
create table if not exists public.system_commands (
  id uuid default gen_random_uuid() primary key,
  command_type text not null, -- e.g., 'test_email', 'test_sms'
  payload jsonb default '{}'::jsonb, -- parameters for the command
  status text default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  result text, -- error message or success output
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.system_commands enable row level security;

create policy "Enable all access for authenticated users"
on public.system_commands for all
to authenticated
using (true)
with check (true);
