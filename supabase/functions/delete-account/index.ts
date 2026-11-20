// CodedOK — Edge Function: delete-account
// Lets a signed-in user permanently delete their OWN account (App Store 5.1.1(v)).
//   1. revoke their Sign in with Apple token (if they used Apple)
//   2. delete any organisation they alone belong to (vessels, certs, crew… cascade)
//      — organisations shared with other people are left intact
//   3. delete their files in storage, then their profile row
//   4. delete the auth user
// Deletion never fails just because Apple revocation did; that's logged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { appleConfigured, revokeToken } from "../_shared/apple.ts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

async function removeFolder(service: any, bucket: string, folder: string) {
  try {
    const { data } = await service.storage.from(bucket).list(folder, { limit: 1000 });
    const paths = (data || []).filter((f: any) => f.name).map((f: any) => `${folder}/${f.name}`);
    if (paths.length) await service.storage.from(bucket).remove(paths);
  } catch (e) { console.error("storage cleanup", bucket, folder, e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error } = await service.auth.getUser(jwt);
    if (error || !u?.user) return json({ error: "unauthorized" }, 401);
    const authId = u.user.id;

    // Privileged accounts are managed out-of-band; never self-delete by accident.
    const { data: row } = await service.from("users").select("id, kind").eq("auth_user_id", authId).maybeSingle();
    if (row && (row.kind === "admin" || row.kind === "support")) return json({ error: "contact_support" }, 403);

    // 1. Apple token
    let appleRevoked: boolean | null = null;
    const { data: tok } = await service.from("apple_tokens").select("refresh_token").eq("auth_user_id", authId).maybeSingle();
    if (tok?.refresh_token && appleConfigured()) appleRevoked = await revokeToken(tok.refresh_token);
    else if (tok?.refresh_token) console.error("Apple token on file but APPLE_* secrets missing — not revoked");

    // 2 + 3. Data
    if (row) {
      const { data: mems } = await service.from("memberships").select("org_id, role").eq("user_id", row.id);
      for (const m of mems || []) {
        if (m.role !== "owner") continue;
        const { count } = await service.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", m.org_id);
        if ((count || 0) > 1) continue; // shared org: leave it for the others
        const { data: vessels } = await service.from("vessels").select("id").eq("org_id", m.org_id);
        for (const v of vessels || []) {
          await removeFolder(service, "vessel-photos", v.id);
          await removeFolder(service, "cert-files", v.id);
        }
        const { error: oe } = await service.from("organizations").delete().eq("id", m.org_id);
        if (oe) console.error("org delete", m.org_id, oe.message);
      }
      await removeFolder(service, "surveyor-logos", row.id);
      const { error: ue } = await service.from("users").delete().eq("id", row.id);
      if (ue) {
        // Still referenced elsewhere (e.g. a signed-off survey): anonymise instead.
        console.error("user delete blocked, anonymising", ue.message);
        await service.from("users").update({
          name: "Deleted user", initials: "DU", email: `deleted+${row.id}@codedok.invalid`,
          phone: null, surveyor: null, builder: null, auth_user_id: null, deleted_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
    }

    // 4. Auth user (also cascades apple_tokens)
    const { error: de } = await service.auth.admin.deleteUser(authId);
    if (de) throw de;
    return json({ ok: true, apple_revoked: appleRevoked });
  } catch (e) {
    console.error("delete-account", e);
    return json({ error: "delete_failed" }, 500);
  }
});
