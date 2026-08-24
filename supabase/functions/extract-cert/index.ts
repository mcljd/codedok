// CodedOK — Supabase Edge Function: extract-cert
//
// Accepts a single certificate / equipment service document in any of:
//   - Image (JPEG, PNG, WebP) — phone snap
//   - PDF — surveyor's saved cert or scanner output
//   - DOCX — Word doc cert (rarer, but happens)
//
// Returns the structured fields ready to drop into a vessel's cert
// or equipment record. Powered by Claude Sonnet 4.6 (vision + document
// support). ~£0.01 per extraction.
//
// Deploy: paste into Supabase Dashboard → Edge Functions → New function
//         → name 'extract-cert' → paste → Deploy
//
// Secret needed: ANTHROPIC_API_KEY (already set for generate-sms).
//
// Invoke from the browser:
//   const { data } = await Supa.client.functions.invoke('extract-cert', {
//     body: { image: '<base64 string>', mimeType: 'application/pdf' }
//   });

import Anthropic from "npm:@anthropic-ai/sdk@^0.27.0";
import mammoth from "npm:mammoth@^1.6.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a marine compliance document reader for the UK and Ireland.

Given a photo or scanned image of ONE certificate, equipment service
document, or insurance schedule (issued under SOLAS, MCA, YDSA, Ofcom,
Survitec, Pantaenius, Topsail or similar), extract structured data.

Output JSON with this exact shape, no preamble or commentary:

{
  "kind": "cert" | "equipment",
  "type_hint": "coding" | "liferaft" | "pyrotechnics" | "epirb" | "pli"
              | "p_and_i" | "radio" | "stability" | "lifejacket" | "fire_ext"
              | "first_aid" | "vhf_fixed" | "anchor" | "mmsi" | "other",
  "name": "<as printed, short — e.g. 'YDSA Coding Certificate', 'Liferaft service'>",
  "issuer": "<as printed, e.g. 'YDSA', 'Survitec', 'Pantaenius', 'Ofcom'>",
  "number": "<certificate or serial number, as printed>",
  "issued_at": "<YYYY-MM-DD or null>",
  "expires_at": "<YYYY-MM-DD or null>",
  "next_service_at": "<YYYY-MM-DD or null — only for equipment service docs>",
  "vessel_name": "<as printed, or null if not visible>",
  "make": "<brand for equipment, or null>",
  "model": "<model for equipment, or null>",
  "confidence": "high" | "medium" | "low",
  "notes": "<one short sentence flagging anything ambiguous, or empty string>"
}

Rules:
- Date formats vary (DD/MM/YYYY, D Mmm YYYY, etc.) — always emit as YYYY-MM-DD.
- If the document is image-only and a value isn't legible, use null and
  flag in 'notes'.
- 'kind' = 'cert' for paper certificates, 'equipment' for items with a
  next service date (liferaft service, EPIRB battery, etc.).
- If unsure between cert and equipment, prefer 'cert'.
- 'confidence' = 'low' if multiple fields are obscured or guessed.
- Do NOT invent data. If unsure, null + note.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonError(500, "ANTHROPIC_API_KEY not configured.");
  }

  let body;
  try { body = await req.json(); }
  catch (_) { return jsonError(400, "Invalid JSON body"); }

  const image = body.image;
  const mimeType = body.mimeType || "image/jpeg";
  if (!image) return jsonError(400, "Missing 'image' (base64 string)");

  // Strip a 'data:application/pdf;base64,' prefix if the caller included it.
  const base64 = String(image).replace(/^data:[^;]+;base64,/, "");

  // Build the content block based on file type:
  //   image/*  -> vision (base64 image source)
  //   application/pdf -> document (Claude reads natively)
  //   docx -> extract text with mammoth, send as text
  let userContent: any[];

  if (/^image\//i.test(mimeType)) {
    userContent = [
      { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
      { type: "text", text: "Extract the structured fields. Return JSON only." },
    ];
  } else if (mimeType === "application/pdf") {
    userContent = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: "Extract the structured fields from this certificate PDF. Return JSON only." },
    ];
  } else if (/officedocument\.wordprocessingml\.document|msword/i.test(mimeType)) {
    // DOCX — extract plain text first (Claude can't read .docx binary).
    try {
      const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const { value: docxText } = await mammoth.extractRawText({ buffer });
      if (!docxText || !docxText.trim()) {
        return jsonError(400, "Couldn't read text from that DOCX. Try saving as PDF.");
      }
      userContent = [{
        type: "text",
        text: `The following is the plain-text contents of a Word document containing one marine certificate.\n\n---\n${docxText.slice(0, 20000)}\n---\n\nExtract the structured fields. Return JSON only.`,
      }];
    } catch (err) {
      return jsonError(400, "Couldn't parse the DOCX file", String(err));
    }
  } else {
    return jsonError(400, `Unsupported file type: ${mimeType}. Use JPEG/PNG/WebP, PDF, or DOCX.`);
  }

  const anthropic = new Anthropic({ apiKey });

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [{
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },  // cache the static prompt
      }],
      messages: [{ role: "user", content: userContent }],
    });
  } catch (err) {
    return jsonError(502, "Claude API call failed", String(err));
  }

  const text = response.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  let extraction;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    extraction = JSON.parse(cleaned);
  } catch (_) {
    return jsonError(502, "Claude returned invalid JSON", text);
  }

  return new Response(JSON.stringify({
    extraction,
    model: response.model,
    usage: response.usage,
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});

function jsonError(status: number, error: string, detail?: string) {
  return new Response(JSON.stringify({ error, detail }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
