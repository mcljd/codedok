// CodedOK — Supabase Edge Function: weekly-report
//
// Emails a short plain-text launch report every Monday: waitlist sign-ups
// this week against last week, the total, sign-ups by source, and app
// accounts. No AI. Read-only: the only database call is the
// weekly_report_data() function (migration 0032), which runs SELECTs and
// nothing else.
//
// Only the scheduled job may call it. The caller must send the shared secret
// in the x-report-secret header; without WEEKLY_REPORT_SECRET set the
// function refuses every call.
//
// Edge function errors are NOT in the report. Supabase only exposes function
// logs through its management API, which needs an account-wide access token;
// that is deliberately not stored here. The email says so.
//
// Secrets (set with `supabase secrets set`, never in code):
//   WEEKLY_REPORT_SECRET — shared with the cron job (also stored in Vault)
//   RESEND_API_KEY       — Resend key
//   RESEND_FROM          — optional, default 'CodedOK <reminders@codedok.com>'
//   WEEKLY_REPORT_TO     — optional, default 'joseph@jdmcl.com'
//
// Manual test: add ?dry_run=1 to get the report text back without emailing.

import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Compare in constant time so the secret cannot be guessed a character at a time.
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });

function change(now: number, before: number): string {
  if (before === 0) return now === 0 ? "no change" : "up from 0";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "no change" : `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}%`;
}

type Count = { source?: string; campaign?: string; kind?: string; count: number };

function buildReport(d: any): { subject: string; text: string } {
  const w = d.waitlist, a = d.accounts;
  const lines: string[] = [];
  lines.push(`CodedOK weekly report`);
  lines.push(`${day(d.week_start)} to ${day(d.generated_at)}`);
  lines.push("");
  lines.push("WAITLIST");
  lines.push(`This week:  ${w.this_week}`);
  lines.push(`Last week:  ${w.last_week}  (${change(w.this_week, w.last_week)})`);
  lines.push(`Total:      ${w.total}`);
  lines.push(`Agreed to updates: ${w.consented_total} of ${w.total}`);
  lines.push("");
  lines.push("Sign-ups this week by source");
  const src: Count[] = w.by_source || [];
  if (src.length === 0) lines.push("  none");
  for (const s of src) lines.push(`  ${s.source}: ${s.count}`);
  const camp: Count[] = w.by_campaign || [];
  if (camp.length) {
    lines.push("");
    lines.push("Sign-ups this week by campaign");
    for (const c of camp) lines.push(`  ${c.campaign}: ${c.count}`);
  }
  lines.push(`Referred by another sign-up: ${w.referred_this_week}`);
  lines.push("");
  lines.push("APP ACCOUNTS");
  lines.push(`New this week:  ${a.this_week}`);
  lines.push(`Last week:      ${a.last_week}  (${change(a.this_week, a.last_week)})`);
  lines.push(`Total:          ${a.total}`);
  lines.push(`Boats added this week: ${a.boats_this_week}  (total ${a.boats_total})`);
  lines.push("");
  lines.push("SECURITY EVENTS THIS WEEK");
  const sec: Count[] = d.security_events || [];
  if (sec.length === 0) lines.push("  none");
  for (const s of sec) lines.push(`  ${s.kind}: ${s.count}`);
  lines.push("");
  lines.push("AI CALLS THIS WEEK");
  const ai = d.ai_calls || {};
  const aiKeys = Object.keys(ai);
  if (aiKeys.length === 0) lines.push("  none");
  for (const k of aiKeys) lines.push(`  ${k}: ${ai[k]}`);
  lines.push("");
  lines.push("Not included: edge function errors. Supabase does not let a function read its own logs; check them in the Supabase dashboard under Edge Functions.");
  return {
    subject: `CodedOK weekly: ${w.this_week} waitlist sign-up${w.this_week === 1 ? "" : "s"}, ${a.this_week} new account${a.this_week === 1 ? "" : "s"}`,
    text: lines.join("\n"),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("WEEKLY_REPORT_SECRET") || "";
  const given = req.headers.get("x-report-secret") || "";
  // Fail closed: no configured secret means nobody may call this.
  if (expected.length < 24 || !sameSecret(given, expected)) return json(401, { error: "unauthorised" });

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !svc) return json(500, { error: "server_misconfigured" });

  // The service role is used for this one read-only call and never leaves the function.
  const db = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("weekly_report_data");
  if (error || !data) {
    console.error("weekly-report: data query failed", error?.message);
    return json(500, { error: "data_unavailable" });
  }

  const report = buildReport(data);
  if (new URL(req.url).searchParams.get("dry_run") === "1") {
    return new Response(`Subject: ${report.subject}\n\n${report.text}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("weekly-report: RESEND_API_KEY not set — nothing sent");
    return json(200, { ok: false, reason: "email_not_configured" });
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "CodedOK <reminders@codedok.com>",
      to: [Deno.env.get("WEEKLY_REPORT_TO") || "joseph@jdmcl.com"],
      subject: report.subject,
      text: report.text,
    }),
  });
  if (!res.ok) {
    console.error("weekly-report: resend failed", res.status, (await res.text()).slice(0, 300));
    return json(502, { ok: false, reason: "send_failed", status: res.status });
  }
  return json(200, { ok: true, sent: true });
});
