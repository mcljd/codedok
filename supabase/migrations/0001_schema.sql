-- CodedOK — Supabase schema
-- Mirrors the localStorage Store one-to-one so the JS sync layer can do
-- a record-at-a-time push/pull without surprising shape changes.
--
-- Run order:
--   1. schema.sql   (this file)
--   2. policies.sql (RLS)
--   3. seed.sql     (optional demo data)
--
-- Every table gets:
--   - id (text, client-generated UUID-style — keeps offline writes possible)
--   - created_at, updated_at  for the sync layer's last-write-wins logic
--   - deleted_at              tombstone for soft deletes
--
-- Run with: Supabase Dashboard → SQL Editor → paste → Run

-- ============================================================
-- ENUMS
-- ============================================================

create type user_kind     as enum ('operator', 'surveyor', 'admin', 'builder');
create type vessel_cat    as enum ('Cat 0','Cat 1','Cat 2','Cat 3','Cat 4','Cat 5','Cat 6','Workboat');
create type cert_status   as enum ('valid', 'due_soon', 'overdue', 'unknown');
create type job_status    as enum ('requested', 'quoted', 'accepted', 'in_progress', 'completed', 'delivered', 'declined');
create type invoice_status as enum ('draft', 'sent', 'paid', 'cancelled');
create type sms_status    as enum ('draft', 'review', 'active', 'signed', 'submitted', 'in_progress', 'delivered');
create type deficiency_severity as enum ('critical', 'major', 'minor');
create type deficiency_status   as enum ('open', 'resolved');

-- ============================================================
-- CORE TABLES
-- ============================================================

create table users (
  id          text primary key,
  email       text unique not null,
  name        text not null,
  initials    text,
  kind        user_kind not null default 'operator',
  phone       text,
  -- Per-role profiles stored as JSONB so we don't need 4 join tables
  surveyor    jsonb,    -- { qualifications, certifying_bodies, regions, company, phone, logo }
  builder     jsonb,    -- { company, town, phone, specialties }
  -- Auth link: when a user signs in via Supabase Auth, we link to that row
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index users_auth_idx on users(auth_user_id);
create index users_kind_idx on users(kind);

create table organizations (
  id          text primary key,
  name        text not null,
  plan        text default 'trial',
  trial_ends_at date,
  stripe_customer_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table memberships (
  org_id      text references organizations(id) on delete cascade,
  user_id     text references users(id) on delete cascade,
  role        text not null default 'member',  -- owner / member / viewer
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ============================================================
-- FLEET
-- ============================================================

create table vessels (
  id          text primary key,
  org_id      text references organizations(id) on delete cascade,
  name        text not null,
  type        text,
  category    vessel_cat,
  ssr         text,
  length      numeric(5,2),
  persons     int,
  port        text,
  certifier   text,
  icon        text,
  photo       text,                -- URL or data URL during the localStorage period
  jurisdictions text[] default array['UK'],
  make        text,
  engine      text,
  -- Builder partnership fields
  built_by    text,                -- 'redbay' etc
  hull_number text,
  built_at    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index vessels_org_idx on vessels(org_id);
create index vessels_built_by_idx on vessels(built_by);

create table certs (
  id          text primary key,
  vessel_id   text references vessels(id) on delete cascade,
  kind        text,
  name        text not null,
  icon        text,
  expires_at  date,
  category    text,
  issuer      text,
  number      text,
  file_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index certs_vessel_idx on certs(vessel_id);

create table equipment (
  id          text primary key,
  vessel_id   text references vessels(id) on delete cascade,
  kind        text,
  name        text not null,
  icon        text,
  make        text,
  model       text,
  serial      text,
  qty         int default 1,
  installed_at date,
  last_service_at date,
  next_service_at date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index equipment_vessel_idx on equipment(vessel_id);

create table deficiencies (
  id          text primary key,
  vessel_id   text references vessels(id) on delete cascade,
  title       text not null,
  description text,
  severity    deficiency_severity not null default 'major',
  status      deficiency_status not null default 'open',
  source      text,                -- 'surveyor' / 'operator' / 'inspection'
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index deficiencies_vessel_idx on deficiencies(vessel_id);

create table inspections (
  id          text primary key,
  vessel_id   text references vessels(id) on delete cascade,
  surveyor_user_id text references users(id),
  started_at  timestamptz,
  completed_at timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index inspections_vessel_idx on inspections(vessel_id);

-- ============================================================
-- CREW
-- ============================================================

create table crew (
  id          text primary key,
  org_id      text references organizations(id) on delete cascade,
  name        text not null,
  role        text,
  avatar_color text,
  vessel_ids  text[] default array[]::text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index crew_org_idx on crew(org_id);

create table crew_certs (
  id          text primary key,
  person_id   text references crew(id) on delete cascade,
  name        text not null,
  issuer      text,
  expires_at  date,
  file_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index crew_certs_person_idx on crew_certs(person_id);

-- ============================================================
-- SURVEYOR GRANTS (cross-org access)
-- ============================================================

create table surveyor_grants (
  id          text primary key,
  vessel_id   text references vessels(id) on delete cascade,
  surveyor_user_id text references users(id) on delete cascade,
  granted_by  text references users(id),
  granted_at  date not null default current_date,
  expires_at  date,
  scopes      text[] default array['view','deficiency','inspect','issue_cert'],
  revoked_at  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index sg_vessel_idx on surveyor_grants(vessel_id);
create index sg_surveyor_idx on surveyor_grants(surveyor_user_id);

-- ============================================================
-- SMS — Safety Management System docs
-- ============================================================

create table sms_documents (
  id          text primary key,
  org_id      text references organizations(id) on delete cascade,
  vessel_id   text references vessels(id) on delete cascade,
  type        text default 'full_sms',  -- 'full_sms' | 'risk_assess' | 'review_request'
  version     int default 1,
  file_url    text,
  status      sms_status not null default 'draft',
  built_by_codedok boolean default false,
  generated_by_ai  boolean default false,
  title       text,
  body        text,
  sections    jsonb,             -- { meta: {...}, risk: {...}, ... }
  last_reviewed_at date,
  signed_by_user_id text references users(id),
  signed_at   timestamptz,
  -- New SMS feature set:
  edit_log    jsonb default '[]'::jsonb,
  acknowledgements jsonb default '[]'::jsonb,
  share_token text unique,
  share_token_expires_at timestamptz,
  review_due_at date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index sms_org_idx on sms_documents(org_id);
create index sms_vessel_idx on sms_documents(vessel_id);
create index sms_status_idx on sms_documents(status);
create index sms_share_token_idx on sms_documents(share_token);

-- ============================================================
-- MARKETPLACE — jobs & invoices
-- ============================================================

create table jobs (
  id          text primary key,
  vessel_id   text references vessels(id) on delete cascade,
  surveyor_user_id text references users(id),
  requested_by_user_id text references users(id),
  type        text default 'other',
  title       text,
  description text,
  status      job_status not null default 'requested',
  quote_amount numeric(10,2),
  quote_sent_at timestamptz,
  paid_at     timestamptz,
  payment_method text,
  completed_at timestamptz,
  invoice_id  text,
  attachment_url text,
  sms_doc_id  text references sms_documents(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index jobs_surveyor_idx on jobs(surveyor_user_id);
create index jobs_vessel_idx on jobs(vessel_id);
create index jobs_status_idx on jobs(status);

create table invoices (
  id          text primary key,
  job_id      text references jobs(id) on delete cascade,
  vessel_id   text references vessels(id) on delete cascade,
  org_id      text references organizations(id) on delete cascade,
  surveyor_user_id text references users(id),
  line_items  jsonb default '[]'::jsonb,
  subtotal    numeric(10,2),
  vat         numeric(10,2),
  total       numeric(10,2),
  status      invoice_status not null default 'sent',
  paid_at     timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ============================================================
-- AUDIT
-- ============================================================

create table action_log (
  id          bigserial primary key,
  org_id      text,
  actor_user_id text references users(id),
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb default '{}'::jsonb,
  at          timestamptz not null default now()
);

create index action_log_org_idx on action_log(org_id);
create index action_log_at_idx  on action_log(at desc);

-- ============================================================
-- updated_at trigger — automatic on every UPDATE
-- ============================================================

create or replace function tg_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in (
        'users','organizations','vessels','certs','equipment','deficiencies',
        'inspections','crew','crew_certs','surveyor_grants','sms_documents',
        'jobs','invoices'
      )
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I; create trigger set_updated_at before update on %I for each row execute function tg_set_updated_at();',
      t, t
    );
  end loop;
end $$;
