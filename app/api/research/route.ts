import { NextResponse } from "next/server";

export const runtime = "nodejs";

const clean = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const env = (name: string) => process.env[name]?.trim() || "";
const url = (v: unknown) => { try { const x = new URL(String(v ?? "").trim()); return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : ""; } catch { return ""; } };
const unique = <T extends { url: string }>(items: T[]) => items.filter((x, i, a) => x.url && a.findIndex(y => y.url === x.url) === i);

function queries(company: string, icp: string) {
  const c = icp ? ` ${icp.slice(0, 220)}` : "";
  return [
    `"${company}" official website company services leadership${c}`,
    `"${company}" CEO OR COO OR President OR Founder OR "VP Sales" OR "VP Operations" LinkedIn`,
    `"${company}" hiring OR expansion OR acquisition OR funding OR growth OR automation OR technology OR "new location"`
  ];
}

async function tavily(query: string) {
  const key = env("TAVILY_API_KEY");
  if (!key) throw Object.assign(new Error("TAVILY_API_KEY_MISSING"), { status: 503 });
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: "basic", topic: "general", max_results: 6, include_answer: false, include_raw_content: false, include_images: false })
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(clean(p?.detail || p?.message || `Tavily HTTP ${r.status}`)), { status: r.status });
  return Array.isArray(p?.results) ? p.results.map((x: any) => ({ query, title: clean(x?.title, 180), url: url(x?.url), content: clean(x?.content, 1400), score: Number(x?.score) || 0 })).filter((x: any) => x.url && x.content) : [];
}

function baseRecord(company: string, evidence: any[]) {
  const top = evidence[0];
  const text = evidence.map(x => `${x.title} ${x.content}`).join(" ").toLowerCase();
  const signals = evidence.filter(x => /hiring|expansion|acquisition|funding|growth|new location|automation|technology|warehouse|fleet|capacity|contract/i.test(`${x.title} ${x.content}`)).slice(0, 5).map(x => ({
    signal: clean(x.title, 160), evidence: clean(x.content, 500), strength: /funding|acquisition|expansion|new location/i.test(`${x.title} ${x.content}`) ? "HIGH" : "MEDIUM", sourceUrl: x.url
  }));
  const fit = Math.min(95, 55 + (text.includes("logistics") || text.includes("transportation") || text.includes("supply chain") ? 25 : 10) + (text.includes("automation") || text.includes("technology") ? 10 : 0));
  const intent = Math.min(95, 40 + signals.length * 10 + (text.includes("hiring") ? 10 : 0));
  return {
    company, website: top?.url || "", summary: clean(top?.content || `Live web research completed for ${company}.`, 1000),
    fitScore: fit, intentScore: intent, priority: fit >= 75 && intent >= 70 ? "HOT" : fit >= 60 || intent >= 55 ? "WARM" : "LOW",
    recommendedAction: intent >= 70 ? "Contact an operations, sales, revenue, or executive owner with a specific automation hypothesis backed by the observed growth signal." : "Validate the operating pain with a short discovery message before proposing automation.",
    decisionMaker: { name: "", title: "", linkedin: "", confidence: "UNVERIFIED", whyRelevant: "No decision-maker identity is returned unless the live evidence explicitly supports it." },
    decisionMakers: [], signals,
    sources: unique(evidence.map(x => ({ title: x.title, url: x.url, type: "web-search" }))).slice(0, 8),
    risks: ["Free-model analysis may be unavailable; report is evidence-first and does not invent missing decision-maker identities."],
    research: { searchesPerformed: 3, pagesReviewed: evidence.length, evidenceBacked: true, confidence: evidence.length >= 8 ? "HIGH" : evidence.length >= 4 ? "MEDIUM" : "LOW", notes: "Live web evidence collected with Tavily. Scout can return this evidence-backed report even when the optional free LLM analyst is unavailable." }
  };
}

function prompt(company: string, icp: string, evidence: any[]) {
  return `You are Scout, a senior B2B lead-intelligence analyst. Analyze ONLY the supplied live evidence for ${company}. ICP: ${icp || "US B2B companies that can buy lead research, qualification, buying-signal detection, or sales automation."}.
Return ONLY valid JSON with these keys: company,website,summary,fitScore,intentScore,priority,recommendedAction,decisionMaker,decisionMakers,signals,sources,risks,research.
Rules: never invent names, titles, LinkedIn URLs, dates, facts, or signals. Use only supplied evidence. Priority must be HOT, WARM, or LOW. decisionMakers max 3. signals max 5. sources max 8. If a person or URL is not explicitly supported, leave it empty. Keep it concise.
LIVE EVIDENCE: ${JSON.stringify(evidence.map((x,i)=>({source:i+1,title:x.title,url:x.url,content:x.content})))} `;
}

function parseJson(text: string) {
  const s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"); const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

async function model(key: string, modelName: string, p: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "HTTP-Referer": "https://swiftlabor-freight-demo.vercel.app", "X-Title": "SwiftLabor Scout" },
      signal: controller.signal,
      body: JSON.stringify({ model: modelName, messages: [{ role: "system", content: "Return one valid JSON object only." }, { role: "user", content: p }], temperature: 0.1, max_tokens: 3500, response_format: { type: "json_object" } })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(body?.error?.message || `OpenRouter HTTP ${r.status}`));
    const m = body?.choices?.[0]?.message || {};
    const text = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((x: any) => x?.text || "").join("") : "";
    const parsed = parseJson(text);
    if (!parsed) throw new Error(`OpenRouter returned non-JSON (${body?.model || modelName}; ${body?.choices?.[0]?.finish_reason || "unknown"})`);
    return { record: parsed, model: body?.model || modelName };
  } finally { clearTimeout(timer); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const company = clean(body?.company, 200);
    const icp = clean(body?.icp, 1000);
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });

    const qs = queries(company, icp);
    const batches = await Promise.all(qs.map(tavily));
    const evidence = unique(batches.flat().sort((a: any, b: any) => b.score - a.score)).slice(0, 16);
    if (!evidence.length) throw Object.assign(new Error("SCOUT_NO_WEB_RESULTS"), { status: 502 });

    let record = baseRecord(company, evidence);
    let provider = "tavily-evidence";
    let modelName = "evidence-fallback";

    const key = env("OPENROUTER_API_KEY");
    if (key) {
      try {
        const analyzed = await model(key, "openrouter/free", prompt(company, icp, evidence));
        record = { ...record, ...analyzed.record };
        provider = "openrouter-free";
        modelName = analyzed.model;
      } catch (e: any) {
        console.warn("scout-llm-fallback", { message: clean(e?.message, 300) });
      }
    }

    record.company = clean(record.company || company, 200);
    record.website = url(record.website) || record.website || evidence[0]?.url || "";
    record.summary = clean(record.summary, 1000);
    record.fitScore = Math.max(0, Math.min(100, Number(record.fitScore) || 0));
    record.intentScore = Math.max(0, Math.min(100, Number(record.intentScore) || 0));
    record.priority = ["HOT", "WARM", "LOW"].includes(String(record.priority).toUpperCase()) ? String(record.priority).toUpperCase() : (record.fitScore >= 75 && record.intentScore >= 70 ? "HOT" : record.fitScore >= 60 || record.intentScore >= 55 ? "WARM" : "LOW");
    record.decisionMakers = Array.isArray(record.decisionMakers) ? record.decisionMakers.slice(0, 3) : [];
    record.signals = Array.isArray(record.signals) ? record.signals.slice(0, 5) : [];
    record.sources = unique([...(Array.isArray(record.sources) ? record.sources : []), ...evidence.map(x => ({ title: x.title, url: x.url, type: "web-search" }))].map((x: any) => ({ title: clean(x.title || "Web source", 160), url: url(x.url), type: clean(x.type || "web", 40) }))).slice(0, 8);
    record.research = { ...(record.research || {}), searchesPerformed: 3, pagesReviewed: evidence.length, evidenceBacked: true, confidence: evidence.length >= 8 ? "HIGH" : evidence.length >= 4 ? "MEDIUM" : "LOW", notes: provider === "openrouter-free" ? "Live web research via Tavily with free-model analysis via OpenRouter." : "Live web research via Tavily; evidence-first fallback used because the free LLM provider was temporarily unavailable." };

    return NextResponse.json({ ...record, agent: "Scout", provider, model: modelName, liveResearch: true });
  } catch (error: any) {
    const status = Number(error?.status) || 502;
    console.error("scout-provider-failed", { status, message: clean(error?.message, 400) });
    return NextResponse.json({ error: status === 503 ? "Research search provider is not configured." : "Live web research is temporarily unavailable. Please retry in a moment." }, { status });
  }
}
