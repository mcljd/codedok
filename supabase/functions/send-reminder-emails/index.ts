// CodedOK — Supabase Edge Function: send-reminder-emails
//
// Email fallback for the daily expiry-reminder job. Push notifications
// only reach users who installed the PWA and granted permission; this
// function emails any user with expiring items who is NOT push-
// subscribed (or, optionally, every user — flip the FALLBACK_ONLY
// constant). Same dedupe ledger as the push path: a reminder_log row
// is inserted on send so we don't email twice for the same bucket.
//
// Secrets required:
//   RESEND_API_KEY — from https://resend.com (free tier is plenty)
//   RESEND_FROM    — e.g. 'CodedOK <reminders@codedok.com>'
//                    (the sending domain must be verified at Resend)
//
// Invoke (test):
//   curl -X POST https://<project>.supabase.co/functions/v1/send-reminder-emails \
//        -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
//
// Schedule alongside the push job — see migration 0015.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM  = Deno.env.get("RESEND_FROM") || "CodedOK <reminders@codedok.com>";
// true → only email users who DON'T have a push subscription on file
// false → email everyone with expiring items (push + email belt-and-braces)
const FALLBACK_ONLY = (Deno.env.get("EMAIL_FALLBACK_ONLY") ?? "true").toLowerCase() !== "false";

type Bucket = "overdue" | "due7" | "due30";
type ExpiringItem = {
  user_id: string;
  item_kind: string;
  item_id: string;
  label: string;
  vessel_id: string | null;
  vessel_name: string | null;
  expires_at: string;
  bucket: Bucket;
};

function buildEmail(items: ExpiringItem[], firstName: string): { subject: string; html: string; text: string } {
  const overdue = items.filter((i) => i.bucket === "overdue");
  const due7    = items.filter((i) => i.bucket === "due7");
  const due30   = items.filter((i) => i.bucket === "due30");

  let subject = "CodedOK — items due for renewal";
  if (overdue.length)      subject = `${overdue.length} item${overdue.length === 1 ? "" : "s"} overdue`;
  else if (due7.length)    subject = `${due7.length} item${due7.length === 1 ? "" : "s"} due this week`;
  else if (due30.length)   subject = `${due30.length} item${due30.length === 1 ? "" : "s"} due in 30 days`;

  const fmt = (b: Bucket, list: ExpiringItem[]) => {
    if (!list.length) return "";
    const label = b === "overdue" ? "Overdue" : b === "due7" ? "Due in 7 days" : "Due in 30 days";
    const lines = list.map((i) => {
      const ves = i.vessel_name ? ` — ${i.vessel_name}` : "";
      const d = new Date(i.expires_at);
      const date = d.toISOString().slice(0, 10);
      return `<li style="margin:6px 0">${escapeHtml(i.label)}${escapeHtml(ves)} <span style="color:#6b7280">(${date})</span></li>`;
    }).join("");
    const txtLines = list.map((i) => {
      const ves = i.vessel_name ? ` — ${i.vessel_name}` : "";
      return `  • ${i.label}${ves} (${new Date(i.expires_at).toISOString().slice(0,10)})`;
    }).join("\n");
    return {
      html: `<h3 style="margin:18px 0 6px;font-size:14px;color:#1f2937">${label}</h3><ul style="margin:0;padding-left:18px;color:#111">${lines}</ul>`,
      text: `${label}\n${txtLines}\n`,
    };
  };

  const sections = [fmt("overdue", overdue), fmt("due7", due7), fmt("due30", due30)]
    .filter((s) => s) as { html: string; text: string }[];

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;margin:0;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:white;border-radius:14px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.04)">
      <div style="font-size:13px;font-weight:700;color:#0891b2;letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px">CodedOK</div>
      <h1 style="margin:0 0 8px;font-size:20px;color:#111;letter-spacing:-.3px">Hi ${escapeHtml(firstName || "there")},</h1>
      <p style="margin:0 0 12px;color:#374151;line-height:1.6;font-size:14px">A quick heads-up on what needs your attention. Tap an item in the app to renew it.</p>
      ${sections.map((s) => s.html).join("")}
      <p style="margin:22px 0 0;font-size:12px;color:#6b7280;line-height:1.6">You're getting this because you have a CodedOK account. To stop these, sign in and turn off reminders in your Account screen.</p>
    </div>
  </body></html>`;

  const text = `Hi ${firstName || "there"},\n\nA quick heads-up on what needs your attention.\n\n${sections.map((s) => s.text).join("\n")}\n— CodedOK`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<{ ok: boolean; err?: string }> {
  if (!RESEND_KEY) return { ok: false, err: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, err: `${res.status} ${body}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, err: String(err && err.message || err) };
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Optional caller gate — fail-open. Enforces only once CRON_SECRET is
  // set on the function and the scheduler sends the 'x-cron-secret'
  // header; unchanged (open) until then, so it can't break the emails.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: items, error: itemsErr } = await sb
    .from("expiring_items")
    .select("user_id, item_kind, item_id, label, vessel_id, vessel_name, expires_at, bucket")
    .in("bucket", ["overdue", "due7", "due30"]);
  if (itemsErr) return json({ error: itemsErr.message }, 500);
  if (!items?.length) return json({ ok: true, sent: 0, reason: "nothing expiring" });

  // Dedupe: skip rows already in reminder_log at the same bucket.
  const userIds = [...new Set(items.map((i: any) => i.user_id))];
  const { data: already } = await sb
    .from("reminder_log")
    .select("user_id, item_kind, item_id, bucket")
    .in("user_id", userIds);
  const seen = new Set((already || []).map((r: any) => `${r.user_id}|${r.item_kind}|${r.item_id}|${r.bucket}`));
  const fresh = (items as ExpiringItem[]).filter((i) => !seen.has(`${i.user_id}|${i.item_kind}|${i.item_id}|${i.bucket}`));
  if (!fresh.length) return json({ ok: true, sent: 0, reason: "all caught up" });

  // Group by recipient.
  const byUser = new Map<string, ExpiringItem[]>();
  for (const i of fresh) {
    if (!byUser.has(i.user_id)) byUser.set(i.user_id, []);
    byUser.get(i.user_id)!.push(i);
  }

  // Pull users + their push-subscription counts in one go.
  const { data: users } = await sb
    .from("users")
    .select("id, email, name")
    .in("id", [...byUser.keys()]);
  const usersById = new Map((users || []).map((u: any) => [u.id, u]));

  let pushSubsByUser = new Map<string, number>();
  if (FALLBACK_ONLY) {
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("user_id")
      .in("user_id", [...byUser.keys()]);
    for (const s of (subs || []) as any[]) {
      pushSubsByUser.set(s.user_id, (pushSubsByUser.get(s.user_id) || 0) + 1);
    }
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const logRows: { user_id: string; item_kind: string; item_id: string; bucket: string }[] = [];

  for (const [userId, userItems] of byUser) {
    if (FALLBACK_ONLY && (pushSubsByUser.get(userId) || 0) > 0) {
      // User already has push — push job will reach them.
      skipped++;
      continue;
    }
    const user = usersById.get(userId);
    if (!user || !user.email) { skipped++; continue; }
    const firstName = (user.name || "").split(/\s+/)[0] || "";
    const { subject, html, text } = buildEmail(userItems, firstName);
    const res = await sendViaResend(user.email, subject, html, text);
    if (res.ok) {
      sent++;
      for (const i of userItems) logRows.push({ user_id: i.user_id, item_kind: i.item_kind, item_id: i.item_id, bucket: i.bucket });
    } else {
      failed++;
      console.warn(`resend failed for ${user.email}:`, res.err);
    }
  }

  if (logRows.length) {
    for (let i = 0; i < logRows.length; i += 500) {
      const chunk = logRows.slice(i, i + 500);
      await sb.from("reminder_log").upsert(chunk, { onConflict: "user_id,item_kind,item_id,bucket", ignoreDuplicates: true });
    }
  }

  return json({ ok: true, sent, failed, skipped, users: byUser.size });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });
}

Deno.serve(handler);
