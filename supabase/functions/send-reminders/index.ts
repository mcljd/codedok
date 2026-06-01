// CodedOK — Supabase Edge Function: send-reminders
//
// Runs daily (pg_cron, see migration 0009). For every row in the
// `expiring_items` view that we have NOT already notified about at its
// current bucket, fan out a Web Push to every device that user has
// registered in `push_subscriptions`, then write a `reminder_log` row
// so we don't re-send on subsequent runs.
//
// Bucket transitions are first-class: when an item moves from due30 to
// due7 to overdue, each new bucket gets its own notification. That's
// what gives the operator escalating nudges instead of one and done.
//
// Secrets required:
//   VAPID_PUBLIC_KEY   — same as in app.js (base64url)
//   VAPID_PRIVATE_KEY  — paired private key (base64url)
//   VAPID_SUBJECT      — mailto:you@codedok.com or https://codedok.com
//
// Invoke (manual test):
//   curl -X POST https://<project>.supabase.co/functions/v1/send-reminders \
//        -H "Authorization: Bearer <SERVICE_ROLE_KEY>"

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@codedok.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

type Bucket = "overdue" | "due7" | "due30" | "due60" | "due90";

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

type PushSub = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function bucketLabel(b: Bucket): string {
  if (b === "overdue") return "Overdue";
  if (b === "due7")    return "Due in 7 days";
  if (b === "due30")   return "Due in 30 days";
  if (b === "due60")   return "Due in 60 days";
  return "Due in 90 days";
}

function buildBody(items: ExpiringItem[]): { title: string; body: string } {
  // Pick the most-urgent bucket to drive the headline. Order matters:
  // overdue beats due7 beats due30 beats due60 beats due90.
  const overdue = items.filter((i) => i.bucket === "overdue");
  const due7    = items.filter((i) => i.bucket === "due7");
  const due30   = items.filter((i) => i.bucket === "due30");
  const due60   = items.filter((i) => i.bucket === "due60");
  const due90   = items.filter((i) => i.bucket === "due90");

  let title = "CodedOK — renewal due";
  if (overdue.length)      title = `${overdue.length} item${overdue.length === 1 ? "" : "s"} overdue`;
  else if (due7.length)    title = `${due7.length} item${due7.length === 1 ? "" : "s"} due this week`;
  else if (due30.length)   title = `${due30.length} item${due30.length === 1 ? "" : "s"} due in 30 days`;
  else if (due60.length)   title = `${due60.length} item${due60.length === 1 ? "" : "s"} due in 60 days`;
  else if (due90.length)   title = `${due90.length} item${due90.length === 1 ? "" : "s"} due in 90 days`;

  // Up to 3 items in the body; rest get "and N more".
  const preview = items.slice(0, 3).map((i) => {
    const ves = i.vessel_name ? ` (${i.vessel_name})` : "";
    return `• ${i.label}${ves}`;
  }).join("\n");
  const more = items.length > 3 ? `\n… and ${items.length - 3} more` : "";
  return { title, body: preview + more };
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Pull everything currently in a notifiable bucket. The view
  // (migration 0017) emits five buckets: overdue / due7 / due30 /
  // due60 / due90. 'valid' is excluded — those don't need a nudge.
  const { data: expiring, error: expErr } = await sb
    .from("expiring_items")
    .select("user_id, item_kind, item_id, label, vessel_id, vessel_name, expires_at, bucket")
    .in("bucket", ["overdue", "due7", "due30", "due60", "due90"]);
  if (expErr) return json({ error: "expiring_items query failed", detail: expErr.message }, 500);
  const items = (expiring || []) as ExpiringItem[];
  if (!items.length) return json({ ok: true, sent: 0, reason: "nothing expiring" });

  // 2. Strip out items we've already notified about at the current bucket.
  const keys = items.map((i) => `${i.user_id}|${i.item_kind}|${i.item_id}|${i.bucket}`);
  const { data: already, error: logErr } = await sb
    .from("reminder_log")
    .select("user_id, item_kind, item_id, bucket")
    .in("user_id", [...new Set(items.map((i) => i.user_id))]);
  if (logErr) return json({ error: "reminder_log query failed", detail: logErr.message }, 500);
  const seen = new Set((already || []).map((r) =>
    `${r.user_id}|${r.item_kind}|${r.item_id}|${r.bucket}`));
  const fresh = items.filter((i, idx) => !seen.has(keys[idx]));
  if (!fresh.length) return json({ ok: true, sent: 0, reason: "all caught up" });

  // 3. Group by recipient — one digest per user.
  const byUser = new Map<string, ExpiringItem[]>();
  for (const i of fresh) {
    if (!byUser.has(i.user_id)) byUser.set(i.user_id, []);
    byUser.get(i.user_id)!.push(i);
  }

  // 4. Pull every relevant push subscription in one query.
  const { data: subs, error: subErr } = await sb
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", [...byUser.keys()]);
  if (subErr) return json({ error: "push_subscriptions query failed", detail: subErr.message }, 500);
  const subsByUser = new Map<string, PushSub[]>();
  for (const s of (subs || []) as PushSub[]) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id)!.push(s);
  }

  // 5. Send + log.
  let sent = 0;
  let failed = 0;
  const deadSubIds: string[] = [];
  const logRows: { user_id: string; item_kind: string; item_id: string; bucket: string }[] = [];

  for (const [userId, userItems] of byUser) {
    const userSubs = subsByUser.get(userId) || [];
    if (!userSubs.length) {
      // No device registered — still log so we don't churn over them again
      // tomorrow. They missed this bucket; next bucket transition will
      // re-surface in a new row anyway.
      for (const i of userItems) {
        logRows.push({ user_id: i.user_id, item_kind: i.item_kind, item_id: i.item_id, bucket: i.bucket });
      }
      continue;
    }

    const { title, body } = buildBody(userItems);
    const payload = JSON.stringify({
      title,
      body,
      url: "./",
      tag: `codedok-reminder-${userId}`,
    });

    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
      } catch (err: any) {
        failed++;
        const status = err && err.statusCode;
        if (status === 404 || status === 410) deadSubIds.push(sub.id);
        else console.warn("push failed", sub.endpoint, status, err && err.body);
      }
    }

    for (const i of userItems) {
      logRows.push({ user_id: i.user_id, item_kind: i.item_kind, item_id: i.item_id, bucket: i.bucket });
    }
  }

  if (logRows.length) {
    // Batch in chunks of 500 to stay well under PostgREST limits.
    for (let i = 0; i < logRows.length; i += 500) {
      const chunk = logRows.slice(i, i + 500);
      const { error } = await sb
        .from("reminder_log")
        .upsert(chunk, { onConflict: "user_id,item_kind,item_id,bucket", ignoreDuplicates: true });
      if (error) console.warn("reminder_log insert failed:", error.message);
    }
  }

  if (deadSubIds.length) {
    await sb.from("push_subscriptions").delete().in("id", deadSubIds);
  }

  return json({ ok: true, sent, failed, pruned: deadSubIds.length, users: byUser.size });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

Deno.serve(handler);
