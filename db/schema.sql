-- Train IQ - Supabase schema
-- Run this once in the Supabase SQL Editor. It is safe to re-run.

create table if not exists public.leads (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),
  lead_id                  text unique,
  full_name                text not null,
  mobile_number            text not null,
  email                    text,
  business_name            text,
  business_category        text,
  business_location        text,
  business_website         text,
  current_presence         text[] not null default '{}',
  challenges               text[] not null default '{}',
  primary_goal             text,
  desired_timeline         text,
  preferred_contact_method text,
  status                   text not null default 'NEW'
);

-- Upgrading from the first version of this project? These add the new columns.
alter table public.leads add column if not exists business_website text;
alter table public.leads add column if not exists current_presence text[] not null default '{}';
alter table public.leads add column if not exists challenges text[] not null default '{}';

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads
  add constraint leads_status_check check (status in ('NEW', 'CONTACTED', 'CLOSED'));

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx on public.leads (status);

-- Lock the table down. With RLS on and no policies, the public anon key can read
-- or write nothing. Only the server (which uses the service role key) can access it.
alter table public.leads enable row level security;
