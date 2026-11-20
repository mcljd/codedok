-- CodedOK — pre-launch "founding list" (App Store waitlist) with referrals.
--
-- The public /founding page calls two RPCs with the anon key. The table
-- itself has RLS on and NO policies, so nobody can read or write it
-- directly from the browser — only through these functions, which only
-- ever return the caller's own referral code, place and referral count
-- (plus a public total for social proof). Read the list yourself in the
-- Supabase table editor or SQL editor (service role bypasses RLS).
--
-- Idempotent — safe to re-run.

create table if not exists public.waitlist (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  email_lc          text generated always as (lower(btrim(email))) stored,
  ref_code          text not null unique,          -- public: goes in their share link
  edit_token        uuid not null default gen_random_uuid(), -- private: lets the page save step-2 answers
  referred_by       text,                          -- ref_code of whoever sent them
  role              text,
  boat_count        text,
  region            text,
  marketing_consent boolean not null default false,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_content       text,
  utm_term          text,
  fbclid            text,
  landing_path      text,
  created_at        timestamptz not null default now()
);

create unique index if not exists waitlist_email_lc_uq on public.waitlist (email_lc);
create index if not exists waitlist_referred_by_idx on public.waitlist (referred_by);
create index if not exists waitlist_created_idx on public.waitlist (created_at);

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;

-- Place in the queue: signups ahead of you, minus 10 places per referral.
create or replace function public.waitlist_place(p_id uuid)
returns table (place int, referrals int)
language sql stable security definer set search_path = public as $$
  with me as (select id, created_at, ref_code from waitlist where id = p_id),
       refs as (select count(*)::int n from waitlist w, me where w.referred_by = me.ref_code)
  select greatest(1, (select count(*) from waitlist w, me where w.created_at < me.created_at)::int + 1 - refs.n * 10),
         refs.n
  from refs;
$$;
revoke all on function public.waitlist_place(uuid) from public, anon, authenticated;

create or replace function public.join_waitlist(
  p_email    text,
  p_ref      text    default null,
  p_consent  boolean default false,
  p_utm      jsonb   default '{}'::jsonb,
  p_fbclid   text    default null,
  p_path     text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_row   waitlist%rowtype;
  v_code  text;
  v_place int;
  v_refs  int;
  v_new   boolean := false;
begin
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  select * into v_row from waitlist where email_lc = v_email;

  if not found then
    loop
      v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
      exit when not exists (select 1 from waitlist where ref_code = v_code);
    end loop;

    insert into waitlist (email, ref_code, referred_by, marketing_consent,
                          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                          fbclid, landing_path)
    values (
      v_email, v_code,
      -- Only credit a real, existing code (and never yourself).
      (select ref_code from waitlist where ref_code = upper(left(btrim(coalesce(p_ref, '')), 12))),
      coalesce(p_consent, false),
      left(p_utm->>'utm_source', 100), left(p_utm->>'utm_medium', 100),
      left(p_utm->>'utm_campaign', 150), left(p_utm->>'utm_content', 150),
      left(p_utm->>'utm_term', 150),
      left(p_fbclid, 500), left(p_path, 200)
    )
    on conflict (email_lc) do nothing
    returning * into v_row;

    if v_row.id is null then  -- lost a race with an identical signup
      select * into v_row from waitlist where email_lc = v_email;
    else
      v_new := true;
    end if;
  elsif p_consent and not v_row.marketing_consent then
    update waitlist set marketing_consent = true where id = v_row.id;
  end if;

  select place, referrals into v_place, v_refs from waitlist_place(v_row.id);

  return jsonb_build_object(
    'ok', true,
    'already', not v_new,
    'ref_code', v_row.ref_code,
    -- Only a brand-new signup gets the private token for the optional
    -- "tell us about your boats" step.
    'edit_token', case when v_new then v_row.edit_token::text end,
    'place', v_place,
    'referrals', v_refs
  );
end;
$$;

create or replace function public.update_waitlist_profile(
  p_token      uuid,
  p_role       text default null,
  p_boat_count text default null,
  p_region     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update waitlist set
    role       = coalesce(left(p_role, 60), role),
    boat_count = coalesce(left(p_boat_count, 20), boat_count),
    region     = coalesce(left(p_region, 60), region)
  where edit_token = p_token;
  return jsonb_build_object('ok', found);
end;
$$;

-- Public total, for "Join N skippers already on the list".
create or replace function public.waitlist_total()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from waitlist;
$$;

revoke all on function public.join_waitlist(text, text, boolean, jsonb, text, text) from public;
revoke all on function public.update_waitlist_profile(uuid, text, text, text) from public;
revoke all on function public.waitlist_total() from public;
grant execute on function public.join_waitlist(text, text, boolean, jsonb, text, text) to anon, authenticated;
grant execute on function public.update_waitlist_profile(uuid, text, text, text) to anon, authenticated;
grant execute on function public.waitlist_total() to anon, authenticated;

comment on table public.waitlist is
  'Pre-launch founding list from /founding. RLS on, no policies: browser access only via join_waitlist / update_waitlist_profile / waitlist_total.';
