-- CodedOK — email the team when someone joins the founding list.
--
-- A trigger on public.waitlist calls the waitlist-notify edge function with
-- the new row's id. The function looks the row up itself and sends one email
-- to hello@codedok.com. notified_at records that it was sent.
--
-- Idempotent — safe to re-run.

alter table public.waitlist add column if not exists notified_at timestamptz;

create or replace function public.tg_waitlist_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Never let a notification problem block a sign-up.
  begin
    perform net.http_post(
      url := 'https://zftoqqrqsxctehltebad.supabase.co/functions/v1/waitlist-notify',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function public.tg_waitlist_notify() from public, anon, authenticated;

drop trigger if exists waitlist_notify on public.waitlist;
create trigger waitlist_notify
  after insert on public.waitlist
  for each row execute function public.tg_waitlist_notify();
