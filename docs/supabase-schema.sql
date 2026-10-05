-- PROPOSAL ONLY - not applied. Review before use. Private tables are owner-scoped with RLS.
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legal_name text not null, address text, state_code text, gst_reg_type text, gstin text,
  bank jsonb, series_prefix text not null default 'KK', series_counters jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.properties (id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, name text not null, address text, state_code text, units jsonb not null default '[]', archived boolean default false);
create table public.tenants (id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, legal_name text not null, billing_address text, state_code text, gst_status text, gstin text, email text, contact_consent_at timestamptz);
create table public.agreements (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id), tenant_id uuid not null references public.tenants(id), supplier_id uuid references public.suppliers(id),
  unit_id text, status text not null, start_date date not null, end_date date, reference text
);
create table public.agreement_versions (id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, agreement_id uuid not null references public.agreements(id), effective_from date not null, kind text, reason text, terms jsonb not null, created_at timestamptz default now());
create table public.invoices (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid, agreement_id uuid not null references public.agreements(id), supplier_id uuid not null references public.suppliers(id),
  period text not null, category text not null, status text not null, active_key text, number text, fy text,
  doc jsonb not null, snapshot jsonb not null, issued_at timestamptz,
  unique (owner_id, active_key), unique (owner_id, supplier_id, fy, number)
);
create table public.receipts (id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, tenant_id uuid references public.tenants(id), type text, date date not null, amount_paise bigint not null, reference text, allocations jsonb not null default '[]', unique (owner_id, reference, date, amount_paise));
create table public.outbox (id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, idempotency_key text not null, status text not null, attempts jsonb default '[]', unique (owner_id, idempotency_key));
create table public.audit_events (id bigserial primary key, owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, at timestamptz default now(), entity text, entity_id text, action text, detail jsonb);

-- RLS on every private table
do $$ declare t text; begin
  foreach t in array array['suppliers','properties','tenants','agreements','agreement_versions','invoices','receipts','outbox','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (owner_id = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (owner_id = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (owner_id = auth.uid())', t || '_delete', t);
  end loop;
end $$;

-- Parent/child consistency: a child can only reference the caller's own parents.
create policy agreements_parent_check on public.agreements as restrictive for all using (true) with check (
  exists (select 1 from public.properties p where p.id = property_id and p.owner_id = auth.uid())
  and exists (select 1 from public.tenants t where t.id = tenant_id and t.owner_id = auth.uid()));
create policy invoices_parent_check on public.invoices as restrictive for all using (true) with check (
  exists (select 1 from public.agreements a where a.id = agreement_id and a.owner_id = auth.uid()));

-- Anonymous demo metrics: service-role only (no client policies). Never reuse for private data.
create table public.demo_metrics (id bigserial primary key, at timestamptz default now(), visitor text, scenario text, treatment text, arithmetic text, rent_paise bigint, difference_paise bigint, ruleset text, sample boolean);
alter table public.demo_metrics enable row level security;
