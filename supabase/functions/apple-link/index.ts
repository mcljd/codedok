// CodedOK — Edge Function: apple-link
// Called right after Sign in with Apple. Swaps Apple's one-time authorization
// code for a refresh token and stores it (service role only) so delete-account
// can revoke it later. Best-effort: sign-in never depends on this succeeding.
import { createClient } from "npm:@supabase/supabase-js@2";
import { appleConfigured, exchangeCode } from "../_shared/apple.ts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error } = await service.auth.getUser(jwt);
    if (error || !u?.user) return json({ error: "unauthorized" }, 401);
    const { authorization_code } = await req.json().catch(() => ({}));
    if (!authorization_code || typeof authorization_code !== "string") return json({ error: "authorization_code_required" }, 400);
    if (!appleConfigured()) return json({ ok: false, skipped: "apple_not_configured" });
    const refresh = await exchangeCode(authorization_code);
    if (!refresh) return json({ ok: false, skipped: "exchange_failed" });
    const { error: up } = await service.from("apple_tokens").upsert({ auth_user_id: u.user.id, refresh_token: refresh, updated_at: new Date().toISOString() });
    if (up) { console.error("apple_tokens upsert", up.message); return json({ ok: false, skipped: "store_failed" }); }
    return json({ ok: true });
  } catch (e) {
    console.error("apple-link", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
