// Shared helpers for Sign in with Apple server calls (token exchange + revoke).
// Secrets (Supabase → Edge Functions → Secrets):
//   APPLE_TEAM_ID      — 10-character Apple Developer Team ID
//   APPLE_KEY_ID       — Key ID of a "Sign in with Apple" key
//   APPLE_PRIVATE_KEY  — the full text of that key's .p8 file
//   APPLE_CLIENT_ID    — optional, defaults to the app's bundle id

const TEAM_ID = Deno.env.get("APPLE_TEAM_ID") || "";
const KEY_ID = Deno.env.get("APPLE_KEY_ID") || "";
const PRIVATE_KEY = (Deno.env.get("APPLE_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
export const CLIENT_ID = Deno.env.get("APPLE_CLIENT_ID") || "com.codedok.app";

export const appleConfigured = () => !!(TEAM_ID && KEY_ID && PRIVATE_KEY);

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data as ArrayBuffer);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Apple wants a short-lived ES256 JWT signed with the .p8 key as client_secret.
async function clientSecret(): Promise<string> {
  const pem = PRIVATE_KEY.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: TEAM_ID, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: CLIENT_ID }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`; // WebCrypto already returns raw r||s, as JWS requires
}

// Exchange the one-time authorization code from sign-in for a refresh token.
export async function exchangeCode(code: string): Promise<string | null> {
  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: await clientSecret(), code, grant_type: "authorization_code" }),
  });
  if (!res.ok) { console.error("apple token exchange failed", res.status, await res.text()); return null; }
  const j = await res.json();
  return j.refresh_token || null;
}

// Revoke a refresh token. Returns true when Apple accepted it.
export async function revokeToken(refreshToken: string): Promise<boolean> {
  const res = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: await clientSecret(), token: refreshToken, token_type_hint: "refresh_token" }),
  });
  if (!res.ok) console.error("apple revoke failed", res.status, await res.text());
  return res.ok;
}
