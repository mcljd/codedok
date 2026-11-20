-- CodedOK — Team invitations + business name capture + member permissions.
--
-- Extends the existing surveyor-invite flow so the same `invitations` row
-- type can also bring a teammate into an org (kind='team'). Adds a
-- permissions array on memberships so the owner can grant fine-grained
-- access (manage_vessels, manage_certs, etc.) per teammate.
-- Captures the operator's business name on the users row so the lazy-
-- org-on-first-vessel-add can name the org correctly.

-- ============================================================
-- users — business_name (operator's company name)
-- ============================================================

alter table users
  add column if not exists business_name text;

-- ============================================================
-- memberships — permissions array
-- ============================================================

alter table memberships
  add column if not exists permissions text[] not null default array['view_all'];

-- Owners get every permission. One-time fill so existing demo seed
-- doesn't lose access after the column is added.
update memberships
   set permissions = array['view_all','manage_vessels','manage_crew','manage_certs','manage_sms','manage_team']
 where role = 'owner';

-- ============================================================
-- invitations — extend for team-member invites
-- ============================================================

alter table invitations
  add column if not exists kind text not null default 'surveyor',
  add column if not exists org_id text references organizations(id) on delete cascade,
  add column if not exists permissions text[];

-- vessel_id was previously NOT NULL — relaxed because team invites
-- don't pin a vessel.
alter table invitations
  alter column vessel_id drop not null;

alter table invitations
  drop constraint if exists invitations_kind_check;
alter table invitations
  add constraint invitations_kind_check
    check (kind in ('surveyor', 'team'));

-- Shape integrity: surveyor invites must have a vessel; team invites
-- must have an org and permissions.
alter table invitations
  drop constraint if exists invitations_shape_check;
alter table invitations
  add constraint invitations_shape_check check (
    (kind = 'surveyor' and vessel_id is not null)
    or (kind = 'team'  and org_id is not null and permissions is not null)
  );

-- Insert policy needs to allow both shapes.
drop policy if exists "invitations operator insert" on invitations;
create policy "invitations operator insert"
  on invitations for insert
  with check (
    invited_by_user_id in (select id from current_user_row())
    and (
      (kind = 'surveyor' and vessel_id in (
        select v.id from vessels v
        where v.org_id in (select current_user_org_ids())
      ))
      or
      (kind = 'team' and org_id in (select current_user_org_ids()))
    )
  );

-- ============================================================
-- accept_invitation — broaden to handle both kinds.
-- Returns jsonb so the same RPC can describe either result shape.
-- ============================================================

drop function if exists accept_invitation(uuid);

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

    return jsonb_build_object(
      'kind', 'surveyor',
      'vessel_id', g.vessel_id,
      'grant_id', g.id
    );
  end if;

  -- kind = 'team' — add the user as a member of the inviter's org.
  select * into m
  from memberships
  where org_id = inv.org_id and user_id = me.id
  limit 1;

  if not found then
    insert into memberships (org_id, user_id, role, permissions)
    values (inv.org_id, me.id, 'member', inv.permissions)
    returning * into m;
  else
    -- Already a member — refresh permissions to whatever the invite says.
    update memberships
       set permissions = inv.permissions
     where org_id = m.org_id and user_id = m.user_id
    returning * into m;
  end if;

  update invitations
     set accepted_at = coalesce(accepted_at, now()),
         accepted_by_user_id = me.id
   where id = inv.id;

  return jsonb_build_object(
    'kind', 'team',
    'org_id', m.org_id,
    'permissions', m.permissions
  );
end$$;

revoke all on function accept_invitation(uuid) from public;
grant execute on function accept_invitation(uuid) to authenticated;

-- ============================================================
-- memberships — let owners see and manage the whole team.
-- ============================================================

drop policy if exists "memberships owner manage" on memberships;
create policy "memberships owner manage"
  on memberships for all
  using (
    org_id in (
      select m.org_id from memberships m
      where m.user_id in (select id from current_user_row())
        and m.role = 'owner'
    )
  )
  with check (
    org_id in (
      select m.org_id from memberships m
      where m.user_id in (select id from current_user_row())
        and m.role = 'owner'
    )
  );
