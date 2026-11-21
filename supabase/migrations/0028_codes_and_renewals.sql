-- CodedOK — which Code a vessel is under, and certificate renewal history.
--
-- vessels.code           'spv' (Sport or Pleasure Vessel Code 2025) or
--                        'workboat' (Workboat Code Edition 3). Both use area
--                        categories 0–6, so category stays as it is.
-- vessels.area_category  'cat0'…'cat6' for legacy rows whose category is
--                        just 'Workboat'.
-- certs.renewal_history  previous dates/number/issuer kept on each renewal.
-- certs.renewed_at       when the record was last renewed in the app.
--
-- Safe to re-run.

alter table public.vessels add column if not exists code text not null default 'spv';
alter table public.vessels add column if not exists area_category text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vessels_code_check') then
    alter table public.vessels add constraint vessels_code_check check (code in ('spv', 'workboat'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vessels_area_category_check') then
    alter table public.vessels add constraint vessels_area_category_check check (area_category is null or area_category ~ '^cat[0-6]$');
  end if;
end $$;

-- Rows already marked 'Workboat' are workboats.
update public.vessels set code = 'workboat' where category::text = 'Workboat' and code = 'spv';

alter table public.certs add column if not exists renewal_history jsonb not null default '[]'::jsonb;
alter table public.certs add column if not exists renewed_at timestamptz;
