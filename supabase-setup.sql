-- =================================================================
-- TABLEAU INTELLIGENCE HUB — Supabase Database Setup
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)
-- =================================================================

-- 1. Create the app_store table (key-value store mirroring localStorage)
create table if not exists public.app_store (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- 2. Enable Row Level Security
alter table public.app_store enable row level security;

-- 3. RLS Policies: only authenticated users can access data
create policy "Authenticated users can read app_store"
  on public.app_store for select
  to authenticated
  using (true);

create policy "Authenticated users can insert app_store"
  on public.app_store for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update app_store"
  on public.app_store for update
  to authenticated
  using (true);

create policy "Authenticated users can delete app_store"
  on public.app_store for delete
  to authenticated
  using (true);

-- 4. Create profiles table linked to auth.users
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- 5. Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Done! Now create your first user in Supabase Auth dashboard.
