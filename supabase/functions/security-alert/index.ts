// CodedOK — Supabase Edge Function: security-alert
//
// Emails the team about security events recorded in public.security_events
// (migration 0031): blocked attempts to gain admin rights or a paid plan,
// admin rights actually being granted, sign-up or waitlist floods, and
// unusually heavy AI use.
//
// Called by a database trigger when a high-severity event is recorded and by
// the hourly scan. It takes no input and can only do one thing — email the
// fixed address about real, un-notified events — so it needs no JWT or
// shared secret. At most one email every 10 minutes, however often it is
// called; events that arrive in between go in the next email.
//
// Secrets:
//   RESEND_API_KEY     — same key the reminder emails use
//   RESEND_FROM        — optional, default 'CodedOK <reminders@codedok.com>'
//   SECURITY_ALERT_TO  — optional, default 'hello@codedok.com'

import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const LABELS: Record<string, string> = {
  privilege_attempt: "Someone tried to give their account admin or support rights (blocked)",
  account_link_tamper: "Someone tried to re-link their profile to another login (blocked)",
  plan_tamper_attempt: "Someone tried to give themselves a paid plan (blocked)",
  admin_granted: "An account was given admin or support rights",
  signup_burst: "Unusually many new accounts in one hour",
  waitlist_flood: "Unusually many waitlist sign-ups in one hour",
  ai_usage_high: "One account is using the AI features very heavily",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!url || !svc) return json(500, { error: "server_misconfigured" });
  if (!resendKey) {
    // Leave the events un-notified so they go out once email is set up.
    console.warn("security-alert: RESEND_API_KEY not set — events stay pending");
    return json(200, { ok: false, reason: "email_not_configured" });
  }

  const db = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });

  // Throttle: one email per 10 minutes.
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await db.from("security_events").select("id", { count: "exact", head: true }).gte("notified_at", tenMinAgo);
  if ((recent.count || 0) > 0) return json(200, { ok: true, sent: false, reason: "throttled" });

  // Claim everything pending, so two calls at once cannot both send it.
  const { data: events, error } = await db.from("security_events")
    .update({ notified_at: new Date().toISOString() })
    .is("notified_at", null)
    .select("id, at, kind, severity, detail");
  if (error) { console.error("security-alert: claim failed", error.message); return json(500, { error: "try_again" }); }
  if (!events || events.length === 0) return json(200, { ok: true, sent: false });

  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const shown = events.slice(0, 30);
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
  const rows = shown.map((e) => {
    const d = e.detail && typeof e.detail === "object" ? Object.entries(e.detail).map(([k, v]) => `${k}: ${v}`).join(", ") : "";
    return { time: when(e.at), what: LABELS[e.kind] || e.kind, detail: d };
  });
  const more = events.length > shown.length ? `\n…and ${events.length - shown.length} more.` : "";
  const html = `<p><strong>${events.length} security event${events.length === 1 ? "" : "s"} on CodedOK.</strong></p>` +
    `<table cellpadding="6" style="border-collapse:collapse;font-size:14px">` +
    rows.map((r) => `<tr><td style="color:#64748b;white-space:nowrap;vertical-align:top">${esc(r.time)}</td><td><strong>${esc(r.what)}</strong>${r.detail ? `<br><span style="color:#64748b">${esc(r.detail)}</span>` : ""}</td></tr>`).join("") +
    `</table><p style="color:#64748b">${esc(more)}</p>` +
    `<p style="color:#64748b">Blocked attempts did not succeed. The full list is in the security_events table in Supabase.</p>`;
  const text = `${events.length} security event(s) on CodedOK.\n\n` + rows.map((r) => `${r.time} — ${r.what}${r.detail ? ` (${r.detail})` : ""}`).join("\n") + more +
    "\n\nBlocked attempts did not succeed. The full list is in the security_events table in Supabase.";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "CodedOK <reminders@codedok.com>",
      to: [Deno.env.get("SECURITY_ALERT_TO") || "hello@codedok.com"],
      subject: `CodedOK security alert: ${events.length} event${events.length === 1 ? "" : "s"}`,
      html, text,
    }),
  });
  if (!res.ok) {
    console.error("security-alert: resend failed", res.status, (await res.text()).slice(0, 300));
    // Release the claim so the events go out on the next call.
    await db.from("security_events").update({ notified_at: null }).in("id", events.map((e) => e.id));
    return json(200, { ok: false, reason: "send_failed", status: res.status });
  }
  return json(200, { ok: true, sent: true, events: events.length });
});
