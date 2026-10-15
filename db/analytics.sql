-- Train IQ anonymous funnel analytics.
-- Run in Supabase SQL Editor before deploying the updated files.
-- Safe to re-run; existing lead tables are not modified.

create table if not exists public.funnel_sessions (
  session_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  flow_started_at timestamptz,
  first_interaction_at timestamptz,
  submitted_at timestamptz,
  last_step smallint not null default 0
    check (last_step between 0 and 3),
  steps_reached smallint[] not null default '{}',
  page_path text not null default '/',
  referrer_host text not null default '',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  device_type text not null default 'unknown',
  viewport_width integer,
  language text not null default '',
  timezone text not null default '',
  last_event text not null default 'link_opened',
  event_count integer not null default 0,
  field_interaction_count integer not null default 0,
  submit_attempt_count integer not null default 0,
  submit_failure_count integer not null default 0,
  submission_count integer not null default 0
);

alter table public.funnel_sessions
  add column if not exists field_interaction_count integer not null default 0;

alter table public.funnel_sessions
  add column if not exists submit_attempt_count integer not null default 0;

alter table public.funnel_sessions
  add column if not exists submit_failure_count integer not null default 0;

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.funnel_sessions(session_id) on delete cascade,
  event_name text not null check (
    event_name in (
      'link_opened',
      'flow_started',
      'step_view',
      'field_interaction',
      'step_completed',
      'submit_attempt',
      'submit_failed',
      'submitted',
      'activity',
      'page_hidden'
    )
  ),
  step smallint check (step between 1 and 3),
  field_name text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists funnel_sessions_first_seen_idx
  on public.funnel_sessions (first_seen_at desc);

create index if not exists funnel_sessions_activity_idx
  on public.funnel_sessions (last_activity_at desc);

create index if not exists funnel_events_occurred_at_idx
  on public.funnel_events (occurred_at desc);

create index if not exists funnel_events_session_idx
  on public.funnel_events (session_id, occurred_at desc);

alter table public.funnel_sessions enable row level security;
alter table public.funnel_events enable row level security;

-- Only the existing server-side service role should access these tables.
-- Never place the service-role key in browser code.
grant usage on schema public to service_role;
grant all privileges on table public.funnel_sessions to service_role;
grant all privileges on table public.funnel_events to service_role;