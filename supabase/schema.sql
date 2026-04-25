-- Stayful Intelligence — Supabase schema.
-- Run once in the Supabase SQL editor for the project that backs the
-- subscription website. Idempotent: safe to re-run.

-- ─── profiles ───────────────────────────────────────────────────
-- Each auth.users row gets one profiles row. Tracks subscription state and
-- the 14-day free trial window. Users get full access during the trial OR
-- while their Stripe subscription is active.
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  created_at timestamptz not null default now()
);

-- Backfill columns if running against an older deployment.
alter table public.profiles add column if not exists trial_started_at timestamptz not null default now();
alter table public.profiles add column if not exists trial_ends_at timestamptz not null default now() + interval '14 days';

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- ─── saved_searches ─────────────────────────────────────────────
create table if not exists public.saved_searches (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  address text not null,
  postcode text,
  guest_count integer not null,
  bedrooms integer,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_searches_user_id_created_at_idx
  on public.saved_searches (user_id, created_at desc);

alter table public.saved_searches enable row level security;

drop policy if exists "Users can manage own searches" on public.saved_searches;
create policy "Users can manage own searches"
  on public.saved_searches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── auto-create profile on signup ──────────────────────────────
-- Sets the 14-day trial window on first signup. The app server also calls
-- ensureProfile() defensively, so this trigger is a belt-and-braces backup
-- for OAuth and magic-link signups that bypass our /api/auth flow.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan, trial_started_at, trial_ends_at)
  values (
    new.id,
    new.email,
    'free',
    now(),
    now() + interval '14 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
