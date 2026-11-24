-- CodedOK — security event log and email alerts.
--
-- Records the things worth knowing about and emails hello@codedok.com
-- (through the security-alert edge function):
--   * blocked attempts to gain admin/support rights, re-link a profile to
--     another login, or self-assign a paid plan (the guards already block
--     these; now they are also recorded);
--   * admin/support rights actually being granted by a trusted caller;
--   * an hourly scan for sign-up floods, waitlist floods and heavy AI use.
--
-- Idempotent — safe to re-run.

create table if not exists public.security_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  kind        text not null,
  severity    text not null default 'high' check (severity in ('high', 'info')),
  detail      jsonb not null default '{}'::jsonb,
  notified_at timestamptz
);
create index if not exists security_events_pending_idx on public.security_events (at) where notified_at is null;
create index if not exists security_events_at_idx on public.security_events (at);

-- Server-only: RLS on with no policies, and no table privileges for API roles.
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;

-- Record an event. Never raises (a logging problem must not break the
-- statement that triggered it) and stops at 200 events an hour so an
-- attacker cannot fill the table.
create or replace function public.log_security_event(p_kind text, p_severity text, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.security_events where at > now() - interval '1 hour') >= 200 then
    return;
  end if;
  insert into public.security_events (kind, severity, detail)
  values (left(p_kind, 60), case when p_severity = 'info' then 'info' else 'high' end, coalesce(p_detail, '{}'::jsonb));
exception when others then
  null;
end;
$$;
revoke all on function public.log_security_event(text, text, jsonb) from public, anon, authenticated;

-- Ask the edge function to email whatever is pending.
create or replace function public.tg_security_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://zftoqqrqsxctehltebad.supabase.co/functions/v1/security-alert',
      body := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke all on function public.tg_security_alert() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'security_alert' and tgrelid = 'public.security_events'::regclass) then
    create trigger security_alert after insert on public.security_events
      for each statement execute function public.tg_security_alert();
  end if;
end $$;

-- ── Guards: same rules as before, now also recording what they block ──────

create or replace function public.guard_user_kind()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claims   jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  jwt_role text  := claims ->> 'role';
  jwt_mail text  := nullif(lower(claims ->> 'email'), '');
begin
  -- Trusted callers (service role, or direct SQL with no JWT) may set anything.
  if jwt_role is null or jwt_role = 'service_role' then
    if new.kind in ('admin', 'support') and (tg_op = 'INSERT' or new.kind is distinct from old.kind) then
      perform public.log_security_event('admin_granted', 'high',
        jsonb_build_object('user', new.id, 'email', new.email, 'rights', new.kind::text));
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Privileged and builder kinds are granted by support only.
    if new.kind in ('admin', 'support', 'builder') then
      perform public.log_security_event('privilege_attempt', 'high',
        jsonb_build_object('login', claims ->> 'sub', 'email', jwt_mail, 'asked_for', new.kind::text));
      new.kind := 'operator';
    end if;
    new.builder := null;
    if jwt_mail is not null then new.email := jwt_mail; end if;
  elsif tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind then
      perform public.log_security_event('privilege_attempt', 'high',
        jsonb_build_object('user', old.id, 'email', old.email, 'asked_for', new.kind::text));
      new.kind := old.kind;          -- silently revert any client kind change
    end if;
    new.builder := old.builder;      -- builder slug grants cross-org read
    -- Email always tracks the verified login email (or stays as it was).
    new.email := coalesce(jwt_mail, old.email);
    if new.auth_user_id is distinct from old.auth_user_id then
      perform public.log_security_event('account_link_tamper', 'high',
        jsonb_build_object('user', old.id, 'email', old.email));
    end if;
    new.auth_user_id := old.auth_user_id;
  end if;
  return new;
end;
$function$;

create or replace function public.guard_org_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
  if jwt_role is null or jwt_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan is null or new.plan not in ('trial', 'solo') then new.plan := 'trial'; end if;
    new.plan_source := null;
    new.plan_expires_at := null;
    new.trial_ends_at := least(coalesce(new.trial_ends_at, current_date + 14), current_date + 14);
  elsif tg_op = 'UPDATE' then
    -- Clients may only move between the free plans.
    if new.plan is distinct from old.plan and (new.plan is null or new.plan not in ('trial', 'solo')) then
      perform public.log_security_event('plan_tamper_attempt', 'high',
        jsonb_build_object('organisation', old.id, 'name', old.name, 'asked_for', new.plan::text));
      new.plan := old.plan;
    end if;
    new.plan_source := old.plan_source;
    new.plan_expires_at := old.plan_expires_at;
    new.trial_ends_at := old.trial_ends_at;
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_user_kind() from public, anon, authenticated;
revoke all on function public.guard_org_plan() from public, anon, authenticated;

-- ── Hourly scan for things no single statement reveals ────────────────────

create or replace function public.security_scan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
  r record;
begin
  select count(*) into n from auth.users where created_at > now() - interval '1 hour';
  if n > 15 and not exists (select 1 from public.security_events where kind = 'signup_burst' and at > now() - interval '6 hours') then
    perform public.log_security_event('signup_burst', 'high', jsonb_build_object('new_accounts_last_hour', n));
  end if;

  select count(*) into n from public.waitlist where created_at > now() - interval '1 hour';
  if n > 30 and not exists (select 1 from public.security_events where kind = 'waitlist_flood' and at > now() - interval '6 hours') then
    perform public.log_security_event('waitlist_flood', 'high', jsonb_build_object('sign_ups_last_hour', n));
  end if;

  for r in
    select l.auth_user_id, count(*) as calls
    from public.ai_usage_log l
    where l.at > now() - interval '24 hours'
    group by l.auth_user_id
    having count(*) > 100
  loop
    if not exists (select 1 from public.security_events
                   where kind = 'ai_usage_high' and at > now() - interval '24 hours'
                     and detail ->> 'login' = r.auth_user_id::text) then
      perform public.log_security_event('ai_usage_high', 'high',
        jsonb_build_object('login', r.auth_user_id::text, 'ai_calls_last_24h', r.calls));
    end if;
  end loop;

  -- Keep a year of history.
  delete from public.security_events where at < now() - interval '365 days';

  -- Nudge the mailer in case anything is still pending (e.g. it was throttled).
  if exists (select 1 from public.security_events where notified_at is null) then
    begin
      perform net.http_post(
        url := 'https://zftoqqrqsxctehltebad.supabase.co/functions/v1/security-alert',
        body := '{}'::jsonb,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        timeout_milliseconds := 10000
      );
    exception when others then
      null;
    end;
  end if;
end;
$$;
revoke all on function public.security_scan() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'codedok-security-scan') then
    perform cron.schedule('codedok-security-scan', '17 * * * *', 'select public.security_scan()');
  end if;
end $$;
