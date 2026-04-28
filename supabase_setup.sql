-- Create the shared storage table for app sync
create table if not exists public.app_storage (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone default now()
);

-- Option 1: Allow public browser access by disabling row level security
alter table public.app_storage disable row level security;

-- Option 2: If you want to keep RLS enabled, use these policies instead
-- alter table public.app_storage enable row level security;
--
-- create policy "anon can select app_storage"
--   on public.app_storage
--   for select
--   using (true);
--
-- create policy "anon can insert app_storage"
--   on public.app_storage
--   for insert
--   with check (true);
--
-- create policy "anon can update app_storage"
--   on public.app_storage
--   for update
--   using (true)
--   with check (true);
--
-- create policy "anon can delete app_storage"
--   on public.app_storage
--   for delete
--   using (true);

-- Optional unique index for performance
create unique index if not exists app_storage_key_idx on public.app_storage (key);
