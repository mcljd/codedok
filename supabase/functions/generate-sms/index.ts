// CodedOK — Supabase Edge Function
// Generates a full 11-section Safety Management System using Claude, based
// on the operator's 7 inputs from the SMS wizard.
//
// Deploy: `supabase functions deploy generate-sms`
// Secret:  ANTHROPIC_API_KEY  (set in Supabase Dashboard → Edge Functions → generate-sms → Secrets)
//
// Invoke from the browser:
//   await Supa.client.functions.invoke('generate-sms', { body: inputs })
//
// Returns: { sections: { meta: {...}, hs_policy: {...}, ..., review: {...} },
//            model: 'claude-sonnet-4-6', usage: {...} }

import Anthropic from "npm:@anthropic-ai/sdk@^0.27.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS — allow the browser app on any origin to call this.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Per-user daily cap so a signed-in user can't loop this pricey call and
// run up the AI bill. Fail-open — telemetry hiccups never block a real
// user. Backed by public.ai_usage_log (migration 0022).
async function rateLimit(req: Request, fn: string, capPerDay: number): Promise<Response | null> {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !url || !anon || !svc) return null;
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u } = await caller.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return null;
    const service = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false } });
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await service.from("ai_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("auth_user_id", uid).eq("fn", fn).gte("at", since);
    if ((count || 0) >= capPerDay) {
      return new Response(JSON.stringify({ error: "rate_limited", detail: `Daily limit of ${capPerDay} reached — try again tomorrow.` }),
        { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
    }
    await service.from("ai_usage_log").insert({ auth_user_id: uid, fn });
    return null;
  } catch (_) {
    return null;
  }
}

// The 11-section schema, aligned to SPV Code 2025 Appendix 7. The model
// must return JSON keyed on these section ids in this order.
const SECTIONS = [
  { id: "meta",        title: "Vessel & company",                   ref: "App. 7 §1" },
  { id: "hs_policy",   title: "Health, Safety & Environmental Policy", ref: "App. 7 §2" },
  { id: "risk",        title: "Risk Assessments",                    ref: "App. 7 §3" },
  { id: "roles",       title: "Roles & Responsibilities",            ref: "App. 7 §4" },
  { id: "training",    title: "Training & Familiarisation",          ref: "App. 7 §5" },
  { id: "sop",         title: "Standard Operating Procedures",       ref: "App. 7 §6" },
  { id: "emergency",   title: "Emergency Procedures",                ref: "App. 7 §7" },
  { id: "reporting",   title: "Accident & Incident Reporting",       ref: "App. 7 §8" },
  { id: "maintenance", title: "Maintenance of Vessel & Equipment",   ref: "App. 7 §9" },
  { id: "cyber",       title: "Cyber Security",                      ref: "App. 7 §10 (new in 2025)" },
  { id: "review",      title: "Review & Continuous Improvement",     ref: "App. 7 §11" },
];

const SYSTEM_PROMPT = `You are an MCA-compliance writer drafting a Safety Management System for a UK
or Irish small commercial vessel under the Sport or Pleasure Vessel Code 2025
(or the Workboat Code Edition 3 where applicable).

The output must:
- Cover all 11 sections of SPV Code 2025 Appendix 7 by exact subsection
- Be operator-ready (the master can sign and use as-is)
- Use plain English a skipper would write themselves — no consultant-speak
- Be specific to the inputs provided (vessel name, category, operation)
- Match the MCA's own phrasing where the Code uses defined terms
- Reference specific subsections (e.g. "as required by §4.7") where it adds clarity

For each section return well-structured Markdown ready to read on paper. Use
bullet lists, short paragraphs, signature lines where appropriate ("Signed
______ Date ______").

Output JSON only, no preamble or commentary. The shape is:

{
  "meta":        { "summary": "<short paragraph>", "body": "<markdown>" },
  "hs_policy":   { "summary": "<short paragraph>", "body": "<markdown>" },
  ...
}

Every section MUST be present. If a section doesn't apply (e.g. cyber on a
single-handed dinghy with no electronics), still include it with a one-line
"Not applicable — <reason>" body.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured. Set it in Supabase → Edge Functions → Secrets." }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Abuse cap: 25 SMS generations / user / day. A real operator builds
  // one SMS per boat, not 25 — this only bites a loop.
  const limited = await rateLimit(req, "generate-sms", 25);
  if (limited) return limited;

  let inputs;
  try {
    inputs = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Pull out what we expect. Defensive — never crash on a missing field.
  const v = inputs.vessel || {};
  const userPrompt = `Write the 11 sections for ${v.name || "this vessel"}.

Inputs:
  Vessel name:        ${v.name || "—"}
  Vessel type:        ${v.type || inputs.operation_type || "—"}
  MCA category:       ${v.category || inputs.operating_area || "—"}
  Length:             ${v.length || "—"} m
  Persons (max):      ${inputs.passengers_max || v.persons || "—"}
  Crew (typical):     ${inputs.crew_size || "—"}
  Operation type:     ${inputs.operation_type || "—"}
  Operating area:     ${inputs.operating_area || "—"}
  Season:             ${inputs.season || "—"}
  Notable risks
   flagged by owner:  ${inputs.notable_risks || "(none flagged)"}

Section list (11 in this order, use these exact ids in the JSON):
${SECTIONS.map((s) => `  - ${s.id}  (${s.title}, ${s.ref})`).join("\n")}

Return JSON only.`;

  const anthropic = new Anthropic({ apiKey });

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Cache the static system prompt — 90% cheaper on repeat calls.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Claude API call failed", detail: String(err) }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Extract the text content (Claude returns content blocks)
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  // Parse the JSON. If Claude wrapped it in ```json ... ``` fences, strip.
  let sections;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    sections = JSON.parse(cleaned);
  } catch (_) {
    return new Response(JSON.stringify({ error: "Claude returned invalid JSON", raw: text }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    sections,
    model: response.model,
    usage: response.usage,
  }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
