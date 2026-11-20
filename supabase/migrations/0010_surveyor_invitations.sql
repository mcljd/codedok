-- CodedOK — Real surveyor invite flow.
--
-- An operator generates an invitation row tied to a vessel + invited email.
-- The client shows the operator a copyable URL containing the token; the
-- operator sends that link via any channel (mail, SMS, WhatsApp). When the
-- surveyor opens it and signs in with the matching email, `accept_invitation`
-- creates a surveyor_grants row server-side and marks the invitation used.
--
-- No email provider needed. Idempotent: the function returns the existing
-- grant if one already covers this vessel + surveyor.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- invitations
-- ============================================================

create table if not exists invitations (
  id                  text primary key,
  token               uuid not null unique default extensions.gen_random_uuid(),
  vessel_id           text not null references vessels(id) on delete cascade,
  invited_email       text not null,
  invited_by_user_id  text not null references users(id) on delete cascade,
  scopes              text[] not null default array['view','deficiency','inspect','issue_cert'],
  expires_at          timestamptz not null default (now() + interval '14 days'),
  accepted_at         timestamptz,
  accepted_by_user_id text references users(id),
  created_at          timestamptz not null default now()
);

create index if not exists invitations_vessel_idx       on invitations(vessel_id);
create index if not exists invitations_inviter_idx      on invitations(invited_by_user_id);
create index if not exists invitations_invited_email_ix on invitations(lower(invited_email));

alter table invitations enable row level security;

-- Operators can create invitations for vessels in orgs they belong to.
drop policy if exists "invitations operator insert" on invitations;
create policy "invitations operator insert"
  on invitations for insert
  with check (
    invited_by_user_id in (select id from current_user_row())
    and vessel_id in (
      select v.id from vessels v
      where v.org_id in (select current_user_org_ids())
    )
  );

-- Operators can read + cancel their own invitations. Invited surveyors can
-- read invitations addressed to their email so the client can show context.
drop policy if exists "invitations inviter read" on invitations;
create policy "invitations inviter read"
  on invitations for select
  using (
    invited_by_user_id in (select id from current_user_row())
    or lower(invited_email) = lower(coalesce((select email from current_user_row()), ''))
  );

drop policy if exists "invitations inviter delete" on invitations;
create policy "invitations inviter delete"
  on invitations for delete
  using (invited_by_user_id in (select id from current_user_row()));

-- ============================================================
-- accept_invitation(p_token)
-- SECURITY DEFINER so the surveyor doesn't need direct INSERT
-- on surveyor_grants. Verifies the auth user's email matches
-- the invited address before granting.
-- ============================================================

create or replace function accept_invitation(p_token uuid)
returns surveyor_grants
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations;
  me  users;
  g   surveyor_grants;
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

  -- Idempotent: if an active grant already exists, return it and just
  -- mark the invitation accepted.
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

  return g;
end$$;

revoke all on function accept_invitation(uuid) from public;
grant execute on function accept_invitation(uuid) to authenticated;
