-- Run once in Supabase: SQL Editor > New query > paste > Run
create table if not exists counters(k text primary key, n bigint not null default 0);
create or replace function next_no(p_k text) returns bigint language sql as $$
  insert into counters(k,n) values(p_k,1) on conflict(k) do update set n=counters.n+1 returning n $$;

create table if not exists app_users(
  id uuid primary key default gen_random_uuid(),
  username text unique not null, name text not null,
  role text not null check (role in ('SA','WS','TECH','ADMIN')),
  pass_hash text not null, created_at timestamptz default now());

create table if not exists customers(
  id text primary key, name text not null, phone text not null,
  city text, sub text, woreda text, house text, dob date, created_at timestamptz default now());

create table if not exists vehicles(
  id text primary key default gen_random_uuid()::text,
  cid text not null references customers(id),
  plate text not null, vin text, eng text, col text, model text, created_at timestamptz default now());

create table if not exists jobs(
  id text primary key, cid text not null references customers(id), vid text not null references vehicles(id),
  note text, status text not null default 'Created', created timestamptz default now(),
  labours jsonb not null default '[]', parts jsonb not null default '[]', inv jsonb, log jsonb not null default '[]');

-- Only the Render backend (service-role key) may touch data; the public anon key gets nothing.
alter table counters enable row level security;
alter table app_users enable row level security;
alter table customers enable row level security;
alter table vehicles enable row level security;
alter table jobs enable row level security;

-- ===== v1.1: notifications, parts inventory, safe concurrent saves =====
-- Safe to run on a new or an existing database (run the whole file again after updating).

-- Customers: how to reach them when the vehicle is ready
alter table customers add column if not exists notify text not null default 'both' check (notify in ('both','sms','telegram','none'));
alter table customers add column if not exists tg_chat text;   -- Telegram chat id, set when the customer taps the link
alter table customers add column if not exists tg_token text;  -- one-time link token, cleared after use

-- Job cards: version number, so two people saving the same card at once cannot overwrite each other
alter table jobs add column if not exists ver int not null default 0;

-- Parts inventory
create table if not exists inventory(
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null,
  price numeric not null default 0 check (price >= 0),          -- unit price before VAT
  stock numeric not null default 0 check (stock >= 0),
  reorder numeric not null default 0 check (reorder >= 0),
  active boolean not null default true, created_at timestamptz default now());

create table if not exists stock_moves(
  id bigint generated always as identity primary key,
  part_id uuid not null references inventory(id),
  delta numeric not null, balance numeric not null,
  reason text not null, job text, by_name text, note text, at timestamptz default now());
create index if not exists stock_moves_part on stock_moves(part_id, at desc);

-- The only way stock changes: atomic, refuses to go below zero, always leaves a history row
create or replace function adjust_stock(p_id uuid, p_delta numeric, p_reason text, p_job text, p_by text, p_note text default null)
returns numeric language plpgsql as $$
declare s numeric;
begin
  update inventory set stock = stock + p_delta where id = p_id and stock + p_delta >= 0 returning stock into s;
  if not found then raise exception 'INSUFFICIENT_OR_MISSING'; end if;
  insert into stock_moves(part_id, delta, balance, reason, job, by_name, note) values (p_id, p_delta, s, p_reason, p_job, p_by, p_note);
  return s;
end $$;

-- "Vehicle ready" messages: what was sent, to whom, and whether it worked
create table if not exists notifications(
  id bigint generated always as identity primary key,
  job text not null, cid text, channel text not null, to_addr text,
  status text not null check (status in ('sent','failed','skipped')), error text, at timestamptz default now());
create index if not exists notifications_job on notifications(job, at desc);

alter table inventory enable row level security;
alter table stock_moves enable row level security;
alter table notifications enable row level security;
