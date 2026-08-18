-- Support-action audit log. Every mutating action taken through the
-- CodedOK support console (password reset, delete, ban, role change,
-- email change, verify, magic link) is recorded here with WHO did it,
-- to WHOM, and WHEN. This is the accountability backbone for the
-- internal admin tool — without it there's no way to answer "who
-- deleted this account?".
--
-- Written only by the admin-user-actions edge function using the
-- service role. No RLS policy grants INSERT to normal clients — the
-- service role bypasses RLS, and we never expose a client-writable
-- path to this table. Support users can READ it through the edge
-- function (which gates on kind), not directly.

create table if not exists public.support_audit_log (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  actor_email   text,                 -- the support agent who acted
  actor_auth_id uuid,                  -- their auth.users id
  action        text not null,        -- e.g. 'set_password', 'delete_user'
  target_email  text,                 -- the customer acted upon
  target_auth_id uuid,                 -- their auth.users id (if applicable)
  details       jsonb default '{}'::jsonb
);

create index if not exists support_audit_log_at_idx
  on public.support_audit_log (at desc);
create index if not exists support_audit_log_target_idx
  on public.support_audit_log (target_email);

-- Lock the table down: enable RLS with NO policies, so only the
-- service role (which bypasses RLS) can touch it. Belt-and-braces —
-- there's no client path to it anyway.
alter table public.support_audit_log enable row level security;

comment on table public.support_audit_log is
  'Immutable-by-convention log of every mutating action taken through the CodedOK support console. Written by the admin-user-actions edge function via the service role.';
