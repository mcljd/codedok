-- ═══════════════════════════════════════════════════════════════
-- Pre-trial security gates. Closes two cross-tenant escalation paths
-- found in the pre-trial security review. BOTH are mandatory before
-- real customer data goes in — each let a self-service signup read
-- and write every other customer's data.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- GATE 1 — nobody but the service role may set/change users.kind.
--
-- Attack it closes: user_metadata.kind is attacker-controlled
-- (anyone can auth.signUp with options.data.kind='admin'). The old
-- "users self update" policy had no WITH CHECK on the kind column,
-- so a user could UPDATE their own row to kind='admin' and then
-- satisfy every "* admin all" policy — full read/write of all orgs.
--
-- This trigger reverts any privileged kind coming from an
-- authenticated/anon caller. Privileged roles are ONLY ever set by
-- the service role: the support-console edge function (which uses
-- the service_role key) or the SQL editor (direct DB, no JWT).
-- ───────────────────────────────────────────────────────────────
create or replace function public.guard_user_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Empty/null for direct SQL (service context); the JWT role claim
  -- for API requests. service_role JWTs carry role='service_role'.
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  -- Trusted callers (service role, or direct SQL with no JWT) may
  -- set any kind.
  if jwt_role is null or jwt_role = 'service_role' then
    return new;
  end if;

  -- Untrusted callers (authenticated / anon) can never mint a
  -- privileged role, and can never change kind at all client-side.
  if tg_op = 'INSERT' then
    if new.kind in ('admin', 'support') then
      new.kind := 'operator';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind then
      new.kind := old.kind;   -- silently revert any client kind change
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_kind_trg on public.users;
create trigger guard_user_kind_trg
  before insert or update on public.users
  for each row execute function public.guard_user_kind();

-- ───────────────────────────────────────────────────────────────
-- GATE 2 — you can only self-insert a membership for an org you own
-- OR a brand-new (unclaimed) org you're bootstrapping.
--
-- Attack it closes: the old "memberships self insert" policy only
-- checked that user_id was the caller's own — NOT that the org_id
-- belonged to them. Any authenticated user could
-- INSERT INTO memberships (org_id=<victim>, user_id=self,
-- role='owner') and instantly gain the victim org's vessels, certs,
-- crew, inspections — read and write.
--
-- Legit onboarding still works: a new operator's org has zero
-- memberships at the moment their owner-membership is created
-- (org_is_unclaimed → true). Team members join via accept_invitation
-- (SECURITY DEFINER, which bypasses this policy), never a raw insert.
-- ───────────────────────────────────────────────────────────────
create or replace function public.org_is_unclaimed(p_org text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (select 1 from memberships where org_id = p_org);
$$;

drop policy if exists "memberships self insert" on memberships;
create policy "memberships self insert"
  on memberships for insert
  with check (
    user_id in (select id from current_user_row())
    and (
      org_id in (select current_owner_org_ids())
      or public.org_is_unclaimed(org_id)
    )
  );

comment on function public.guard_user_kind is
  'Reverts any attempt by a non-service-role caller to set/change users.kind to a privileged value. Privileged roles are service-role-only.';
comment on function public.org_is_unclaimed is
  'True if an org has no memberships yet (bootstrap window). Used by the memberships self-insert policy to block joining a populated org.';
