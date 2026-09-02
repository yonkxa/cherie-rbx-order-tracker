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
