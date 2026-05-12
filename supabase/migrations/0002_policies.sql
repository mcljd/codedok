-- CodedOK — Row-Level Security policies
--
-- Model:
--   - Each user row links to an auth.users row via auth_user_id
--   - Org members see their org's data
--   - Surveyors see vessels they have a non-revoked grant on
--   - Builders see vessels they built (built_by = their slug)
--   - Admins see everything
--
-- Run after schema.sql.

-- ============================================================
-- Enable RLS on everything
-- ============================================================

alter table users          enable row level security;
alter table organizations  enable row level security;
alter table memberships    enable row level security;
alter table vessels        enable row level security;
alter table certs          enable row level security;
alter table equipment      enable row level security;
alter table deficiencies   enable row level security;
alter table inspections    enable row level security;
alter table crew           enable row level security;
alter table crew_certs     enable row level security;
alter table surveyor_grants enable row level security;
alter table sms_documents  enable row level security;
alter table jobs           enable row level security;
alter table invoices       enable row level security;
alter table action_log     enable row level security;

-- ============================================================
-- Helpers
-- ============================================================

-- IMPORTANT: helpers MUST be `security definer` with a pinned search_path,
-- otherwise the policies that call them recurse back through the users
-- table and Postgres aborts with "infinite recursion detected in policy
-- for relation 'users'".
create or replace function current_user_row()
returns setof users
language sql
security definer
set search_path = public
stable
as $$
  select * from users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function current_kind()
returns user_kind
language sql
security definer
set search_path = public
stable
as $$
  select kind from users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function current_user_org_ids()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select m.org_id
  from memberships m
  join users u on u.id = m.user_id
  where u.auth_user_id = auth.uid();
$$;

create or replace function current_surveyor_vessel_ids()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select g.vessel_id
  from surveyor_grants g
  join users u on u.id = g.surveyor_user_id
  where u.auth_user_id = auth.uid() and g.revoked_at is null;
$$;

create or replace function current_builder_slug()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select (builder->>'slug')
  from users
  where auth_user_id = auth.uid() and kind = 'builder'
  limit 1;
$$;

-- ============================================================
-- Users
-- ============================================================

-- Anyone signed in can read their own row
create policy "users self read"
  on users for select
  using (auth_user_id = auth.uid());

-- Surveyors can read operator profiles for vessels they're granted to
create policy "users surveyor read clients"
  on users for select
  using (
    current_kind() = 'surveyor' and id in (
      select m.user_id from memberships m
      where m.org_id in (
        select v.org_id from vessels v where v.id in (select current_surveyor_vessel_ids())
      )
    )
  );

-- Admin sees all
create policy "users admin read all"
  on users for select using (current_kind() = 'admin');

-- Self-update only (kind change blocked at the column level if needed)
create policy "users self update"
  on users for update
  using (auth_user_id = auth.uid());

-- ============================================================
-- Organizations + Memberships
-- ============================================================

create policy "orgs member read"
  on organizations for select
  using (id in (select current_user_org_ids()));

create policy "orgs admin read all"
  on organizations for select using (current_kind() = 'admin');

create policy "memberships self read"
  on memberships for select
  using (
    user_id in (select id from users where auth_user_id = auth.uid())
    or org_id in (select current_user_org_ids())
  );

-- ============================================================
-- Vessels
-- ============================================================

create policy "vessels org read"
  on vessels for select
  using (org_id in (select current_user_org_ids()));

create policy "vessels surveyor read"
  on vessels for select
  using (id in (select current_surveyor_vessel_ids()));

create policy "vessels builder read"
  on vessels for select
  using (current_kind() = 'builder' and built_by = current_builder_slug());

create policy "vessels admin all"
  on vessels for all using (current_kind() = 'admin');

create policy "vessels org write"
  on vessels for all
  using (org_id in (select current_user_org_ids()))
  with check (org_id in (select current_user_org_ids()));

-- ============================================================
-- Vessel-scoped tables: certs / equipment / deficiencies / inspections
-- (Same access pattern: anyone who can see the vessel, can see its data.)
-- ============================================================

-- Macro to apply identical policies to multiple child tables
do $$
declare
  t text;
begin
  for t in select unnest(array['certs','equipment','deficiencies','inspections']) loop
    execute format($f$
      create policy "%1$s org access"
        on %1$I for all
        using (vessel_id in (select id from vessels where org_id in (select current_user_org_ids())))
        with check (vessel_id in (select id from vessels where org_id in (select current_user_org_ids())));

      create policy "%1$s surveyor read"
        on %1$I for select
        using (vessel_id in (select current_surveyor_vessel_ids()));

      create policy "%1$s builder read"
        on %1$I for select
        using (current_kind() = 'builder' and vessel_id in (
          select id from vessels where built_by = current_builder_slug()
        ));

      create policy "%1$s admin all"
        on %1$I for all using (current_kind() = 'admin');
    $f$, t);
  end loop;
end $$;

-- Surveyors can also raise deficiencies + log inspections on vessels they're granted
create policy "deficiencies surveyor write"
  on deficiencies for insert
  with check (vessel_id in (select current_surveyor_vessel_ids()));

create policy "inspections surveyor write"
  on inspections for all
  using (vessel_id in (select current_surveyor_vessel_ids()))
  with check (vessel_id in (select current_surveyor_vessel_ids()));

-- ============================================================
-- Crew
-- ============================================================

create policy "crew org access"
  on crew for all
  using (org_id in (select current_user_org_ids()))
  with check (org_id in (select current_user_org_ids()));

create policy "crew certs org access"
  on crew_certs for all
  using (person_id in (
    select id from crew where org_id in (select current_user_org_ids())
  ))
  with check (person_id in (
    select id from crew where org_id in (select current_user_org_ids())
  ));

-- ============================================================
-- Surveyor grants
-- ============================================================

create policy "grants org manage"
  on surveyor_grants for all
  using (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ))
  with check (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ));

create policy "grants surveyor read"
  on surveyor_grants for select
  using (
    surveyor_user_id in (select id from users where auth_user_id = auth.uid())
  );

-- ============================================================
-- SMS documents
-- ============================================================

create policy "sms org access"
  on sms_documents for all
  using (org_id in (select current_user_org_ids()))
  with check (org_id in (select current_user_org_ids()));

create policy "sms surveyor read"
  on sms_documents for select
  using (vessel_id in (select current_surveyor_vessel_ids()));

create policy "sms surveyor sign"
  on sms_documents for update
  using (vessel_id in (select current_surveyor_vessel_ids()))
  with check (vessel_id in (select current_surveyor_vessel_ids()));

-- ============================================================
-- Jobs + invoices (visible to operator org + assigned surveyor)
-- ============================================================

create policy "jobs operator access"
  on jobs for all
  using (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ))
  with check (vessel_id in (
    select id from vessels where org_id in (select current_user_org_ids())
  ));

create policy "jobs surveyor read"
  on jobs for select
  using (
    surveyor_user_id in (select id from users where auth_user_id = auth.uid())
  );

create policy "jobs surveyor update"
  on jobs for update
  using (
    surveyor_user_id in (select id from users where auth_user_id = auth.uid())
  );

create policy "invoices operator access"
  on invoices for select
  using (org_id in (select current_user_org_ids()));

create policy "invoices surveyor access"
  on invoices for all
  using (
    surveyor_user_id in (select id from users where auth_user_id = auth.uid())
  );

-- ============================================================
-- Public surveyor SMS share — opens by token, no login
-- ============================================================
-- Note: this is enforced by an Edge Function or a separate
-- anon-role lookup, not by RLS. We don't grant anon select on
-- sms_documents — token resolution goes through a server-side
-- function that returns only the redacted view.
