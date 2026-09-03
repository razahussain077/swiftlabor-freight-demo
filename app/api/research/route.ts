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
    research: { type: "object", additionalProperties: false, properties: { searchesPerformed: { type: "integer", minimum: 0 }, pagesReviewed: { type: "integer", minimum: 0 }, evidenceBacked: { type: "boolean" }, confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }, notes: { type: "string" } }, required: ["searchesPerformed", "pagesReviewed", "evidenceBacked", "confidence", "notes"] },
  },
  required: ["company", "website", "summary", "fitScore", "intentScore", "priority", "recommendedAction", "decisionMaker", "decisionMakers", "signals", "sources", "risks", "research"],
};

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
function isAllowedUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; } }
function normalizeUrl(value: unknown) { const url = String(value ?? "").trim(); return isAllowedUrl(url) ? url : ""; }

function buildPrompt(company: string, icp: string) {
  return `You are Scout, SwiftLabor's senior B2B Lead Intelligence Agent. Your job is to conduct real, evidence-led prospect research for a sales team.\n\nLIVE RESEARCH IS REQUIRED. You have access to a web-search tool. Use it deliberately; do not answer from memory when a fact can be checked. Search multiple angles when useful: official company site, leadership/team, LinkedIn/public professional profiles, hiring/jobs, recent news/press releases, funding/expansion/acquisitions, technology/automation signals, and evidence related to the ICP. Prefer primary sources and recent sources.\n\nDECISION-MAKER RULES:\n- Find the person who most plausibly owns the problem described by the ICP, not automatically the CEO.\n- Consider Founder/CEO/President, COO/Operations, VP/Director of Operations, CTO/CIO/Technology, RevOps/Sales leadership as appropriate.\n- A person must be supported by a public source. Never invent a name, title or LinkedIn URL.\n- If LinkedIn is not publicly verifiable, leave linkedin empty and set confidence to UNVERIFIED rather than guessing.\n- Return up to 4 relevant decision makers, ranked by relevance.\n\nBUYING-SIGNAL RULES:\nLook for concrete triggers such as active hiring, growth/expansion, new locations, funding, acquisitions, product launches, increased sales hiring, operational complexity, technology changes, AI/automation initiatives, CRM/revops investment, or public statements indicating the problem. Distinguish observed evidence from inference. Do not treat generic industry trends as company-specific intent.\n\nSCORING:\n- fitScore = how strongly the account matches the supplied ICP.\n- intentScore = strength and recency of company-specific buying/trigger evidence.\n- priority HOT only when both fit and intent are credible; WARM for a promising but less urgent account; LOW otherwise.\n- recommendedAction must be a concrete next sales action and explain why.\n\nEVIDENCE:\nEvery important claim should be traceable to a source. Include source URLs actually used. Do not fabricate URLs. If evidence conflicts, say so in risks/notes. It is acceptable to return fewer findings rather than unsupported findings.\n\nCOMPANY OR DOMAIN: ${company}\nICP / QUALIFICATION CRITERIA: ${icp || "US B2B companies, 20–500 employees, active sales motion, and a credible need for lead research, qualification, buying-signal detection, or sales workflow automation."}\n\nReturn ONLY one valid JSON object matching this schema. No markdown, no code fences, no commentary.\n${JSON.stringify(schema)}`;
}

function normalizeRecord(result: unknown) {
  const record = result as Record<string, any>;
  record.website = normalizeUrl(record.website);
  record.sources = Array.isArray(record.sources) ? record.sources.filter((s: any) => s && normalizeUrl(s.url)).slice(0, 12).map((s: any) => ({ title: cleanText(s.title || "Web source", 180), url: normalizeUrl(s.url), type: cleanText(s.type || "web", 40) })) : [];
  record.sources = record.sources.filter((s: any, i: number, all: any[]) => all.findIndex((x: any) => x.url === s.url) === i);
  record.signals = Array.isArray(record.signals) ? record.signals.slice(0, 10).map((s: any) => ({ signal: cleanText(s.signal, 180), evidence: cleanText(s.evidence, 600), strength: ["HIGH", "MEDIUM", "LOW"].includes(s.strength) ? s.strength : "LOW", sourceUrl: normalizeUrl(s.sourceUrl) })) : [];
  record.decisionMakers = Array.isArray(record.decisionMakers) ? record.decisionMakers.slice(0, 4).map((p: any) => ({ name: cleanText(p.name, 120), title: cleanText(p.title, 140), linkedin: normalizeUrl(p.linkedin), confidence: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(p.confidence) ? p.confidence : "UNVERIFIED", whyRelevant: cleanText(p.whyRelevant, 400), evidence: cleanText(p.evidence, 500) })) : [];
  const primary = record.decisionMaker || {};
  record.decisionMaker = { name: cleanText(primary.name, 120), title: cleanText(primary.title, 140), linkedin: normalizeUrl(primary.linkedin), confidence: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"].includes(primary.confidence) ? primary.confidence : "UNVERIFIED", whyRelevant: cleanText(primary.whyRelevant, 400) };
  if (!record.decisionMaker.name && record.decisionMakers[0]) record.decisionMaker = { ...record.decisionMakers[0], whyRelevant: record.decisionMakers[0].whyRelevant };
  record.risks = Array.isArray(record.risks) ? record.risks.slice(0, 8).map((r: any) => cleanText(r, 300)) : [];
  record.research = { searchesPerformed: Math.max(0, Number(record.research?.searchesPerformed || 0)), pagesReviewed: Math.max(0, Number(record.research?.pagesReviewed || 0)), evidenceBacked: Boolean(record.research?.evidenceBacked), confidence: ["HIGH", "MEDIUM", "LOW"].includes(record.research?.confidence) ? record.research.confidence : "LOW", notes: cleanText(record.research?.notes, 500) };
  return record;
}

function getOpenRouterApiKey() { return process.env.OPENROUTER_API_KEY || process.env.swift || process.env.SWIFT || process.env.openrouter; }
function getOpenRouterModel() { const configured = process.env.OPENROUTER_MODEL?.trim(); if (!configured || configured === "moonshotai/kimi-k2.6:free" || configured === "google/gemma-4-31b-it:free") return "openrouter/free"; return configured; }
function getProviderError(providerError: unknown) { const error = providerError as any; return { status: Number(error?.status ?? error?.code ?? 0), message: String(error?.error?.message ?? error?.message ?? ""), raw: String(error?.error?.metadata?.raw ?? "") }; }
function parseJsonOutput(text: string) { const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim(); try { return JSON.parse(cleaned); } catch { const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}"); if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)); throw new Error("SCOUT_OPENROUTER_INVALID_JSON"); } }

async function runOpenRouter(company: string, icp: string) {
  const apiKey = getOpenRouterApiKey(); if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");
  const model = getOpenRouterModel();
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://swiftlabor.ai", "X-Title": "SwiftLabor Scout" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a rigorous B2B research analyst. Use the live web-search tool when facts need verification. Never fabricate evidence. Return the requested JSON only." },
            { role: "user", content: buildPrompt(company, icp) },
          ],
          tools: [{ type: "openrouter:web_search", parameters: { engine: "auto", max_results: 5, max_total_results: 20, search_context_size: "high" } }],
          tool_choice: "auto",
          max_tool_calls: 8,
          temperature: 0.1,
          max_tokens: 7000,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { const error: any = new Error(String(payload?.error?.message || `OpenRouter HTTP ${response.status}`)); error.status = response.status; error.error = payload?.error; throw error; }
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
    } catch (error) {
      lastError = error; const { status, message, raw } = getProviderError(error); const combined = `${message} ${raw}`.toLowerCase();
      const retryable = status === 429 || status === 502 || status === 503 || status === 504 || combined.includes("rate-limited") || combined.includes("rate limit") || combined.includes("temporarily unavailable") || combined.includes("upstream") || combined.includes("timeout");
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("SCOUT_OPENROUTER_FAILED");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid research request." }, { status: 400 });
    const company = cleanText((body as Record<string, unknown>).company, 200); const icp = cleanText((body as Record<string, unknown>).icp, 1000);
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });
    if (company.length < 2) return NextResponse.json({ error: "Enter a valid company name or domain." }, { status: 400 });
    try { const record = await runOpenRouter(company, icp); return NextResponse.json({ ...record, agent: "Scout", provider: "openrouter", model: getOpenRouterModel(), liveResearch: true }); }
    catch (providerError) {
      const { status, message, raw } = getProviderError(providerError); console.error("scout-openrouter-failed", { status, message, raw, model: getOpenRouterModel() });
      const combined = `${message} ${raw}`.toLowerCase(); const isRateLimited = status === 429 || combined.includes("rate-limited") || combined.includes("rate limit") || combined.includes("quota"); const isUnauthorized = status === 401 || combined.includes("invalid api key") || combined.includes("unauthorized"); const isModelError = status === 404 || (combined.includes("model") && (combined.includes("not found") || combined.includes("unavailable"))); const isToolError = combined.includes("tool") && (combined.includes("not support") || combined.includes("unsupported"));
      const error = message === "OPENROUTER_API_KEY_MISSING" ? "OpenRouter API key is not configured. Add the Vercel environment variable named swift and redeploy." : isUnauthorized ? "OpenRouter rejected the API key. Check the Vercel variable named swift, then redeploy." : isRateLimited ? "Free model providers or web search are temporarily rate-limited. Scout retried automatically; please try again shortly." : isToolError ? "The selected OpenRouter model cannot use live research tools. Choose a tool-capable model in OPENROUTER_MODEL." : isModelError ? `The OpenRouter model is unavailable: ${getOpenRouterModel()}. Set OPENROUTER_MODEL to an available model.` : "Scout could not complete the live research. Check the deployment logs and try again.";
      return NextResponse.json({ error }, { status: isRateLimited ? 429 : 502 });
    }
  } catch (error) { console.error("lead-research-agent", error); return NextResponse.json({ error: "Scout could not complete the research. Please try again." }, { status: 500 }); }
}
