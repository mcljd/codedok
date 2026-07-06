-- Adds 'support' as a valid users.kind value so the CodedOK support
-- team can sign in through the normal auth flow and be routed to the
-- support console (s-support) automatically.
--
-- The gate itself lives in the `admin-user-actions` Supabase Edge
-- Function (deploy separately). This migration just widens the
-- allowed values.

-- Drop the CHECK constraint if it exists and re-add with 'support'.
do $$
begin
  if exists (select 1 from information_schema.check_constraints
             where constraint_name = 'users_kind_check') then
    alter table public.users drop constraint users_kind_check;
  end if;
end$$;

alter table public.users
  add constraint users_kind_check
  check (kind in ('operator','surveyor','builder','admin','support','crew'));

comment on constraint users_kind_check on public.users is
  'Roles: operator (skipper), surveyor (marine surveyor), builder (boat builder), admin (Joseph/staff SMS review), support (CodedOK support-team user-management), crew (crew member).';
