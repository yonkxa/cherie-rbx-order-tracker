-- Chérie RBX Order Desk
-- Run this entire file in Supabase SQL Editor.
-- Safe to run against the previous tracker schema.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- GAMEPASS ORDERS
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  robux_amount integer not null check (robux_amount > 0),
  process_type text not null default 'slow'
    check (process_type in ('fast', 'slow')),
  gamepass_link text not null,
  buyer_username text not null,
  status text not null default 'pending',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A single order may contain 1, 2, 3, or more gamepasses.
-- Each item is stored as {"amount": 5000, "link": "https://..."}.
alter table public.orders add column if not exists gamepass_links jsonb;

update public.orders
set gamepass_links = jsonb_build_array(
  jsonb_build_object('amount', robux_amount, 'link', gamepass_link)
)
where gamepass_links is null or gamepass_links = '[]'::jsonb;

alter table public.orders alter column gamepass_links set default '[]'::jsonb;
alter table public.orders alter column gamepass_links set not null;

-- Migrate the old tracker status before replacing its constraint.
update public.orders set status = 'refunded' where status = 'cancelled';
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'processing', 'completed', 'refunded'));

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_buyer_idx on public.orders(lower(buyer_username));

alter table public.orders enable row level security;

drop policy if exists "Authenticated users can view orders" on public.orders;
create policy "Authenticated users can view orders"
on public.orders for select to authenticated using (true);

drop policy if exists "Authenticated users can create orders" on public.orders;
create policy "Authenticated users can create orders"
on public.orders for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "Authenticated users can update orders" on public.orders;
create policy "Authenticated users can update orders"
on public.orders for update to authenticated
using (true) with check (true);

-- -----------------------------------------------------------------------------
-- ROBUX PAYOUTS
-- -----------------------------------------------------------------------------
create table if not exists public.robux_payouts (
  id uuid primary key default gen_random_uuid(),
  buyer_username text not null,
  roblox_username text not null,
  robux_amount integer not null check (robux_amount > 0),
  source_group text not null
    check (source_group in ('A (supp)', 'A (d''isle)', 'B (supp)', 'C (supp)', 'D (supp)', 'E (supp)')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'refunded')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add the recipient field to an existing payout table.
alter table public.robux_payouts add column if not exists roblox_username text;

-- Existing payout rows need a value to satisfy the new required field.
-- Use the buyer username as the temporary recipient for old records; new records
-- will always collect the actual Roblox username separately.
update public.robux_payouts
set roblox_username = buyer_username
where roblox_username is null or trim(roblox_username) = '';

alter table public.robux_payouts alter column roblox_username set not null;

create index if not exists robux_payouts_status_idx on public.robux_payouts(status);
create index if not exists robux_payouts_created_at_idx on public.robux_payouts(created_at desc);
create index if not exists robux_payouts_buyer_idx on public.robux_payouts(lower(buyer_username));
create index if not exists robux_payouts_recipient_idx on public.robux_payouts(lower(roblox_username));

alter table public.robux_payouts enable row level security;

drop policy if exists "Authenticated users can view payouts" on public.robux_payouts;
create policy "Authenticated users can view payouts"
on public.robux_payouts for select to authenticated using (true);

drop policy if exists "Authenticated users can create payouts" on public.robux_payouts;
create policy "Authenticated users can create payouts"
on public.robux_payouts for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "Authenticated users can update payouts" on public.robux_payouts;
create policy "Authenticated users can update payouts"
on public.robux_payouts for update to authenticated
using (true) with check (true);

-- -----------------------------------------------------------------------------
-- UPDATED-AT TRIGGERS
-- -----------------------------------------------------------------------------
create or replace function public.set_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
before update on public.orders
for each row execute function public.set_order_updated_at();

drop trigger if exists robux_payouts_updated_at on public.robux_payouts;
create trigger robux_payouts_updated_at
before update on public.robux_payouts
for each row execute function public.set_order_updated_at();

-- -----------------------------------------------------------------------------
-- STAFF AUDIT + MONTHLY ARCHIVE
-- -----------------------------------------------------------------------------
-- Chérie has exactly two staff identities. The database, not the browser, is
-- the source of truth for who created/updated a record.
alter table public.orders add column if not exists created_by_email text;
alter table public.orders add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists updated_by_email text;

alter table public.robux_payouts add column if not exists created_by_email text;
alter table public.robux_payouts add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.robux_payouts add column if not exists updated_by_email text;

-- Backfill readable audit names for existing rows where possible.
update public.orders o
set created_by_email = coalesce(o.created_by_email, u.email),
    updated_by = coalesce(o.updated_by, o.created_by),
    updated_by_email = coalesce(o.updated_by_email, u.email)
from auth.users u
where o.created_by = u.id;

update public.robux_payouts p
set created_by_email = coalesce(p.created_by_email, u.email),
    updated_by = coalesce(p.updated_by, p.created_by),
    updated_by_email = coalesce(p.updated_by_email, u.email)
from auth.users u
where p.created_by = u.id;

create or replace function public.audit_order_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_email := auth.jwt() ->> 'email';
    new.updated_by := auth.uid();
    new.updated_by_email := auth.jwt() ->> 'email';
  else
    -- These fields are immutable from the client. Every update gets the
    -- currently authenticated staff member automatically.
    new.created_by := old.created_by;
    new.created_by_email := old.created_by_email;
    new.updated_by := auth.uid();
    new.updated_by_email := auth.jwt() ->> 'email';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_audit_staff on public.orders;
create trigger orders_audit_staff
before insert or update on public.orders
for each row execute function public.audit_order_staff();

drop trigger if exists robux_payouts_audit_staff on public.robux_payouts;
create trigger robux_payouts_audit_staff
before insert or update on public.robux_payouts
for each row execute function public.audit_order_staff();

-- Exactly these two emails are allowed into the workspace.
drop policy if exists "Authenticated users can view orders" on public.orders;
drop policy if exists "Authenticated users can create orders" on public.orders;
drop policy if exists "Authenticated users can update orders" on public.orders;
create policy "Chérie staff can view orders" on public.orders for select to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));
create policy "Chérie staff can create orders" on public.orders for insert to authenticated
with check ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));
create policy "Chérie staff can update orders" on public.orders for update to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'))
with check ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

drop policy if exists "Authenticated users can view payouts" on public.robux_payouts;
drop policy if exists "Authenticated users can create payouts" on public.robux_payouts;
drop policy if exists "Authenticated users can update payouts" on public.robux_payouts;
create policy "Chérie staff can view payouts" on public.robux_payouts for select to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));
create policy "Chérie staff can create payouts" on public.robux_payouts for insert to authenticated
with check ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));
create policy "Chérie staff can update payouts" on public.robux_payouts for update to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'))
with check ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

create table if not exists public.archive_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  record_type text not null check (record_type in ('gamepass', 'payout')),
  archived_period_start date not null,
  archived_at timestamptz not null default now(),
  data jsonb not null,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  unique (source_id, record_type)
);

create index if not exists archive_records_period_idx on public.archive_records(archived_period_start desc);
create index if not exists archive_records_type_idx on public.archive_records(record_type);

alter table public.archive_records enable row level security;
drop policy if exists "Chérie staff can view archive" on public.archive_records;
create policy "Chérie staff can view archive" on public.archive_records for select to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

drop policy if exists "Chérie owner can delete archive" on public.archive_records;
create policy "Chérie owner can delete archive" on public.archive_records for delete to authenticated
using ((auth.jwt() ->> 'email') = 'espantaleonnika6@gmail.com');

-- Archives every record whose created date falls before the current Manila
-- calendar month. Running this again is safe because source_id + type is unique.
create or replace function public.archive_closed_records()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month_start timestamptz := (date_trunc('month', timezone('Asia/Manila', now())) at time zone 'Asia/Manila');
begin
  perform pg_advisory_xact_lock(hashtext('cherie_monthly_archive'));

  insert into public.archive_records (source_id, record_type, archived_period_start, archived_at, data, created_by_email, updated_by_email, created_at)
  select o.id, 'gamepass', date_trunc('month', timezone('Asia/Manila', o.created_at))::date, now(), to_jsonb(o), o.created_by_email, o.updated_by_email, o.created_at
  from public.orders o
  where o.created_at < current_month_start
  on conflict (source_id, record_type) do nothing;

  insert into public.archive_records (source_id, record_type, archived_period_start, archived_at, data, created_by_email, updated_by_email, created_at)
  select p.id, 'payout', date_trunc('month', timezone('Asia/Manila', p.created_at))::date, now(), to_jsonb(p), p.created_by_email, p.updated_by_email, p.created_at
  from public.robux_payouts p
  where p.created_at < current_month_start
  on conflict (source_id, record_type) do nothing;

  delete from public.orders o
  where o.created_at < current_month_start
    and exists (select 1 from public.archive_records a where a.source_id = o.id and a.record_type = 'gamepass');

  delete from public.robux_payouts p
  where p.created_at < current_month_start
    and exists (select 1 from public.archive_records a where a.source_id = p.id and a.record_type = 'payout');
end;
$$;

-- Supabase projects normally have pg_cron available. The job runs at 00:10
-- Manila time on the first day of every month (16:10 UTC).
create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'cherie-monthly-archive';
select cron.schedule('cherie-monthly-archive', '10 16 1 * *', $$select public.archive_closed_records();$$);

-- -----------------------------------------------------------------------------
-- MANUAL SELECT-ALL/SELECT-SOME ARCHIVE + DELETE
-- -----------------------------------------------------------------------------
-- Staff can remove an active (not yet archived) order/payout directly, e.g. a
-- duplicate or mistaken entry. Archived records still require the separate
-- owner-only delete policy above.
drop policy if exists "Chérie staff can delete orders" on public.orders;
create policy "Chérie staff can delete orders" on public.orders for delete to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

drop policy if exists "Chérie staff can delete payouts" on public.robux_payouts;
create policy "Chérie staff can delete payouts" on public.robux_payouts for delete to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

-- Lets staff archive a chosen set of records on demand (select-all or
-- select-some in the UI), instead of waiting for the monthly cron job.
-- Mirrors archive_closed_records but targets an explicit id list.
create or replace function public.archive_selected_records(
  p_gamepass_ids uuid[] default '{}',
  p_payout_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com')) then
    raise exception 'Not authorized';
  end if;

  insert into public.archive_records (source_id, record_type, archived_period_start, archived_at, data, created_by_email, updated_by_email, created_at)
  select o.id, 'gamepass', date_trunc('month', timezone('Asia/Manila', o.created_at))::date, now(), to_jsonb(o), o.created_by_email, o.updated_by_email, o.created_at
  from public.orders o
  where o.id = any(p_gamepass_ids)
  on conflict (source_id, record_type) do nothing;

  insert into public.archive_records (source_id, record_type, archived_period_start, archived_at, data, created_by_email, updated_by_email, created_at)
  select p.id, 'payout', date_trunc('month', timezone('Asia/Manila', p.created_at))::date, now(), to_jsonb(p), p.created_by_email, p.updated_by_email, p.created_at
  from public.robux_payouts p
  where p.id = any(p_payout_ids)
  on conflict (source_id, record_type) do nothing;

  delete from public.orders o
  where o.id = any(p_gamepass_ids)
    and exists (select 1 from public.archive_records a where a.source_id = o.id and a.record_type = 'gamepass');

  delete from public.robux_payouts p
  where p.id = any(p_payout_ids)
    and exists (select 1 from public.archive_records a where a.source_id = p.id and a.record_type = 'payout');
end;
$$;

grant execute on function public.archive_selected_records(uuid[], uuid[]) to authenticated;

-- Chérie RBX Order Desk
-- Run this entire file in Supabase SQL Editor.
-- Safe to run against the previous tracker schema.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- GAMEPASS ORDERS
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  robux_amount integer not null check (robux_amount > 0),
  process_type text not null default 'slow'
    check (process_type in ('fast', 'slow')),
  gamepass_link text not null,
  buyer_username text not null,
  status text not null default 'pending',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A single order may contain 1, 2, 3, or more gamepasses.
-- Each item is stored as {"amount": 5000, "link": "https://..."}.
alter table public.orders add column if not exists gamepass_links jsonb;

update public.orders
set gamepass_links = jsonb_build_array(
  jsonb_build_object('amount', robux_amount, 'link', gamepass_link)
)
where gamepass_links is null or gamepass_links = '[]'::jsonb;

alter table public.orders alter column gamepass_links set default '[]'::jsonb;
alter table public.orders alter column gamepass_links set not null;

-- Migrate the old tracker status before replacing its constraint.
update public.orders set status = 'refunded' where status = 'cancelled';
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'processing', 'completed', 'refunded'));

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_buyer_idx on public.orders(lower(buyer_username));

alter table public.orders enable row level security;

drop policy if exists "Authenticated users can view orders" on public.orders;
create policy "Authenticated users can view orders"
on public.orders for select to authenticated using (true);

drop policy if exists "Authenticated users can create orders" on public.orders;
create policy "Authenticated users can create orders"
on public.orders for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "Authenticated users can update orders" on public.orders;
create policy "Authenticated users can update orders"
on public.orders for update to authenticated
using (true) with check (true);

-- -----------------------------------------------------------------------------
-- ROBUX PAYOUTS
-- -----------------------------------------------------------------------------
create table if not exists public.robux_payouts (
  id uuid primary key default gen_random_uuid(),
  buyer_username text not null,
  roblox_username text not null,
  robux_amount integer not null check (robux_amount > 0),
  source_group text not null
    check (source_group in ('A (supp)', 'A (d''isle)', 'B (supp)', 'C (supp)', 'D (supp)', 'E (supp)')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'refunded')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add the recipient field to an existing payout table.
alter table public.robux_payouts add column if not exists roblox_username text;

-- Existing payout rows need a value to satisfy the new required field.
-- Use the buyer username as the temporary recipient for old records; new records
-- will always collect the actual Roblox username separately.
update public.robux_payouts
set roblox_username = buyer_username
where roblox_username is null or trim(roblox_username) = '';

alter table public.robux_payouts alter column roblox_username set not null;

create index if not exists robux_payouts_status_idx on public.robux_payouts(status);
create index if not exists robux_payouts_created_at_idx on public.robux_payouts(created_at desc);
create index if not exists robux_payouts_buyer_idx on public.robux_payouts(lower(buyer_username));
create index if not exists robux_payouts_recipient_idx on public.robux_payouts(lower(roblox_username));

alter table public.robux_payouts enable row level security;

drop policy if exists "Authenticated users can view payouts" on public.robux_payouts;
create policy "Authenticated users can view payouts"
on public.robux_payouts for select to authenticated using (true);

drop policy if exists "Authenticated users can create payouts" on public.robux_payouts;
create policy "Authenticated users can create payouts"
on public.robux_payouts for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "Authenticated users can update payouts" on public.robux_payouts;
create policy "Authenticated users can update payouts"
on public.robux_payouts for update to authenticated
using (true) with check (true);

-- -----------------------------------------------------------------------------
-- UPDATED-AT TRIGGERS
-- -----------------------------------------------------------------------------
create or replace function public.set_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
before update on public.orders
for each row execute function public.set_order_updated_at();

drop trigger if exists robux_payouts_updated_at on public.robux_payouts;
create trigger robux_payouts_updated_at
before update on public.robux_payouts
for each row execute function public.set_order_updated_at();

-- -----------------------------------------------------------------------------
-- STAFF AUDIT + MONTHLY ARCHIVE
-- -----------------------------------------------------------------------------
-- Chérie has exactly two staff identities. The database, not the browser, is
-- the source of truth for who created/updated a record.
alter table public.orders add column if not exists created_by_email text;
alter table public.orders add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists updated_by_email text;

alter table public.robux_payouts add column if not exists created_by_email text;
alter table public.robux_payouts add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.robux_payouts add column if not exists updated_by_email text;

-- Backfill readable audit names for existing rows where possible.
update public.orders o
set created_by_email = coalesce(o.created_by_email, u.email),
    updated_by = coalesce(o.updated_by, o.created_by),
    updated_by_email = coalesce(o.updated_by_email, u.email)
from auth.users u
where o.created_by = u.id;

update public.robux_payouts p
set created_by_email = coalesce(p.created_by_email, u.email),
    updated_by = coalesce(p.updated_by, p.created_by),
    updated_by_email = coalesce(p.updated_by_email, u.email)
from auth.users u
where p.created_by = u.id;

create or replace function public.audit_order_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_by_email := auth.jwt() ->> 'email';
    new.updated_by := auth.uid();
    new.updated_by_email := auth.jwt() ->> 'email';
  else
    -- These fields are immutable from the client. Every update gets the
    -- currently authenticated staff member automatically.
    new.created_by := old.created_by;
    new.created_by_email := old.created_by_email;
    new.updated_by := auth.uid();
    new.updated_by_email := auth.jwt() ->> 'email';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_audit_staff on public.orders;
create trigger orders_audit_staff
before insert or update on public.orders
for each row execute function public.audit_order_staff();

drop trigger if exists robux_payouts_audit_staff on public.robux_payouts;
create trigger robux_payouts_audit_staff
before insert or update on public.robux_payouts
for each row execute function public.audit_order_staff();

-- Exactly these two emails are allowed into the workspace.
drop policy if exists "Authenticated users can view orders" on public.orders;
drop policy if exists "Authenticated users can create orders" on public.orders;
drop policy if exists "Authenticated users can update orders" on public.orders;
drop policy if exists "Chérie staff can view orders" on public.orders;
create policy "Chérie staff can view orders" on public.orders for select to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));
drop policy if exists "Chérie staff can create orders" on public.orders;
create policy "Chérie staff can create orders" on public.orders for insert to authenticated
with check ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));
drop policy if exists "Chérie staff can update orders" on public.orders;
create policy "Chérie staff can update orders" on public.orders for update to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'))
with check ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

drop policy if exists "Authenticated users can view payouts" on public.robux_payouts;
drop policy if exists "Authenticated users can create payouts" on public.robux_payouts;
drop policy if exists "Authenticated users can update payouts" on public.robux_payouts;
drop policy if exists "Chérie staff can view payouts" on public.robux_payouts;
create policy "Chérie staff can view payouts" on public.robux_payouts for select to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));
drop policy if exists "Chérie staff can create payouts" on public.robux_payouts;
create policy "Chérie staff can create payouts" on public.robux_payouts for insert to authenticated
with check ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));
drop policy if exists "Chérie staff can update payouts" on public.robux_payouts;
create policy "Chérie staff can update payouts" on public.robux_payouts for update to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'))
with check ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

create table if not exists public.archive_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  record_type text not null check (record_type in ('gamepass', 'payout')),
  archived_period_start date not null,
  archived_at timestamptz not null default now(),
  data jsonb not null,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  unique (source_id, record_type)
);

create index if not exists archive_records_period_idx on public.archive_records(archived_period_start desc);
create index if not exists archive_records_type_idx on public.archive_records(record_type);

alter table public.archive_records enable row level security;
drop policy if exists "Chérie staff can view archive" on public.archive_records;
create policy "Chérie staff can view archive" on public.archive_records for select to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

drop policy if exists "Chérie owner can delete archive" on public.archive_records;
create policy "Chérie owner can delete archive" on public.archive_records for delete to authenticated
using ((auth.jwt() ->> 'email') = 'espantaleonnika6@gmail.com');

-- Archives every record whose created date falls before the current Manila
-- calendar month. Running this again is safe because source_id + type is unique.
create or replace function public.archive_closed_records()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month_start timestamptz := (date_trunc('month', timezone('Asia/Manila', now())) at time zone 'Asia/Manila');
begin
  perform pg_advisory_xact_lock(hashtext('cherie_monthly_archive'));

  insert into public.archive_records (source_id, record_type, archived_period_start, archived_at, data, created_by_email, updated_by_email, created_at)
  select o.id, 'gamepass', date_trunc('month', timezone('Asia/Manila', o.created_at))::date, now(), to_jsonb(o), o.created_by_email, o.updated_by_email, o.created_at
  from public.orders o
  where o.created_at < current_month_start
  on conflict (source_id, record_type) do nothing;

  insert into public.archive_records (source_id, record_type, archived_period_start, archived_at, data, created_by_email, updated_by_email, created_at)
  select p.id, 'payout', date_trunc('month', timezone('Asia/Manila', p.created_at))::date, now(), to_jsonb(p), p.created_by_email, p.updated_by_email, p.created_at
  from public.robux_payouts p
  where p.created_at < current_month_start
  on conflict (source_id, record_type) do nothing;

  delete from public.orders o
  where o.created_at < current_month_start
    and exists (select 1 from public.archive_records a where a.source_id = o.id and a.record_type = 'gamepass');

  delete from public.robux_payouts p
  where p.created_at < current_month_start
    and exists (select 1 from public.archive_records a where a.source_id = p.id and a.record_type = 'payout');
end;
$$;

-- Supabase projects normally have pg_cron available. The job runs at 00:10
-- Manila time on the first day of every month (16:10 UTC).
create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'cherie-monthly-archive';
select cron.schedule('cherie-monthly-archive', '10 16 1 * *', $$select public.archive_closed_records();$$);

-- -----------------------------------------------------------------------------
-- MANUAL SELECT-ALL/SELECT-SOME ARCHIVE + DELETE
-- -----------------------------------------------------------------------------
-- Staff can remove an active (not yet archived) order/payout directly, e.g. a
-- duplicate or mistaken entry. Archived records still require the separate
-- owner-only delete policy above.
drop policy if exists "Chérie staff can delete orders" on public.orders;
create policy "Chérie staff can delete orders" on public.orders for delete to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

drop policy if exists "Chérie staff can delete payouts" on public.robux_payouts;
create policy "Chérie staff can delete payouts" on public.robux_payouts for delete to authenticated
using ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com'));

-- Lets staff archive a chosen set of records on demand (select-all or
-- select-some in the UI), instead of waiting for the monthly cron job.
-- Mirrors archive_closed_records but targets an explicit id list.
create or replace function public.archive_selected_records(
  p_gamepass_ids uuid[] default '{}',
  p_payout_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not ((auth.jwt() ->> 'email') in ('espantaleonnika6@gmail.com', 'nicslibunao@gmail.com')) then
    raise exception 'Not authorized';
  end if;

  insert into public.archive_records (source_id, record_type, archived_period_start, archived_at, data, created_by_email, updated_by_email, created_at)
  select o.id, 'gamepass', date_trunc('month', timezone('Asia/Manila', o.created_at))::date, now(), to_jsonb(o), o.created_by_email, o.updated_by_email, o.created_at
  from public.orders o
  where o.id = any(p_gamepass_ids)
  on conflict (source_id, record_type) do nothing;

  insert into public.archive_records (source_id, record_type, archived_period_start, archived_at, data, created_by_email, updated_by_email, created_at)
  select p.id, 'payout', date_trunc('month', timezone('Asia/Manila', p.created_at))::date, now(), to_jsonb(p), p.created_by_email, p.updated_by_email, p.created_at
  from public.robux_payouts p
  where p.id = any(p_payout_ids)
  on conflict (source_id, record_type) do nothing;

  delete from public.orders o
  where o.id = any(p_gamepass_ids)
    and exists (select 1 from public.archive_records a where a.source_id = o.id and a.record_type = 'gamepass');

  delete from public.robux_payouts p
  where p.id = any(p_payout_ids)
    and exists (select 1 from public.archive_records a where a.source_id = p.id and a.record_type = 'payout');
end;
$$;

grant execute on function public.archive_selected_records(uuid[], uuid[]) to authenticated;


-- Chérie RBX Order Desk
-- Adds a simple "buyer source" choice (Telegram or Discord) to orders and payouts.
-- Safe to run multiple times.

alter table public.orders
  add column if not exists buyer_source text not null default 'telegram'
  check (buyer_source in ('telegram', 'discord'));

alter table public.robux_payouts
  add column if not exists buyer_source text not null default 'telegram'
  check (buyer_source in ('telegram', 'discord'));

-- (No RLS changes needed — existing staff policies already cover these tables.)