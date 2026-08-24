-- EditFlow cloud sync
-- Run this whole script in Supabase -> SQL Editor.

create table if not exists public.editflow_data (
    user_id uuid primary key references auth.users(id) on delete cascade,
    orders jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.editflow_data enable row level security;

-- Re-running the script is safe.
drop policy if exists "Users can read their EditFlow data" on public.editflow_data;
drop policy if exists "Users can insert their EditFlow data" on public.editflow_data;
drop policy if exists "Users can update their EditFlow data" on public.editflow_data;
drop policy if exists "Users can delete their EditFlow data" on public.editflow_data;

create policy "Users can read their EditFlow data"
on public.editflow_data for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their EditFlow data"
on public.editflow_data for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their EditFlow data"
on public.editflow_data for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their EditFlow data"
on public.editflow_data for delete
to authenticated
using (auth.uid() = user_id);
