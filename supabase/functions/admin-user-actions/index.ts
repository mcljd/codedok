// CodedOK — Support Console backend.
//
// Every request is a JSON POST with { action, ... }. The function
// double-checks the caller's own kind from public.users (using the
// caller's JWT — the anon-client mirror below) before touching
// auth.admin with the service role key. If the caller's row is not
// kind:'support' or kind:'admin', the request is rejected 403.
//
// Actions supported:
//   find_user     { email }               → user + orgs
//   set_password  { auth_user_id, password }
//   send_magic_link { email }
//   delete_user   { auth_user_id }
//   recent_signins { limit? }             → last N sign-ins across all users
//
// Deploy:
//   supabase functions deploy admin-user-actions
// Env / secrets (already present for other functions):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY
//
// The browser only ever sends the caller's session JWT + the action
// payload. The service role key never leaves the function.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

async function assertCallerIsSupport(req: Request): Promise<{ ok: true; userId: string } | Response> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_auth" }, 401);

  // Mirror the caller — use the anon key + their JWT so RLS sees
  // them as themselves.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "invalid_session" }, 401);
  const authUserId = userData.user.id;

  // Look up their public.users row using the service role so RLS
  // can't hide their own kind from them.
  const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: row, error: rowErr } = await service
    .from("users")
    .select("kind")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (rowErr || !row) return json({ error: "user_row_missing" }, 403);
  if (row.kind !== "support" && row.kind !== "admin") {
    return json({ error: "forbidden", reason: "not_a_support_user" }, 403);
  }
  return { ok: true, userId: authUserId };
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const gate = await assertCallerIsSupport(req);
  if (gate instanceof Response) return gate;

  let body: any = {};
  try { body = await req.json(); } catch (_) { return json({ error: "invalid_json" }, 400); }
  const action = String(body.action || "");

  const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (action) {
      case "find_user": {
        const email = String(body.email || "").toLowerCase().trim();
        if (!email) return json({ error: "email_required" }, 400);
        // Pull auth row via admin.listUsers filtered by email.
        const { data: authList, error: authErr } = await service.auth.admin.listUsers();
        if (authErr) throw authErr;
        const authUser = (authList?.users || []).find((u) => (u.email || "").toLowerCase() === email);
        if (!authUser) return json({ user: null });
        // Pull the mirror row + orgs they own.
        const [{ data: pub }, { data: memb }] = await Promise.all([
          service.from("users").select("id,name,email,kind,created_at").eq("auth_user_id", authUser.id).maybeSingle(),
          service.from("memberships").select("org_id,role,organizations(name)").eq("user_id", authUser.id),
        ]);
        return json({
          user: {
            auth_user_id: authUser.id,
            email: authUser.email,
            name: pub?.name || null,
            kind: pub?.kind || null,
            created_at: authUser.created_at,
            last_sign_in_at: authUser.last_sign_in_at,
            email_confirmed_at: authUser.email_confirmed_at,
            orgs: (memb || []).map((m: any) => ({ id: m.org_id, role: m.role, name: m.organizations?.name })),
          },
        });
      }

      case "set_password": {
        const id = String(body.auth_user_id || "");
        const password = String(body.password || "");
        if (!id) return json({ error: "auth_user_id_required" }, 400);
        if (password.length < 12) return json({ error: "password_too_short" }, 400);
        const { error } = await service.auth.admin.updateUserById(id, { password });
        if (error) throw error;
        return json({ ok: true });
      }

      case "send_magic_link": {
        const email = String(body.email || "").toLowerCase().trim();
        if (!email) return json({ error: "email_required" }, 400);
        const { error } = await service.auth.admin.generateLink({ type: "magiclink", email });
        if (error) throw error;
        return json({ ok: true });
      }

      case "delete_user": {
        const id = String(body.auth_user_id || "");
        if (!id) return json({ error: "auth_user_id_required" }, 400);
        const { error } = await service.auth.admin.deleteUser(id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "recent_signins": {
        const limit = Math.min(200, Math.max(1, Number(body.limit) || 20));
        const { data: authList, error } = await service.auth.admin.listUsers({ perPage: 500 });
        if (error) throw error;
        // Sort by last_sign_in_at desc, cap.
        const rows = (authList?.users || [])
          .filter((u) => u.last_sign_in_at)
          .sort((a, b) => (b.last_sign_in_at || "").localeCompare(a.last_sign_in_at || ""))
          .slice(0, limit)
          .map((u) => ({ email: u.email, last_sign_in_at: u.last_sign_in_at }));
        // Enrich with kind.
        const authIds = rows.map((_, i) => (authList.users[i]?.id));
        const { data: pubs } = await service.from("users").select("auth_user_id,kind").in("auth_user_id", authIds);
        const kindById = new Map((pubs || []).map((p: any) => [p.auth_user_id, p.kind]));
        rows.forEach((r: any, i: number) => { r.kind = kindById.get(authList.users[i]?.id) || "user"; });
        return json({ rows });
      }

      default:
        return json({ error: "unknown_action", action }, 400);
    }
  } catch (err: any) {
    console.error("admin-user-actions failed", action, err);
    return json({ error: err?.message || "internal_error" }, 500);
  }
}

Deno.serve(handler);
