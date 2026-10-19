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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@codedok.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// ── Native APNs (iOS) ────────────────────────────────────────────────
// Token-based auth: we sign a short-lived ES256 JWT with the .p8 auth key
// and POST the alert to Apple's HTTP/2 gateway. All of this is OPTIONAL
// and fail-open — if these secrets aren't set, the APNs branch is skipped
// entirely and web push behaves exactly as before.
//   APNS_KEY_ID       — the 10-char Key ID of the .p8 auth key
//   APNS_TEAM_ID      — your 10-char Apple Developer Team ID
//   APNS_PRIVATE_KEY  — the .p8 file contents (PEM, incl. BEGIN/END lines)
//   APNS_TOPIC        — the app bundle id (default com.codedok.app)
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") || "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") || "";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") || "";
const APNS_TOPIC = Deno.env.get("APNS_TOPIC") || "com.codedok.app";
const APNS_ENABLED = !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY);

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(str: string): string {
  return b64url(new TextEncoder().encode(str));
}

// Import the PKCS#8 EC P-256 private key from the .p8 PEM once.
let apnsKeyPromise: Promise<CryptoKey> | null = null;
function apnsKey(): Promise<CryptoKey> {
  if (!apnsKeyPromise) {
    const pem = APNS_PRIVATE_KEY
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    apnsKeyPromise = crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  return apnsKeyPromise;
}

// APNs auth tokens are valid up to 60 min; Apple rejects tokens refreshed
// more than once per ~20 min, so we cache and reuse for 30 min.
let apnsJwt = "";
let apnsJwtAt = 0;
async function apnsToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && now - apnsJwtAt < 1800) return apnsJwt;
  const header = b64urlStr(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const claims = b64urlStr(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  const signingInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await apnsKey(),
    new TextEncoder().encode(signingInput),
  );
  apnsJwt = `${signingInput}.${b64url(new Uint8Array(sig))}`;
  apnsJwtAt = now;
  return apnsJwt;
}

type DeviceToken = { id: string; user_id: string; token: string; environment: string };

// Send one alert to one device. Returns { ok, prune } — prune=true means
// Apple says the token is dead and we should delete it.
async function sendApns(
  device: DeviceToken,
  title: string,
  body: string,
  collapseId: string,
): Promise<{ ok: boolean; prune: boolean }> {
  const host = device.environment === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
  const payload = JSON.stringify({
    aps: { alert: { title, body }, sound: "default" },
    url: "./",
  });
  try {
    const jwt = await apnsToken();
    const res = await fetch(`https://${host}/3/device/${device.token}`, {
      method: "POST",
      headers: {
        "authorization": `bearer ${jwt}`,
        "apns-topic": APNS_TOPIC,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-collapse-id": collapseId.slice(0, 64),
        "content-type": "application/json",
      },
      body: payload,
    });
    if (res.status === 200) return { ok: true, prune: false };
    // 410 Unregistered, or 400 BadDeviceToken → token is dead, prune it.
    let reason = "";
    try { reason = (await res.json())?.reason || ""; } catch (_) { /* ignore */ }
    const prune = res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered";
    if (!prune) console.warn("apns send failed", res.status, reason);
    return { ok: false, prune };
  } catch (err) {
    console.warn("apns send error", err);
    return { ok: false, prune: false };
  }
}

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

  // Optional caller gate. This function ships the anon key in the client,
  // so without a gate anyone could trigger the reminder fan-out at will.
  // Fail-open by design: it only enforces once you SET a CRON_SECRET
  // secret on the function AND have your scheduler send it as the
  // 'x-cron-secret' header — until then behaviour is unchanged, so this
  // can't accidentally silence reminders.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

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

  // 4b. Native device tokens (APNs). Skipped entirely unless APNs is
  // configured, so this never affects the web-push path.
  const tokensByUser = new Map<string, DeviceToken[]>();
  if (APNS_ENABLED) {
    const { data: toks, error: tokErr } = await sb
      .from("device_push_tokens")
      .select("id, user_id, token, environment")
      .eq("platform", "ios")
      .in("user_id", [...byUser.keys()]);
    if (tokErr) console.warn("device_push_tokens query failed:", tokErr.message);
    for (const t of (toks || []) as DeviceToken[]) {
      if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
      tokensByUser.get(t.user_id)!.push(t);
    }
  }

  // 5. Send + log.
  let sent = 0;
  let failed = 0;
  let apnsSent = 0;
  const deadSubIds: string[] = [];
  const deadTokenIds: string[] = [];
  const logRows: { user_id: string; item_kind: string; item_id: string; bucket: string }[] = [];

  for (const [userId, userItems] of byUser) {
    const userSubs = subsByUser.get(userId) || [];
    const userTokens = tokensByUser.get(userId) || [];
    if (!userSubs.length && !userTokens.length) {
      // No device registered — still log so we don't churn over them again
      // tomorrow. They missed this bucket; next bucket transition will
      // re-surface in a new row anyway.
      for (const i of userItems) {
        logRows.push({ user_id: i.user_id, item_kind: i.item_kind, item_id: i.item_id, bucket: i.bucket });
      }
      continue;
    }

    const { title, body } = buildBody(userItems);
    const collapseId = `codedok-reminder-${userId}`;
    const payload = JSON.stringify({
      title,
      body,
      url: "./",
      tag: collapseId,
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

    // Native iOS devices via APNs.
    for (const device of userTokens) {
      const r = await sendApns(device, title, body, collapseId);
      if (r.ok) apnsSent++;
      else { failed++; if (r.prune) deadTokenIds.push(device.id); }
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
  if (deadTokenIds.length) {
    await sb.from("device_push_tokens").delete().in("id", deadTokenIds);
  }

  return json({
    ok: true,
    sent,
    apnsSent,
    failed,
    pruned: deadSubIds.length + deadTokenIds.length,
    users: byUser.size,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

Deno.serve(handler);
