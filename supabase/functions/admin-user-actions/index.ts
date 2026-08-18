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
        // Pull the public.users mirror row FIRST — memberships and
        // audit_log key off public.users.id, NOT the auth id, so we
        // need it before we can look up the user's orgs.
        const { data: pub } = await service
          .from("users")
          .select("id,name,kind,created_at")
          .eq("auth_user_id", authUser.id)
          .maybeSingle();
        const pubId = pub?.id || null;
        const { data: memb } = pubId
          ? await service.from("memberships").select("org_id,role,organizations(name)").eq("user_id", pubId)
          : { data: [] };
        return json({
          user: {
            // id is the public.users primary key — the client passes
            // this to user_vessels / user_activity. auth_user_id is
            // the auth.users key — the client passes this to
            // set_password / delete_user / ban / change_email etc.
            id: pubId,
            auth_user_id: authUser.id,
            email: authUser.email,
            name: pub?.name || null,
            kind: pub?.kind || null,
            created_at: authUser.created_at,
            last_sign_in_at: authUser.last_sign_in_at,
            email_confirmed_at: authUser.email_confirmed_at,
            banned: !!authUser.banned_until && new Date(authUser.banned_until) > new Date(),
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
        const rows = (authList?.users || [])
          .filter((u) => u.last_sign_in_at)
          .sort((a, b) => (b.last_sign_in_at || "").localeCompare(a.last_sign_in_at || ""))
          .slice(0, limit)
          .map((u) => ({ email: u.email, last_sign_in_at: u.last_sign_in_at, auth_user_id: u.id }));
        const authIds = rows.map((r: any) => r.auth_user_id);
        const { data: pubs } = await service.from("users").select("auth_user_id,kind").in("auth_user_id", authIds);
        const kindById = new Map((pubs || []).map((p: any) => [p.auth_user_id, p.kind]));
        rows.forEach((r: any) => { r.kind = kindById.get(r.auth_user_id) || "user"; });
        return json({ rows });
      }

      case "list_users": {
        // Paginated browse of every user on the platform. `q` filter
        // matches an email substring (case-insensitive).
        const perPage = Math.min(200, Math.max(1, Number(body.per_page) || 25));
        const page    = Math.max(1, Number(body.page) || 1);
        const q       = String(body.q || "").toLowerCase().trim();
        const { data: authList, error } = await service.auth.admin.listUsers({ perPage: 1000 });
        if (error) throw error;
        let users = authList?.users || [];
        if (q) users = users.filter((u) => (u.email || "").toLowerCase().includes(q));
        users.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        const total = users.length;
        const slice = users.slice((page - 1) * perPage, page * perPage);
        const ids = slice.map((u) => u.id);
        const { data: pubs } = await service.from("users").select("auth_user_id,kind,name").in("auth_user_id", ids);
        const meta = new Map((pubs || []).map((p: any) => [p.auth_user_id, p]));
        const rows = slice.map((u) => {
          const m: any = meta.get(u.id) || {};
          return {
            auth_user_id: u.id,
            email: u.email,
            name: m.name || null,
            kind: m.kind || "user",
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            email_confirmed: !!u.email_confirmed_at,
            banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
          };
        });
        return json({ rows, page, per_page: perPage, total });
      }

      case "change_email": {
        // Update a user's login email. Fires a re-verification email
        // to the new address unless email_confirm is passed.
        const id = String(body.auth_user_id || "");
        const email = String(body.email || "").toLowerCase().trim();
        if (!id || !email.includes("@")) return json({ error: "id_and_email_required" }, 400);
        const { error: authErr } = await service.auth.admin.updateUserById(id, { email });
        if (authErr) throw authErr;
        await service.from("users").update({ email }).eq("auth_user_id", id);
        return json({ ok: true });
      }

      case "verify_email": {
        // Force an unverified email address to be marked confirmed
        // (used when the verification mail failed to deliver but the
        // person is legit).
        const id = String(body.auth_user_id || "");
        if (!id) return json({ error: "auth_user_id_required" }, 400);
        const { error } = await service.auth.admin.updateUserById(id, { email_confirm: true });
        if (error) throw error;
        return json({ ok: true });
      }

      case "change_kind": {
        // Promote / demote a user's role. Restricted to the four
        // customer-facing kinds — support & admin can only be set
        // via SQL on purpose.
        const id      = String(body.auth_user_id || "");
        const newKind = String(body.kind || "").toLowerCase();
        const allowed = ["operator", "surveyor", "builder", "crew"];
        if (!id || !allowed.includes(newKind)) return json({ error: "invalid_kind_or_id" }, 400);
        const { error } = await service.from("users").update({ kind: newKind }).eq("auth_user_id", id);
        if (error) throw error;
        return json({ ok: true, kind: newKind });
      }

      case "ban_user": {
        // Ban a user for a duration ("24h", "7d", "1000h") or lift
        // an existing ban ("none").
        const id  = String(body.auth_user_id || "");
        const dur = String(body.duration || "24h");
        if (!id) return json({ error: "auth_user_id_required" }, 400);
        const { error } = await service.auth.admin.updateUserById(id, { ban_duration: dur });
        if (error) throw error;
        return json({ ok: true, ban_duration: dur });
      }

      case "user_activity": {
        // Recent audit-log rows for the user.
        const id = String(body.user_id || "");
        if (!id) return json({ error: "user_id_required" }, 400);
        const { data, error } = await service
          .from("audit_log")
          .select("action,target_type,target_id,at,metadata")
          .eq("actor_user_id", id)
          .order("at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return json({ rows: data || [] });
      }

      case "user_vessels": {
        // Every vessel the user has access to via any org membership.
        const id = String(body.user_id || "");
        if (!id) return json({ error: "user_id_required" }, 400);
        const { data: memb, error: mErr } = await service
          .from("memberships")
          .select("org_id,role")
          .eq("user_id", id);
        if (mErr) throw mErr;
        const orgIds = (memb || []).map((m: any) => m.org_id);
        if (!orgIds.length) return json({ rows: [] });
        const { data: vessels, error: vErr } = await service
          .from("vessels")
          .select("id,name,type,category,ssr,org_id,port")
          .in("org_id", orgIds)
          .order("created_at", { ascending: false });
        if (vErr) throw vErr;
        return json({ rows: vessels || [] });
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
