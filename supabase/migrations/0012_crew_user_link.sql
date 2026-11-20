-- CodedOK — Link crew records to user accounts.
--
-- A crew row (the person on the vessel) is created by the operator;
-- a memberships row is created when that person accepts a team invite.
-- This migration ties them together so the crew member can sign in,
-- see their own qualifications, and the operator sees who has accepted.
--
-- Auto-link happens inside accept_invitation: on a team invite, if the
-- org has a crew row with the same email and no user_id yet, we set
-- crew.user_id = the accepting user.

-- ============================================================
-- crew — email + user_id
-- ============================================================

alter table crew
  add column if not exists email   text,
  add column if not exists user_id text references users(id) on delete set null;

create index if not exists crew_email_idx   on crew(lower(email));
create index if not exists crew_user_id_idx on crew(user_id);

-- A user can read their own crew row. The existing org-member policy
-- already lets the operator read everyone's crew rows; this just adds
-- the self path so a crew member who isn't an admin can still see
-- themselves on a single-row policy match.
drop policy if exists "crew self read" on crew;
create policy "crew self read"
  on crew for select
  using (user_id in (select id from current_user_row()));

-- Same for crew_certs — a user can read certs attached to their own
-- crew row. The operator already has the org-membership policy.
drop policy if exists "crew_certs self read" on crew_certs;
create policy "crew_certs self read"
  on crew_certs for select
  using (
    person_id in (
      select id from crew where user_id in (select id from current_user_row())
    )
  );

-- Self-update: a crew member can update their own crew row (e.g. to
-- change their stored phone number). Cannot reassign user_id or org_id.
drop policy if exists "crew self update" on crew;
create policy "crew self update"
  on crew for update
  using (user_id in (select id from current_user_row()))
  with check (user_id in (select id from current_user_row()));

-- Self-insert + self-update on their own crew_certs. The operator can
-- still do everything via the existing org-membership policies.
drop policy if exists "crew_certs self write" on crew_certs;
create policy "crew_certs self write"
  on crew_certs for all
  using (
    person_id in (
      select id from crew where user_id in (select id from current_user_row())
    )
  )
  with check (
    person_id in (
      select id from crew where user_id in (select id from current_user_row())
    )
  );

-- ============================================================
-- accept_invitation — link crew row on team accept.
-- We branch the team path: after creating the membership, look for a
-- crew row in the org with matching email and an empty user_id, then
-- set its user_id to the accepting user.
-- ============================================================

create or replace function accept_invitation(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations;
  me  users;
  g   surveyor_grants;
  m   memberships;
  linked_crew crew;
begin
  select * into inv from invitations where token = p_token;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if inv.expires_at < now() then
    raise exception 'invitation expired' using errcode = 'P0001';
  end if;

  select * into me from users where auth_user_id = auth.uid();
  if not found then
    raise exception 'sign in to accept invitation' using errcode = '42501';
  end if;
  if lower(me.email) <> lower(inv.invited_email) then
    raise exception 'invitation was sent to %, not the signed-in account', inv.invited_email
      using errcode = '42501';
  end if;

  if inv.kind = 'surveyor' then
    select * into g
    from surveyor_grants
    where vessel_id = inv.vessel_id
      and surveyor_user_id = me.id
      and revoked_at is null
    limit 1;
    if not found then
      insert into surveyor_grants (id, vessel_id, surveyor_user_id, granted_by, scopes)
      values (
        'sg_' || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 12),
        inv.vessel_id, me.id, inv.invited_by_user_id, inv.scopes
      )
      returning * into g;
    end if;
    update invitations
       set accepted_at = coalesce(accepted_at, now()),
           accepted_by_user_id = me.id
     where id = inv.id;
    return jsonb_build_object('kind', 'surveyor', 'vessel_id', g.vessel_id, 'grant_id', g.id);
  end if;

  -- kind = 'team'
  select * into m from memberships where org_id = inv.org_id and user_id = me.id limit 1;
  if not found then
    insert into memberships (org_id, user_id, role, permissions)
    values (inv.org_id, me.id, 'member', inv.permissions)
    returning * into m;
  else
    update memberships
       set permissions = inv.permissions
     where org_id = m.org_id and user_id = m.user_id
    returning * into m;
  end if;

  -- Auto-link to a crew row if the operator pre-added one with the
  -- same email. Only links rows without an existing user_id so we
  -- don't steal someone else's link.
  update crew
     set user_id = me.id
   where org_id = inv.org_id
     and lower(coalesce(email, '')) = lower(me.email)
     and user_id is null
  returning * into linked_crew;

  update invitations
     set accepted_at = coalesce(accepted_at, now()),
         accepted_by_user_id = me.id
   where id = inv.id;

  return jsonb_build_object(
    'kind', 'team',
    'org_id', m.org_id,
    'permissions', m.permissions,
    'crew_id', linked_crew.id
  );
end$$;

revoke all on function accept_invitation(uuid) from public;
grant execute on function accept_invitation(uuid) to authenticated;
