import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = {
  type: "object",
  properties: {
    company: { type: "string" },
    website: { type: "string" },
    summary: { type: "string" },
    fitScore: { type: "integer" },
    intentScore: { type: "integer" },
    priority: { type: "string" },
    recommendedAction: { type: "string" },
    decisionMaker: {
      type: "object",
      properties: {
        name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" },
        confidence: { type: "string" }, whyRelevant: { type: "string" }
      },
      required: ["name", "title", "linkedin", "confidence", "whyRelevant"]
    },
    decisionMakers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" },
          confidence: { type: "string" }, whyRelevant: { type: "string" }, evidence: { type: "string" }
        },
        required: ["name", "title", "linkedin", "confidence", "whyRelevant", "evidence"]
      }
    },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signal: { type: "string" }, evidence: { type: "string" }, strength: { type: "string" }, sourceUrl: { type: "string" }
        },
        required: ["signal", "evidence", "strength", "sourceUrl"]
      }
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" }, type: { type: "string" } },
        required: ["title", "url", "type"]
      }
    },
    risks: { type: "array", items: { type: "string" } },
    research: {
      type: "object",
      properties: {
        searchesPerformed: { type: "integer" }, pagesReviewed: { type: "integer" }, evidenceBacked: { type: "boolean" },
        confidence: { type: "string" }, notes: { type: "string" }
      },
      required: ["searchesPerformed", "pagesReviewed", "evidenceBacked", "confidence", "notes"]
    }
  },
  required: ["company", "website", "summary", "fitScore", "intentScore", "priority", "recommendedAction", "decisionMaker", "decisionMakers", "signals", "sources", "risks", "research"]
};

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
function isAllowedUrl(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}
function normalizeUrl(value: unknown) { const u = String(value ?? "").trim(); return isAllowedUrl(u) ? u : ""; }

function buildPrompt(company: string, icp: string) {
  return `You are Scout, SwiftLabor's senior B2B Lead Intelligence Agent. Perform evidence-led prospect research for the company below.

MANDATORY LIVE RESEARCH: Use Google Search grounding before making company-specific claims. Research the official company website, leadership/team pages, public professional profiles, jobs/hiring, recent news, expansion, funding, acquisitions, technology/automation activity and other credible public sources. Prefer primary and recent sources.

DECISION MAKERS:
- Find the people who plausibly own the problem described by the ICP.
- Consider Founder/CEO/President, COO/Operations, VP/Director Operations, CTO/CIO/Technology, RevOps/Sales leadership as appropriate.
- Do NOT automatically choose the CEO.
- Never invent names, titles or LinkedIn URLs. If a LinkedIn profile cannot be verified from public evidence, leave linkedin empty and mark confidence UNVERIFIED.
- Return up to 4 relevant decision makers, ranked by relevance.

BUYING SIGNALS:
Identify concrete company-specific signals such as hiring, growth, expansion, new locations, funding, acquisitions, launches, operational complexity, technology changes, AI/automation initiatives, CRM/revenue operations investment or public statements. Clearly separate observed evidence from inference.

SCORING:
fitScore is ICP fit from 0-100. intentScore is strength and recency of buying evidence from 0-100. HOT requires both strong fit and credible intent. WARM is promising but less urgent. LOW otherwise. recommendedAction must be a specific next sales action.

EVIDENCE:
Every important claim must be supported by public evidence. Do not fabricate URLs. Use only sources actually found during research. It is better to return fewer verified findings than unsupported findings.

COMPANY OR DOMAIN: ${company}
ICP / QUALIFICATION CRITERIA: ${icp || "US B2B companies, 20–500 employees, active sales motion, and a credible need for lead research, qualification, buying-signal detection, or sales workflow automation."}

Return ONLY valid JSON matching the supplied schema. No markdown. No commentary.`;
}

function normalizeRecord(result: any) {
  const record = result && typeof result === "object" ? result : {};
  record.company = cleanText(record.company, 200);
  record.website = normalizeUrl(record.website);
  record.summary = cleanText(record.summary, 1200);
  record.fitScore = Math.max(0, Math.min(100, Number(record.fitScore || 0)));
  record.intentScore = Math.max(0, Math.min(100, Number(record.intentScore || 0)));
  record.priority = ["HOT", "WARM", "LOW"].includes(String(record.priority).toUpperCase()) ? String(record.priority).toUpperCase() : "LOW";
  record.recommendedAction = cleanText(record.recommendedAction, 600);
  record.sources = Array.isArray(record.sources) ? record.sources.filter((s: any) => s && normalizeUrl(s.url)).slice(0, 12).map((s: any) => ({ title: cleanText(s.title || "Web source", 180), url: normalizeUrl(s.url), type: cleanText(s.type || "web", 40) })) : [];
  record.sources = record.sources.filter((s: any, i: number, all: any[]) => all.findIndex((x: any) => x.url === s.url) === i);
  record.signals = Array.isArray(record.signals) ? record.signals.slice(0, 10).map((s: any) => ({ signal: cleanText(s.signal, 180), evidence: cleanText(s.evidence, 600), strength: ["HIGH", "MEDIUM", "LOW"].includes(String(s.strength).toUpperCase()) ? String(s.strength).toUpperCase() : "LOW", sourceUrl: normalizeUrl(s.sourceUrl) })) : [];
  record.decisionMakers = Array.isArray(record.decisionMakers) ? record.decisionMakers.slice(0, 4).map((p: any) => ({ name: cleanText(p.name, 120), title: cleanText(p.title, 140), linkedin: normalizeUrl(p.linkedin), confidence: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(String(p.confidence).toUpperCase()) ? String(p.confidence).toUpperCase() : "UNVERIFIED", whyRelevant: cleanText(p.whyRelevant, 400), evidence: cleanText(p.evidence, 500) })) : [];
  const p = record.decisionMaker || {};
  record.decisionMaker = { name: cleanText(p.name, 120), title: cleanText(p.title, 140), linkedin: normalizeUrl(p.linkedin), confidence: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(String(p.confidence).toUpperCase()) ? String(p.confidence).toUpperCase() : "UNVERIFIED", whyRelevant: cleanText(p.whyRelevant, 400) };
  if (!record.decisionMaker.name && record.decisionMakers[0]) record.decisionMaker = { ...record.decisionMakers[0] };
  record.risks = Array.isArray(record.risks) ? record.risks.slice(0, 8).map((r: any) => cleanText(r, 300)) : [];
  record.research = { searchesPerformed: Math.max(0, Number(record.research?.searchesPerformed || 0)), pagesReviewed: Math.max(0, Number(record.research?.pagesReviewed || 0)), evidenceBacked: Boolean(record.research?.evidenceBacked), confidence: ["HIGH", "MEDIUM", "LOW"].includes(String(record.research?.confidence).toUpperCase()) ? String(record.research.confidence).toUpperCase() : "LOW", notes: cleanText(record.research?.notes, 500) };
  return record;
}

function getGeminiKey() { return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""; }
function getGeminiModel() { return process.env.GEMINI_MODEL?.trim() || "gemini-3.7-flash"; }

async function callGemini(company: string, icp: string) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");
  const model = getGeminiModel();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(company, icp) }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 9000, responseMimeType: "application/json", responseSchema: schema }
    }),
    signal: AbortSignal.timeout(90000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error?.message || `Gemini HTTP ${response.status}`);
    const e: any = new Error(message); e.status = response.status; e.provider = payload?.error; throw e;
  }
  const candidate = payload?.candidates?.[0];
  const text = String(candidate?.content?.parts?.map((p: any) => p?.text || "").join("") || "");
  if (!text) throw new Error("SCOUT_GEMINI_EMPTY_OUTPUT");
  let record: any;
  try { record = JSON.parse(text); } catch { throw new Error("SCOUT_GEMINI_INVALID_JSON"); }
  record = normalizeRecord(record);

  const grounding = candidate?.groundingMetadata || {};
  const chunks = Array.isArray(grounding.groundingChunks) ? grounding.groundingChunks : [];
  const groundedSources = chunks.map((c: any) => ({ title: cleanText(c?.web?.title || "Web source", 180), url: normalizeUrl(c?.web?.uri), type: "google-search" })).filter((s: any) => s.url);
  record.sources = [...record.sources, ...groundedSources].filter((s: any, i: number, all: any[]) => all.findIndex((x: any) => x.url === s.url) === i).slice(0, 12);
  if (Array.isArray(grounding.webSearchQueries)) record.research.searchesPerformed = Math.max(record.research.searchesPerformed, grounding.webSearchQueries.length);
  record.research.pagesReviewed = Math.max(record.research.pagesReviewed, groundedSources.length);
  if (groundedSources.length) record.research.evidenceBacked = true;
  return { record, model };
}

async function callOpenRouterFallback(company: string, icp: string) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.swift || process.env.SWIFT || process.env.openrouter;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");
  const model = process.env.OPENROUTER_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b:free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://swiftlabor.ai", "X-Title": "SwiftLabor Scout" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: "You are a rigorous B2B research analyst. Use live web search. Never fabricate evidence. Return JSON only." }, { role: "user", content: buildPrompt(company, icp) }],
      tools: [{ type: "openrouter:web_search", parameters: { engine: "auto", max_results: 5, max_total_results: 15 } }],
      tool_choice: "auto", max_tool_calls: 6, temperature: 0.1, max_tokens: 7000
    }),
    signal: AbortSignal.timeout(75000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const e: any = new Error(String(payload?.error?.message || `OpenRouter HTTP ${response.status}`)); e.status = response.status; e.provider = payload?.error; throw e; }
  const text = String(payload?.choices?.[0]?.message?.content || "");
  if (!text) throw new Error("SCOUT_OPENROUTER_EMPTY_OUTPUT");
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("SCOUT_OPENROUTER_INVALID_JSON");
  const record = normalizeRecord(JSON.parse(text.slice(start, end + 1)));
  const annotations = Array.isArray(payload?.choices?.[0]?.message?.annotations) ? payload.choices[0].message.annotations : [];
  const sources = annotations.map((a: any) => a?.url_citation).filter((c: any) => c && normalizeUrl(c.url)).map((c: any) => ({ title: cleanText(c.title || "Web source", 180), url: normalizeUrl(c.url), type: "web-search" }));
  record.sources = [...record.sources, ...sources].filter((s: any, i: number, all: any[]) => all.findIndex((x: any) => x.url === s.url) === i).slice(0, 12);
  if (sources.length) record.research.evidenceBacked = true;
  record.research.pagesReviewed = Math.max(record.research.pagesReviewed, sources.length);
  return { record, model };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid research request." }, { status: 400 });
    const company = cleanText((body as any).company, 200);
    const icp = cleanText((body as any).icp, 1000);
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });
    if (company.length < 2) return NextResponse.json({ error: "Enter a valid company name or domain." }, { status: 400 });

    try {
      const result = getGeminiKey() ? await callGemini(company, icp) : await callOpenRouterFallback(company, icp);
      return NextResponse.json({ ...result.record, agent: "Scout", provider: getGeminiKey() ? "google-gemini" : "openrouter", model: result.model, liveResearch: true });
    } catch (providerError: any) {
      const status = Number(providerError?.status || 0);
      const message = String(providerError?.message || "");
      const lower = message.toLowerCase();
      console.error("scout-provider-failed", { status, message, provider: getGeminiKey() ? "google-gemini" : "openrouter", model: getGeminiKey() ? getGeminiModel() : (process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free") });
      const error = message === "GEMINI_API_KEY_MISSING" ? "Gemini API key is not configured. Add GEMINI_API_KEY in Vercel and redeploy." : status === 401 || lower.includes("api key") || lower.includes("unauthorized") ? "The AI provider rejected the API key. Check the Vercel environment variable and redeploy." : status === 429 || lower.includes("quota") || lower.includes("rate limit") ? "The AI provider quota/rate limit was reached. Scout stopped immediately instead of looping and getting stuck." : lower.includes("search") && (lower.includes("not supported") || lower.includes("unsupported")) ? "Live web search is not available for the configured model. Choose a Gemini model with Search grounding enabled." : "Scout could not complete live research. Check the deployment logs for the provider error.";
      return NextResponse.json({ error }, { status: status === 429 ? 429 : 502 });
    }
  } catch (error) {
    console.error("lead-research-agent", error);
    return NextResponse.json({ error: "Scout could not complete the research. Please try again." }, { status: 500 });
  }
}
