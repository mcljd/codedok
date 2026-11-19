// CodedOK — Supabase Edge Function: revenuecat-webhook
//
// RevenueCat calls this whenever an Apple subscription changes. It keeps
// organizations.plan in step with what the owner has actually paid for:
//   purchase / renewal / upgrade / un-cancel  → plan = pro | team
//   expiration                                → plan = solo (free)
//   cancellation / billing issue              → no change until it expires
//
// The RevenueCat app_user_id is the Supabase auth user id (the app calls
// Purchases.configure with it at sign-in), so we find the org that user
// owns. Paid plans can ONLY be set here or by the support console — a DB
// trigger (migration 0025) stops clients granting themselves Pro.
//
// Deploy with verify_jwt OFF (RevenueCat doesn't send a Supabase JWT):
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
// Secrets:
//   REVENUECAT_WEBHOOK_AUTH — the exact Authorization header value you set
//                             in RevenueCat → Integrations → Webhooks.
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH") || "";

const GRANT = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "NON_RENEWING_PURCHASE"]);
const REVOKE = new Set(["EXPIRATION"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Constant-time string compare so the secret can't be guessed by timing.
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function planFor(ev: any): "pro" | "team" {
  const ents: string[] = ev.entitlement_ids || (ev.entitlement_id ? [ev.entitlement_id] : []);
  if (ents.includes("team")) return "team";
  if (ents.includes("pro")) return "pro";
  const product = String(ev.new_product_id || ev.product_id || "");
  return /team/i.test(product) ? "team" : "pro";
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // Fail CLOSED: without a configured secret, accept nothing.
  if (!WEBHOOK_AUTH || !safeEqual(req.headers.get("authorization") || "", WEBHOOK_AUTH)) {
    return json({ error: "unauthorized" }, 401);
  }

  let ev: any;
  try { ev = (await req.json()).event; } catch { return json({ error: "invalid_json" }, 400); }
  if (!ev || !ev.type) return json({ error: "no_event" }, 400);
  if (ev.type === "TEST") return json({ ok: true, test: true });
  if (!GRANT.has(ev.type) && !REVOKE.has(ev.type)) return json({ ok: true, ignored: ev.type });

  // The Supabase auth id: app_user_id, or an alias if RevenueCat merged an
  // anonymous id into the account.
  const ids = [ev.app_user_id, ev.original_app_user_id, ...(ev.aliases || [])].filter((x: unknown) => typeof x === "string" && UUID.test(x));
  if (!ids.length) return json({ ok: true, skipped: "no_supabase_user_id" });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: users, error: uErr } = await sb.from("users").select("id").in("auth_user_id", ids);
  if (uErr) return json({ error: "users_lookup_failed" }, 500);
  if (!users || !users.length) return json({ ok: true, skipped: "user_not_found" });

  const { data: memb, error: mErr } = await sb.from("memberships").select("org_id")
    .in("user_id", users.map((u: any) => u.id)).eq("role", "owner");
  if (mErr) return json({ error: "membership_lookup_failed" }, 500);
  const orgIds = [...new Set((memb || []).map((m: any) => m.org_id))];
  if (!orgIds.length) return json({ ok: true, skipped: "no_owned_org" });

  const now = new Date().toISOString();
  const update = REVOKE.has(ev.type)
    ? { plan: "solo", plan_source: null, plan_expires_at: null, plan_changed_at: now }
    : {
        plan: planFor(ev),
        plan_source: "apple",
        plan_expires_at: ev.expiration_at_ms ? new Date(Number(ev.expiration_at_ms)).toISOString() : null,
        plan_changed_at: now,
      };

  // On expiry, only downgrade orgs whose paid plan came from Apple — never
  // clobber a plan the support team granted by hand.
  let q = sb.from("organizations").update(update).in("id", orgIds);
  if (REVOKE.has(ev.type)) q = q.eq("plan_source", "apple");
  const { error: oErr } = await q;
  if (oErr) return json({ error: "org_update_failed" }, 500);

  return json({ ok: true, type: ev.type, orgs: orgIds.length, plan: update.plan });
}

Deno.serve(handler);
