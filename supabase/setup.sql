-- KirayaKhata - run ONCE in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Creates: anonymous demo metrics, a race-safe rate limiter, and the email audit log.
-- Property records still live in each user's browser in this release (see DEPLOY.md);
-- docs/supabase-schema.sql is the proposal for full cloud sync later.

-- 1) Anonymous demo metrics (server writes with the service-role key only)
create table if not exists public.demo_metrics (
  id bigserial primary key,
  at timestamptz not null default now(),
  visitor text not null,
  payload jsonb not null
);
alter table public.demo_metrics enable row level security;   -- no policies = no client access

-- 2) Rolling-window rate limiter used for: demo checks (5/day/visitor),
--    emails (30/day/user) and AI drafts (20/day/user)
create table if not exists public.kk_rate_hits (
  id bigserial primary key,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists kk_rate_hits_key_at on public.kk_rate_hits (key, at);
alter table public.kk_rate_hits enable row level security;

create or replace function public.kk_rate_check(p_key text, p_limit int)
returns json language plpgsql security definer set search_path = public as $$
declare n int; oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));          -- serialises concurrent checks per key
  delete from kk_rate_hits where key = p_key and at < now() - interval '24 hours';
  select count(*), min(at) into n, oldest from kk_rate_hits where key = p_key;
  if n >= p_limit then
    return json_build_object('allowed', false, 'remaining', 0, 'reset_at', oldest + interval '24 hours');
  end if;
  insert into kk_rate_hits(key) values (p_key);
  return json_build_object('allowed', true, 'remaining', p_limit - n - 1, 'reset_at', coalesce(oldest, now()) + interval '24 hours');
end $$;
revoke all on function public.kk_rate_check(text, int) from public, anon, authenticated;
grant execute on function public.kk_rate_check(text, int) to service_role;

-- 3) Email audit log + idempotency (one row per user + key; a retry never sends twice)
create table if not exists public.kk_email_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  status text not null check (status in ('pending', 'accepted', 'failed')),
  recipient_domain text,          -- only the domain is kept, not the full address
  invoice_numbers text[] not null default '{}',
  attachments int not null default 0,
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
alter table public.kk_email_log enable row level security;
drop policy if exists "own email log" on public.kk_email_log;
create policy "own email log" on public.kk_email_log for select to authenticated using (user_id = (select auth.uid()));
-- Inserts/updates happen server-side with the service-role key only.
