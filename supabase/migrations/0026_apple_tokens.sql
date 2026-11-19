-- CodedOK — Sign in with Apple refresh tokens.
--
-- App Store rule 5.1.1(v): when someone who signed in with Apple deletes their
-- account we must revoke their Apple token. Apple only lets us do that with the
-- refresh token we get by exchanging the sign-in authorization code, so the
-- apple-link edge function stores it here and delete-account reads it.
--
-- RLS is ON with NO policies: nothing but the service role can read or write it.

create table if not exists public.apple_tokens (
  auth_user_id  uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;
revoke all on public.apple_tokens from anon, authenticated;
