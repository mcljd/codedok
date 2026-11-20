-- Adds 'support' to the user_kind enum so CodedOK support-team
-- accounts can be routed to the support console (s-support).
--
-- Prior version of this migration tried to drop/re-add a CHECK
-- constraint, which failed with "22P02: invalid input value for
-- enum user_kind" because users.kind is actually an enum type,
-- not a text column with a CHECK.
--
-- Postgres 12+ allows ALTER TYPE ... ADD VALUE to run inside a
-- transaction as long as the new value isn't used in that same
-- transaction. Supabase's SQL editor is fine with this. The
-- IF NOT EXISTS makes the migration idempotent — safe to re-run.

alter type user_kind add value if not exists 'support';

comment on type user_kind is
  'Account roles: operator (skipper), surveyor (marine surveyor), builder (boat builder), admin (Joseph/staff SMS review), support (CodedOK support-team user-management), crew (crew member).';
