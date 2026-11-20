-- CodedOK — native push device tokens (APNs / FCM).
--
-- Web push uses push_subscriptions (endpoint + VAPID keys). Native iOS
-- and Android push use an opaque device token issued by APNs/FCM instead,
-- which doesn't fit that shape — so native tokens live here. The
-- send-reminders edge function fans out to BOTH tables.
--
-- RLS mirrors push_subscriptions: a user may only see/manage their own
-- device rows; the edge function reads all via the service-role key.

create table if not exists device_push_tokens (
  id           text primary key,
  user_id      text not null references users(id) on delete cascade,
  platform     text not null default 'ios'
               check (platform in ('ios', 'android')),
  token        text not null,
  -- 'prod' (api.push.apple.com) or 'sandbox' (api.sandbox.push.apple.com).
  -- A development/TestFlight build registers against the sandbox gateway;
  -- an App Store build against prod. Stored so the sender targets the
  -- right APNs host per device.
  environment  text not null default 'prod'
               check (environment in ('prod', 'sandbox')),
  app_version  text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One row per physical device token.
create unique index if not exists device_push_tokens_token_uq
  on device_push_tokens(token);
create index if not exists device_push_tokens_user_idx
  on device_push_tokens(user_id);

alter table device_push_tokens enable row level security;

drop policy if exists "device_push_tokens self all" on device_push_tokens;
create policy "device_push_tokens self all"
  on device_push_tokens for all
  using (user_id in (select id from current_user_row()))
  with check (user_id in (select id from current_user_row()));

-- The edge function writes/prunes via the service-role key (bypasses RLS).
