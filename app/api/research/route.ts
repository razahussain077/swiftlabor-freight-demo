import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: "string" },
    website: { type: "string" },
    summary: { type: "string" },
    fitScore: { type: "integer", minimum: 0, maximum: 100 },
    intentScore: { type: "integer", minimum: 0, maximum: 100 },
    priority: { type: "string", enum: ["HOT", "WARM", "LOW"] },
    recommendedAction: { type: "string" },
    decisionMaker: {
      type: "object",
      additionalProperties: false,
      properties: { name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" } },
      required: ["name", "title", "linkedin"],
    },
    signals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          signal: { type: "string" },
          evidence: { type: "string" },
          strength: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
        },
        required: ["signal", "evidence", "strength"],
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, url: { type: "string" }, type: { type: "string" } },
        required: ["title", "url", "type"],
      },
    },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["company", "website", "summary", "fitScore", "intentScore", "priority", "recommendedAction", "decisionMaker", "signals", "sources", "risks"],
};

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function isAllowedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function extractGroundingSources(response: any) {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  return chunks
    .map((chunk: any) => chunk?.web)
    .filter((web: any) => web?.uri && isAllowedUrl(String(web.uri)))
    .map((web: any) => ({
      title: cleanText(web.title || "Web source", 180),
      url: String(web.uri),
      type: "web",
    }));
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Scout is not configured yet. Add GEMINI_API_KEY in Vercel, then redeploy." },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid research request." }, { status: 400 });
    }

    const company = cleanText((body as Record<string, unknown>).company, 200);
    const icp = cleanText((body as Record<string, unknown>).icp, 1000);
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });
    if (company.length < 2) return NextResponse.json({ error: "Enter a valid company name or domain." }, { status: 400 });

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      // Gemini 2.5 Flash-Lite has been retired for new users. Gemini 3.5 Flash-Lite
      // is the current low-latency model and supports Google Search grounding.
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      contents: `You are Scout, SwiftLabor's Lead Intelligence Agent. Research B2B prospects for a professional sales team.

Use Google Search to verify factual claims. Prefer first-party company sources, official filings, company newsroom/careers pages, and reputable professional sources. Never invent people, buying signals, URLs, job titles, company size, or evidence. Every signal must have a concrete evidence trail. Distinguish observed evidence from inference. Score ICP fit and buying intent independently. A high ICP fit does not imply buying intent. A buying signal should be recent or clearly ongoing when possible. Identify a decision maker only when the person, title, and relevance can be verified from public evidence; otherwise return empty strings.

Company/domain: ${company}
ICP criteria: ${icp || "US B2B companies with an active sales motion and a credible need for AI-powered lead research, qualification, buying-signal detection, or sales workflow automation."}

Investigate company identity and business model, approximate size, sales motion, growth/hiring, operational complexity, technology or automation initiatives, recent announcements, and credible indicators of active buying need. Identify the strongest evidence-backed reason to contact this account and the most relevant executive/revenue leader when verifiable.

Return ONLY valid JSON matching this exact schema. Do not wrap it in markdown fences:
${JSON.stringify(schema)}`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2,
      },
    });

    let result: unknown;
    try {
      result = JSON.parse(response.text || "");
    } catch {
      console.error("lead-research-agent-invalid-output", (response.text || "").slice(0, 1000));
      return NextResponse.json({ error: "Scout returned an invalid research record. Please try again." }, { status: 502 });
    }

    const record = result as Record<string, any>;
    const groundedSources = extractGroundingSources(response);
    const modelSources = Array.isArray(record.sources)
      ? record.sources.filter((source: any) => source && isAllowedUrl(String(source.url ?? ""))).slice(0, 8)
      : [];
    const sources = [...modelSources, ...groundedSources].filter(
      (source, index, all) => all.findIndex((item) => item.url === source.url) === index,
    ).slice(0, 8);

    record.sources = sources;
    record.signals = Array.isArray(record.signals) ? record.signals.slice(0, 8) : [];
    record.risks = Array.isArray(record.risks) ? record.risks.slice(0, 6) : [];

    return NextResponse.json({ ...record, agent: "Scout", provider: "gemini" });
  } catch (error) {
    console.error("lead-research-agent", error);
    return NextResponse.json({ error: "Scout could not complete the research. Please try again." }, { status: 500 });
  }
}
