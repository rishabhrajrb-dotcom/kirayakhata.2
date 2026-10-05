-- Applied to project aiqynlallthcqhvbhyby as migration "kirayakhata_user_records".
-- Per-user records with row-level security; see public/js/store-cloud.js.
create table if not exists public.kk_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store text not null check (store in ('workspace','suppliers','properties','tenants','agreements','versions','adjustments','invoices','groups','receipts','outbox','runs','completions','audit','drafts')),
  id text not null check (length(id) between 1 and 120),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, store, id)
);
alter table public.kk_records enable row level security;
create policy "kk_records select own" on public.kk_records for select to authenticated using (user_id = (select auth.uid()));
create policy "kk_records insert own" on public.kk_records for insert to authenticated with check (user_id = (select auth.uid()));
create policy "kk_records update own" on public.kk_records for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "kk_records delete own" on public.kk_records for delete to authenticated using (user_id = (select auth.uid()));

-- Per user: one active document per agreement+period+category, unique invoice numbers,
-- one outbox entry per idempotency key.
create unique index if not exists kk_inv_active_key on public.kk_records (user_id, (data->>'activeKey')) where store = 'invoices' and (data->>'activeKey') is not null;
create unique index if not exists kk_inv_number_key on public.kk_records (user_id, (data->>'numberKey')) where store = 'invoices' and (data->>'numberKey') is not null;
create unique index if not exists kk_outbox_key on public.kk_records (user_id, (data->>'idempotencyKey')) where store = 'outbox' and (data->>'idempotencyKey') is not null;

create or replace function public.kk_apply(changes jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare ch jsonb; n int := 0; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 500 then raise exception 'bad batch'; end if;
  for ch in select * from jsonb_array_elements(changes) loop
    if ch->'data' is null or jsonb_typeof(ch->'data') = 'null' then
      delete from kk_records where user_id = uid and store = ch->>'store' and id = ch->>'id';
    else
      insert into kk_records (user_id, store, id, data, updated_at) values (uid, ch->>'store', ch->>'id', ch->'data', now())
      on conflict (user_id, store, id) do update set data = excluded.data, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.kk_apply(jsonb) from public, anon;
grant execute on function public.kk_apply(jsonb) to authenticated;
