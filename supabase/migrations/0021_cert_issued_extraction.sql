-- Adds the two cert/equipment fields the client already captures but had
-- no column for, so they were being stripped before sync and never
-- reached the cloud:
--
--   certs.issued_at    — the certificate's issue date (the client form
--                        collects it; expiry already had a column).
--   certs.extraction   — the AI extraction + human-override audit blob
--                        (raw values the vision model returned vs. what
--                        the operator saved). Answers "did the AI get it
--                        right or did the operator correct it?" later.
--   equipment.extraction — same audit blob for equipment service docs.
--
-- The actual scan/PDF (the `file` field) still stays on-device for now —
-- it belongs in the private cert-files Storage bucket (see 0014), which
-- is a separate wiring job. Everything else on a cert now syncs.
--
-- All idempotent — safe to run more than once.

alter table certs     add column if not exists issued_at  date;
alter table certs     add column if not exists extraction jsonb;
alter table equipment add column if not exists extraction jsonb;

comment on column certs.extraction is
  'AI extraction + human-override audit for certs added via the vision scanner. {raw, saved, overrides, confidence, receivedAt}.';
comment on column equipment.extraction is
  'AI extraction + human-override audit for equipment added via the vision scanner.';
