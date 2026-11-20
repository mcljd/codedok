-- Per-user rate limiting for the paid AI endpoints (extract-cert,
-- generate-sms). verify_jwt only proves the caller is *some* signed-in
-- user — it does not stop that user looping the endpoint and running up
-- the Anthropic bill. This table is the counter: each call logs a row,
-- and the function rejects (429) once a user is over their rolling-24h
-- cap. Written only by the edge functions via the service role.
--
-- Idempotent — safe to re-run.

create table if not exists public.ai_usage_log (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  fn           text not null,     -- 'extract-cert' | 'generate-sms'
  at           timestamptz not null default now()
);

create index if not exists ai_usage_log_lookup
  on public.ai_usage_log (auth_user_id, fn, at desc);

-- Service-role only. RLS on, no policies → no client can read or write it.
alter table public.ai_usage_log enable row level security;

comment on table public.ai_usage_log is
  'One row per paid-AI-endpoint call, keyed by auth user. Backs the per-user daily rate limit in extract-cert / generate-sms. Service-role write only.';
