import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: "string" }, website: { type: "string" }, summary: { type: "string" },
    fitScore: { type: "integer" }, intentScore: { type: "integer" }, priority: { type: "string" }, recommendedAction: { type: "string" },
    decisionMaker: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" }, confidence: { type: "string" }, whyRelevant: { type: "string" } }, required: ["name", "title", "linkedin", "confidence", "whyRelevant"] },
    decisionMakers: { type: "array", maxItems: 3, items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" }, confidence: { type: "string" }, whyRelevant: { type: "string" }, evidence: { type: "string" } }, required: ["name", "title", "linkedin", "confidence", "whyRelevant", "evidence"] } },
    signals: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, properties: { signal: { type: "string" }, evidence: { type: "string" }, strength: { type: "string" }, sourceUrl: { type: "string" } }, required: ["signal", "evidence", "strength", "sourceUrl"] } },
    sources: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, url: { type: "string" }, type: { type: "string" } }, required: ["title", "url", "type"] } },
    risks: { type: "array", maxItems: 5, items: { type: "string" } },
    research: { type: "object", additionalProperties: false, properties: { searchesPerformed: { type: "integer" }, pagesReviewed: { type: "integer" }, evidenceBacked: { type: "boolean" }, confidence: { type: "string" }, notes: { type: "string" } }, required: ["searchesPerformed", "pagesReviewed", "evidenceBacked", "confidence", "notes"] }
  },
  required: ["company", "website", "summary", "fitScore", "intentScore", "priority", "recommendedAction", "decisionMaker", "decisionMakers", "signals", "sources", "risks", "research"]
};

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
function env(name: string) { return process.env[name]?.trim() || ""; }
function normalizeUrl(value: unknown) { const raw = String(value ?? "").trim(); try { const u = new URL(raw); return u.protocol === "https:" || u.protocol === "http:" ? raw : ""; } catch { return ""; } }
function uniqueByUrl<T extends { url: string }>(items: T[]) { return items.filter((x, i, a) => x.url && a.findIndex(y => y.url === x.url) === i); }

function buildQueries(company: string, icp: string) {
  const context = icp ? ` ${icp.slice(0, 240)}` : "";
  return [
    `"${company}" official company website services leadership${context}`,
    `"${company}" CEO OR COO OR President OR Founder OR "VP Sales" OR "VP Operations" LinkedIn leadership`,
    `"${company}" hiring OR expansion OR acquisition OR funding OR growth OR technology OR automation OR "new location"`
  ];
}

function buildPrompt(company: string, icp: string, evidence: any[]) {
  const compact = evidence.map((r, i) => ({ source: i + 1, query: r.query, title: r.title, url: r.url, content: r.content }));
  return `You are Scout, a senior B2B lead-intelligence analyst. Analyze ONLY the supplied live web evidence and return one compact qualification record.

COMPANY: ${company}
ICP: ${icp || "US B2B companies, 20–500 employees, active sales motion, and a credible need for lead research, qualification, buying-signal detection, or sales automation."}

TASKS:
1. Identify what the company does and its official website.
2. Identify up to 3 real decision makers relevant to the ICP problem. Prefer COO, President, Founder, Head/VP Sales, Operations, Revenue, or similar owners.
3. Identify up to 5 concrete buying signals. Prefer recent hiring, expansion, acquisition, funding, new locations, operational growth, technology/automation initiatives, or public statements.
4. Score fit and intent separately from 0–100. HOT requires strong evidence for both; otherwise WARM or LOW.
5. Give one concrete next sales action.

STRICT RULES:
- Use ONLY the supplied evidence. Do not claim to browse anything else.
- Never invent names, titles, URLs, dates, facts, employee counts, signals, or company details.
- If a LinkedIn URL is not explicitly supported by evidence, return an empty string.
- Distinguish observed evidence from inference.
- Use exact source URLs supplied below.
- Keep the answer concise.
- Return ONLY one valid JSON object. No markdown fences. No commentary before or after the JSON.

JSON SHAPE:
${JSON.stringify(schema)}

LIVE WEB EVIDENCE:
${JSON.stringify(compact)}`;
}

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{"); if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

function normalizeRecord(result: any) {
  const r = result && typeof result === "object" ? result : {};
  r.company = cleanText(r.company, 200); r.website = normalizeUrl(r.website); r.summary = cleanText(r.summary, 1000);
  r.fitScore = Math.max(0, Math.min(100, Number(r.fitScore) || 0)); r.intentScore = Math.max(0, Math.min(100, Number(r.intentScore) || 0));
  r.priority = ["HOT", "WARM", "LOW"].includes(String(r.priority).toUpperCase()) ? String(r.priority).toUpperCase() : "LOW";
  r.recommendedAction = cleanText(r.recommendedAction, 500);
  r.decisionMakers = Array.isArray(r.decisionMakers) ? r.decisionMakers.slice(0, 3).map((p: any) => ({ name: cleanText(p?.name, 120), title: cleanText(p?.title, 140), linkedin: normalizeUrl(p?.linkedin), confidence: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(String(p?.confidence).toUpperCase()) ? String(p.confidence).toUpperCase() : "UNVERIFIED", whyRelevant: cleanText(p?.whyRelevant, 350), evidence: cleanText(p?.evidence, 450) })) : [];
  const p = r.decisionMaker || {};
  r.decisionMaker = { name: cleanText(p.name, 120), title: cleanText(p.title, 140), linkedin: normalizeUrl(p.linkedin), confidence: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(String(p.confidence).toUpperCase()) ? String(p.confidence).toUpperCase() : "UNVERIFIED", whyRelevant: cleanText(p.whyRelevant, 350) };
  if (!r.decisionMaker.name && r.decisionMakers[0]) r.decisionMaker = { name: r.decisionMakers[0].name, title: r.decisionMakers[0].title, linkedin: r.decisionMakers[0].linkedin, confidence: r.decisionMakers[0].confidence, whyRelevant: r.decisionMakers[0].whyRelevant };
  r.signals = Array.isArray(r.signals) ? r.signals.slice(0, 5).map((s: any) => ({ signal: cleanText(s?.signal, 160), evidence: cleanText(s?.evidence, 500), strength: ["HIGH", "MEDIUM", "LOW"].includes(String(s?.strength).toUpperCase()) ? String(s.strength).toUpperCase() : "LOW", sourceUrl: normalizeUrl(s?.sourceUrl) })) : [];
  r.sources = Array.isArray(r.sources) ? uniqueByUrl(r.sources.slice(0, 8).map((s: any) => ({ title: cleanText(s?.title || "Web source", 160), url: normalizeUrl(s?.url), type: cleanText(s?.type || "web", 40) }))) : [];
  r.risks = Array.isArray(r.risks) ? r.risks.slice(0, 5).map((x: any) => cleanText(x, 250)) : [];
  r.research = { searchesPerformed: Math.max(0, Number(r.research?.searchesPerformed) || 0), pagesReviewed: Math.max(0, Number(r.research?.pagesReviewed) || 0), evidenceBacked: Boolean(r.research?.evidenceBacked), confidence: ["HIGH", "MEDIUM", "LOW"].includes(String(r.research?.confidence).toUpperCase()) ? String(r.research.confidence).toUpperCase() : "LOW", notes: cleanText(r.research?.notes, 450) };
  return r;
}

async function tavilySearch(query: string) {
  const key = env("TAVILY_API_KEY");
  if (!key) { const e: any = new Error("TAVILY_API_KEY_MISSING"); e.status = 503; throw e; }
  const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, search_depth: "basic", topic: "general", max_results: 6, include_answer: false, include_raw_content: false, include_images: false }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const e: any = new Error(String(payload?.detail || payload?.message || `Tavily HTTP ${response.status}`)); e.status = response.status; throw e; }
  return Array.isArray(payload?.results) ? payload.results.map((r: any) => ({ query, title: cleanText(r?.title, 180), url: normalizeUrl(r?.url), content: cleanText(r?.content, 1400), score: Number(r?.score) || 0 })).filter((r: any) => r.url && r.content) : [];
}

async function requestModel(key: string, model: string, prompt: string, jsonMode: boolean) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const body: any = { model, messages: [{ role: "system", content: "You are a precise B2B lead research analyst. Output one valid JSON object only." }, { role: "user", content: prompt }], temperature: 0.1, max_tokens: 3000 };
    if (jsonMode) body.response_format = { type: "json_object" };
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "https://swiftlabor-freight-demo.vercel.app", "X-Title": "SwiftLabor Scout" }, signal: controller.signal, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const e: any = new Error(String(payload?.error?.message || `OpenRouter HTTP ${response.status}`)); e.status = response.status; throw e; }
    const message = payload?.choices?.[0]?.message || {};
    let text = typeof message.content === "string" ? message.content : Array.isArray(message.content) ? message.content.map((x: any) => typeof x === "string" ? x : x?.text || "").join("") : "";
    if (!text && typeof message.reasoning === "string") text = message.reasoning;
    if (!text) { const e: any = new Error("SCOUT_OPENROUTER_EMPTY_OUTPUT"); e.status = 502; throw e; }
    const record = extractJson(text);
    if (!record) { console.error("scout-openrouter-non-json", { model: payload?.model || model, finishReason: payload?.choices?.[0]?.finish_reason || "", preview: text.slice(0, 500) }); const e: any = new Error("SCOUT_OPENROUTER_INVALID_JSON"); e.status = 502; throw e; }
    return { record: normalizeRecord(record), model: payload?.model || model };
  } catch (error: any) { if (error?.name === "AbortError") { const e: any = new Error("Scout AI analysis timed out. Please try the company again."); e.status = 504; throw e; } throw error; }
  finally { clearTimeout(timeout); }
}

async function callOpenRouter(company: string, icp: string, evidence: any[]) {
  const key = env("OPENROUTER_API_KEY"); if (!key) { const e: any = new Error("OPENROUTER_API_KEY_MISSING"); e.status = 503; throw e; }
  const prompt = buildPrompt(company, icp, evidence);
  try {
    return await requestModel(key, "google/gemma-4-26b-a4b-it:free", prompt, true);
  } catch (primaryError: any) {
    console.warn("scout-primary-free-model-failed", { message: String(primaryError?.message || "") });
    return await requestModel(key, "openrouter/free", prompt, false);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid research request." }, { status: 400 });
    const company = cleanText((body as any).company, 200); const icp = cleanText((body as any).icp, 1000);
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });
    try {
      const queries = buildQueries(company, icp);
      const searchBatches = await Promise.all(queries.map(tavilySearch));
      const allEvidence = uniqueByUrl(searchBatches.flat()).sort((a: any, b: any) => b.score - a.score).slice(0, 16);
      if (!allEvidence.length) { const e: any = new Error("SCOUT_NO_WEB_RESULTS"); e.status = 502; throw e; }
      const result = await callOpenRouter(company, icp, allEvidence);
      const evidenceSources = allEvidence.map((x: any) => ({ title: x.title, url: x.url, type: "web-search" }));
      result.record.sources = uniqueByUrl([...result.record.sources, ...evidenceSources]).slice(0, 8);
      result.record.research.searchesPerformed = queries.length; result.record.research.pagesReviewed = allEvidence.length; result.record.research.evidenceBacked = true;
      if (!result.record.research.notes) result.record.research.notes = "Scout researched live web results with Tavily and analyzed the evidence with a free OpenRouter model.";
      return NextResponse.json({ ...result.record, agent: "Scout", provider: "openrouter-free", model: result.model, liveResearch: true });
    } catch (providerError: any) {
      const status = Number(providerError?.status) || 502; const message = String(providerError?.message || ""); const lower = message.toLowerCase();
      console.error("scout-provider-failed", { status, message, provider: lower.includes("tavily") ? "tavily" : "openrouter-free" });
      let error = "A research provider is temporarily unavailable. Please retry in a moment.";
      if (message === "TAVILY_API_KEY_MISSING") error = "Scout is not configured yet. Add TAVILY_API_KEY in Vercel.";
      else if (message === "OPENROUTER_API_KEY_MISSING") error = "Scout is not configured yet. Add OPENROUTER_API_KEY in Vercel.";
      else if (message === "SCOUT_NO_WEB_RESULTS") error = "Scout could not find live web evidence for this company. Try a more specific company name or domain.";
      else if (status === 429) error = "The free research model is temporarily rate-limited. Please retry in a minute.";
      else if (status === 504) error = "Scout AI analysis timed out. Please retry the company.";
      return NextResponse.json({ error }, { status: status >= 400 && status <= 599 ? status : 502 });
    }
  } catch { return NextResponse.json({ error: "Scout could not process this research request." }, { status: 500 }); }
}
