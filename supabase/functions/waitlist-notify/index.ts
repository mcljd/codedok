// CodedOK — Supabase Edge Function: waitlist-notify
//
// Emails the team when someone joins the founding list on the website.
// Called by a database trigger on public.waitlist (migration 0030) with
// just the new row's id.
//
// No JWT and no shared secret are needed, because the caller cannot make
// this function do anything except its one job: it looks the row up itself
// and only sends for a real sign-up from the last 15 minutes that has not
// been notified yet. Each sign-up is claimed (notified_at) before sending,
// so repeat calls send nothing.
//
// Secrets:
//   RESEND_API_KEY      — same key the reminder emails use
//   RESEND_FROM         — optional, default 'CodedOK <reminders@codedok.com>'
//   WAITLIST_NOTIFY_TO  — optional, default 'hello@codedok.com'

import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!url || !svc) return json(500, { error: "server_misconfigured" });

  let id = "";
  try { id = String((await req.json())?.id || ""); } catch (_) { /* fall through */ }
  if (!UUID.test(id)) return json(400, { error: "bad_request" });

  if (!resendKey) {
    console.warn("waitlist-notify: RESEND_API_KEY not set — no email sent");
    return json(200, { ok: false, reason: "email_not_configured" });
  }

  const db = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });

  // Claim the sign-up. Only a fresh, un-notified row matches, so a stranger
  // calling this with a guessed or replayed id gets nothing sent.
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: rows, error } = await db.from("waitlist")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", id).is("notified_at", null).gte("created_at", since)
    .select("email, role, boat_count, region, referred_by, utm_source, utm_campaign, marketing_consent, created_at");
  if (error) { console.error("waitlist-notify: claim failed", error.message); return json(500, { error: "try_again" }); }
  const row = rows && rows[0];
  if (!row) return json(200, { ok: true, sent: false });

  const { count } = await db.from("waitlist").select("id", { count: "exact", head: true });

  const lines: [string, unknown][] = [
    ["Email", row.email],
    ["Agreed to updates", row.marketing_consent ? "Yes" : "No"],
    ["Referred by", row.referred_by || "–"],
    ["Source", [row.utm_source, row.utm_campaign].filter(Boolean).join(" / ") || "–"],
    ["Total on the list", count ?? "–"],
  ];
  const html = `<p>Someone joined the CodedOK founding list.</p><table cellpadding="6" style="border-collapse:collapse">` +
    lines.map(([k, v]) => `<tr><td style="color:#64748b">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join("") + `</table>`;
  const text = "Someone joined the CodedOK founding list.\n\n" + lines.map(([k, v]) => `${k}: ${v}`).join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "CodedOK <reminders@codedok.com>",
      to: [Deno.env.get("WAITLIST_NOTIFY_TO") || "hello@codedok.com"],
      reply_to: row.email,
      subject: `New founding-list sign-up (${count ?? "?"} total)`,
      html, text,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("waitlist-notify: resend failed", res.status, detail);
    // Release the claim so the failure is visible in the table.
    await db.from("waitlist").update({ notified_at: null }).eq("id", id);
    return json(200, { ok: false, reason: "send_failed", status: res.status });
  }
  return json(200, { ok: true, sent: true });
});
