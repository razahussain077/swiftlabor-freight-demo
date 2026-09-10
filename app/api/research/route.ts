import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    company: { type: "string" }, website: { type: "string" }, summary: { type: "string" },
    fitScore: { type: "integer", minimum: 0, maximum: 100 }, intentScore: { type: "integer", minimum: 0, maximum: 100 },
    priority: { type: "string", enum: ["HOT", "WARM", "LOW"] }, recommendedAction: { type: "string" },
    decisionMaker: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" }, confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"] }, whyRelevant: { type: "string" } }, required: ["name", "title", "linkedin", "confidence", "whyRelevant"] },
    decisionMakers: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" }, confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"] }, whyRelevant: { type: "string" }, evidence: { type: "string" } }, required: ["name", "title", "linkedin", "confidence", "whyRelevant", "evidence"] } },
    signals: { type: "array", items: { type: "object", additionalProperties: false, properties: { signal: { type: "string" }, evidence: { type: "string" }, strength: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }, sourceUrl: { type: "string" } }, required: ["signal", "evidence", "strength", "sourceUrl"] } },
    sources: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, url: { type: "string" }, type: { type: "string" } }, required: ["title", "url", "type"] } },
    risks: { type: "array", items: { type: "string" } },
    research: { type: "object", additionalProperties: false, properties: { searchesPerformed: { type: "integer", minimum: 0 }, pagesReviewed: { type: "integer", minimum: 0 }, evidenceBacked: { type: "boolean" }, confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }, notes: { type: "string" } }, required: ["searchesPerformed", "pagesReviewed", "evidenceBacked", "confidence", "notes"] }
  },
  required: ["company", "website", "summary", "fitScore", "intentScore", "priority", "recommendedAction", "decisionMaker", "decisionMakers", "signals", "sources", "risks", "research"]
};

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
function isAllowedUrl(value: string) { try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } }
function normalizeUrl(value: unknown) { const u = String(value ?? "").trim(); return isAllowedUrl(u) ? u : ""; }

function buildPrompt(company: string, icp: string) {
  return `You are Scout, SwiftLabor's senior B2B Lead Intelligence Agent. Conduct real evidence-led prospect research.\n\nLIVE RESEARCH IS REQUIRED. Use the live web-search tool before making company-specific claims. Search the official company site, leadership/team, public professional profiles, hiring/jobs, recent news, expansion, funding, acquisitions, technology and automation signals. Prefer primary and recent sources.\n\nDECISION-MAKER RULES:\n- Find the person who most plausibly owns the problem in the ICP; do not automatically choose the CEO.\n- Consider Founder/CEO/President, COO/Operations, VP/Director Operations, CTO/CIO/Technology and RevOps/Sales leadership as appropriate.\n- Never invent names, titles or LinkedIn URLs. If LinkedIn is not publicly verifiable, leave it empty and use UNVERIFIED.\n- Return up to 4 relevant decision makers ranked by relevance.\n\nBUYING SIGNALS:\nUse concrete company-specific triggers such as hiring, growth, expansion, new locations, funding, acquisitions, product launches, operational complexity, technology changes, AI/automation initiatives, CRM/revops investment or public statements. Separate observed evidence from inference.\n\nSCORING:\nfitScore = ICP fit. intentScore = strength and recency of company-specific buying evidence. HOT requires credible fit and intent; WARM is promising but less urgent; LOW otherwise. recommendedAction must be a concrete next sales action.\n\nEVIDENCE:\nEvery important claim must be traceable to a source. Include only URLs actually used. Do not fabricate URLs. It is better to return fewer verified findings than unsupported findings.\n\nCOMPANY OR DOMAIN: ${company}\nICP / QUALIFICATION CRITERIA: ${icp || "US B2B companies, 20–500 employees, active sales motion, and a credible need for lead research, qualification, buying-signal detection, or sales workflow automation."}\n\nReturn ONLY one valid JSON object matching this schema. No markdown or commentary.\n${JSON.stringify(schema)}`;
}

function normalizeRecord(result: any) {
  const record = result && typeof result === "object" ? result : {};
  record.website = normalizeUrl(record.website);
  record.sources = Array.isArray(record.sources) ? record.sources.filter((s: any) => s && normalizeUrl(s.url)).slice(0, 12).map((s: any) => ({ title: cleanText(s.title || "Web source", 180), url: normalizeUrl(s.url), type: cleanText(s.type || "web", 40) })) : [];
  record.sources = record.sources.filter((s: any, i: number, all: any[]) => all.findIndex((x: any) => x.url === s.url) === i);
  record.signals = Array.isArray(record.signals) ? record.signals.slice(0, 10).map((s: any) => ({ signal: cleanText(s.signal, 180), evidence: cleanText(s.evidence, 600), strength: ["HIGH", "MEDIUM", "LOW"].includes(s.strength) ? s.strength : "LOW", sourceUrl: normalizeUrl(s.sourceUrl) })) : [];
  record.decisionMakers = Array.isArray(record.decisionMakers) ? record.decisionMakers.slice(0, 4).map((p: any) => ({ name: cleanText(p.name, 120), title: cleanText(p.title, 140), linkedin: normalizeUrl(p.linkedin), confidence: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(p.confidence) ? p.confidence : "UNVERIFIED", whyRelevant: cleanText(p.whyRelevant, 400), evidence: cleanText(p.evidence, 500) })) : [];
  const p = record.decisionMaker || {};
  record.decisionMaker = { name: cleanText(p.name, 120), title: cleanText(p.title, 140), linkedin: normalizeUrl(p.linkedin), confidence: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(p.confidence) ? p.confidence : "UNVERIFIED", whyRelevant: cleanText(p.whyRelevant, 400) };
  if (!record.decisionMaker.name && record.decisionMakers[0]) record.decisionMaker = { ...record.decisionMakers[0], whyRelevant: record.decisionMakers[0].whyRelevant };
  record.risks = Array.isArray(record.risks) ? record.risks.slice(0, 8).map((r: any) => cleanText(r, 300)) : [];
  record.research = { searchesPerformed: Math.max(0, Number(record.research?.searchesPerformed || 0)), pagesReviewed: Math.max(0, Number(record.research?.pagesReviewed || 0)), evidenceBacked: Boolean(record.research?.evidenceBacked), confidence: ["HIGH", "MEDIUM", "LOW"].includes(record.research?.confidence) ? record.research.confidence : "LOW", notes: cleanText(record.research?.notes, 500) };
  return record;
}

function getOpenRouterApiKey() { return process.env.OPENROUTER_API_KEY || process.env.swift || process.env.SWIFT || process.env.openrouter; }
function getConfiguredModel() { return process.env.OPENROUTER_MODEL?.trim() || "openrouter/free"; }
function getProviderError(e: any) { return { status: Number(e?.status ?? e?.code ?? 0), message: String(e?.error?.message ?? e?.message ?? ""), raw: String(e?.error?.metadata?.raw ?? "") }; }

function repairJson(text: string) {
  let cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  // Models occasionally emit invalid backslash escapes inside otherwise valid JSON.
  cleaned = cleaned.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
  return cleaned;
}
function parseJsonOutput(text: string) {
  const cleaned = repairJson(text);
  try { return JSON.parse(cleaned); }
  catch { throw new Error("SCOUT_OPENROUTER_INVALID_JSON"); }
}

async function callOpenRouter(company: string, icp: string, model: string) {
  const apiKey = getOpenRouterApiKey(); if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://swiftlabor.ai", "X-Title": "SwiftLabor Scout" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a rigorous B2B research analyst. Use live web search. Never fabricate evidence. Return the requested JSON only." },
        { role: "user", content: buildPrompt(company, icp) }
      ],
      // Server tool is model-agnostic. OpenRouter documents this tool for live search across models.
      tools: [{ type: "openrouter:web_search", parameters: { engine: "auto", max_results: 5 } }],
      tool_choice: "auto",
      max_tool_calls: 8,
      temperature: 0.1,
      max_tokens: 7000,
      response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(120000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const e: any = new Error(String(payload?.error?.message || `OpenRouter HTTP ${response.status}`)); e.status = response.status; e.error = payload?.error; throw e; }
  const message = payload?.choices?.[0]?.message || {};
  const text = String(message.content || "");
  if (!text) throw new Error("SCOUT_OPENROUTER_EMPTY_OUTPUT");
  const record = normalizeRecord(parseJsonOutput(text));
  const annotations = Array.isArray(message.annotations) ? message.annotations : [];
  const citationSources = annotations.map((a: any) => a?.url_citation).filter((c: any) => c && isAllowedUrl(String(c.url || ""))).map((c: any) => ({ title: cleanText(c.title || "Web source", 180), url: String(c.url), type: "web-search" }));
  if (citationSources.length) record.sources = [...record.sources, ...citationSources].filter((s: any, i: number, all: any[]) => all.findIndex((x: any) => x.url === s.url) === i).slice(0, 12);
  if (record.research.searchesPerformed === 0 && citationSources.length) record.research.searchesPerformed = Math.max(1, Math.ceil(citationSources.length / 5));
  if (citationSources.length) record.research.evidenceBacked = true;
  return record;
}

async function runOpenRouter(company: string, icp: string) {
  const configured = getConfiguredModel();
  // Do not get stuck retrying the same exhausted free provider. The router can select another eligible free model.
  const models = [configured, "openrouter/free", "google/gemma-4-31b-it:free"].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return { record: await callOpenRouter(company, icp, model), model }; }
      catch (error) {
        lastError = error; const { status, message, raw } = getProviderError(error); const combined = `${message} ${raw}`.toLowerCase();
        const retryable = status === 429 || status === 502 || status === 503 || status === 504 || combined.includes("rate limit") || combined.includes("rate-limited") || combined.includes("temporarily unavailable") || combined.includes("upstream") || combined.includes("timeout");
        if (!retryable) throw error;
        if (attempt === 0) await new Promise(r => setTimeout(r, 900));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("SCOUT_OPENROUTER_FAILED");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid research request." }, { status: 400 });
    const company = cleanText((body as any).company, 200); const icp = cleanText((body as any).icp, 1000);
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });
    if (company.length < 2) return NextResponse.json({ error: "Enter a valid company name or domain." }, { status: 400 });
    try {
      const { record, model } = await runOpenRouter(company, icp);
      return NextResponse.json({ ...record, agent: "Scout", provider: "openrouter", model, liveResearch: true });
    } catch (providerError) {
      const { status, message, raw } = getProviderError(providerError); console.error("scout-openrouter-failed", { status, message, raw, model: getConfiguredModel() });
      const combined = `${message} ${raw}`.toLowerCase();
      const isRateLimited = status === 429 || combined.includes("rate-limited") || combined.includes("rate limit") || combined.includes("quota");
      const isUnauthorized = status === 401 || combined.includes("invalid api key") || combined.includes("unauthorized");
      const isModelError = status === 404 || (combined.includes("model") && (combined.includes("not found") || combined.includes("unavailable")));
      const isToolError = combined.includes("tool") && (combined.includes("not support") || combined.includes("unsupported"));
      const error = message === "OPENROUTER_API_KEY_MISSING" ? "OpenRouter API key is not configured. Add the Vercel environment variable named swift and redeploy." : isUnauthorized ? "OpenRouter rejected the API key. Check the Vercel variable named swift, then redeploy." : isRateLimited ? "OpenRouter's free providers are rate-limited right now. Scout tried multiple eligible models automatically; please try again shortly." : isToolError ? "The selected OpenRouter model cannot use live research tools. Scout needs a tool-capable model." : isModelError ? `The OpenRouter model is unavailable: ${getConfiguredModel()}.` : "Scout could not complete the live research. Check the deployment logs and try again.";
      return NextResponse.json({ error }, { status: isRateLimited ? 429 : 502 });
    }
  } catch (error) { console.error("lead-research-agent", error); return NextResponse.json({ error: "Scout could not complete the research. Please try again." }, { status: 500 }); }
}
