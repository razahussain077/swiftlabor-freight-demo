import OpenAI from "openai";
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

function buildPrompt(company: string, icp: string) {
  return `You are Scout, SwiftLabor's Lead Intelligence Agent. Research B2B prospects for a professional sales team.

Use web search to verify factual claims. Prefer first-party company sources, official filings, company newsroom/careers pages, and reputable professional sources. Never invent people, buying signals, URLs, job titles, company size, or evidence. Every signal must have a concrete evidence trail. Distinguish observed evidence from inference. Score ICP fit and buying intent independently. A high ICP fit does not imply buying intent. A buying signal should be recent or clearly ongoing when possible. Identify a decision maker only when the person, title, and relevance can be verified from public evidence; otherwise return empty strings.

Company/domain: ${company}
ICP criteria: ${icp || "US B2B companies with an active sales motion and a credible need for AI-powered lead research, qualification, buying-signal detection, or sales workflow automation."}

Investigate company identity and business model, approximate size, sales motion, growth/hiring, operational complexity, technology or automation initiatives, recent announcements, and credible indicators of active buying need. Identify the strongest evidence-backed reason to contact this account and the most relevant executive/revenue leader when verifiable.

Return ONLY valid JSON matching this exact schema. Do not wrap it in markdown fences:
${JSON.stringify(schema)}`;
}

function normalizeRecord(result: unknown) {
  const record = result as Record<string, any>;
  const modelSources = Array.isArray(record.sources)
    ? record.sources
        .filter((source: any) => source && isAllowedUrl(String(source.url ?? "")))
        .slice(0, 8)
        .map((source: any) => ({
          title: cleanText(source.title || "Web source", 180),
          url: String(source.url),
          type: cleanText(source.type || "web", 40),
        }))
    : [];

  record.sources = modelSources.filter(
    (source, index, all) => all.findIndex((item) => item.url === source.url) === index,
  );
  record.signals = Array.isArray(record.signals) ? record.signals.slice(0, 8) : [];
  record.risks = Array.isArray(record.risks) ? record.risks.slice(0, 6) : [];
  return record;
}

async function runGrok(company: string, icp: string) {
  const apiKey = process.env.SCOUT || process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("SCOUT_GROK_KEY_MISSING");

  const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
  const response = await client.responses.create({
    model: process.env.SCOUT_MODEL || "grok-4.6",
    input: buildPrompt(company, icp),
    tools: [{ type: "web_search" }],
    text: {
      format: {
        type: "json_schema",
        name: "scout_lead_research",
        schema,
        strict: true,
      },
    },
  });

  const text = response.output_text || "";
  if (!text) throw new Error("SCOUT_GROK_EMPTY_OUTPUT");
  return normalizeRecord(JSON.parse(text));
}

async function runGemini(company: string, icp: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("SCOUT_GEMINI_KEY_MISSING");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    contents: buildPrompt(company, icp),
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.2,
    },
  });

  const text = response.text || "";
  if (!text) throw new Error("SCOUT_GEMINI_EMPTY_OUTPUT");
  return normalizeRecord(JSON.parse(text));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid research request." }, { status: 400 });
    }

    const company = cleanText((body as Record<string, unknown>).company, 200);
    const icp = cleanText((body as Record<string, unknown>).icp, 1000);
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });
    if (company.length < 2) return NextResponse.json({ error: "Enter a valid company name or domain." }, { status: 400 });

    let record: Record<string, any>;
    let provider: "grok" | "gemini";

    try {
      record = await runGrok(company, icp);
      provider = "grok";
    } catch (grokError) {
      console.error("scout-grok-failed", grokError);

      // Gemini remains a resilience fallback. If its quota is exhausted too,
      // surface a useful rate-limit response instead of a misleading generic 500.
      try {
        record = await runGemini(company, icp);
        provider = "gemini";
      } catch (geminiError) {
        console.error("scout-gemini-fallback-failed", geminiError);
        const message = String((geminiError as Error)?.message || "");
        const status = message.includes("429") || message.includes("RESOURCE_EXHAUSTED") ? 429 : 502;
        return NextResponse.json(
          {
            error:
              status === 429
                ? "Scout's AI providers are currently rate-limited. Please try again shortly."
                : "Scout could not complete the research. Please verify the provider configuration and try again.",
          },
          { status },
        );
      }
    }

    return NextResponse.json({ ...record, agent: "Scout", provider });
  } catch (error) {
    console.error("lead-research-agent", error);
    const message = String((error as Error)?.message || "");
    const isJsonError = error instanceof SyntaxError;
    return NextResponse.json(
      { error: isJsonError ? "Scout returned an invalid research record. Please try again." : "Scout could not complete the research. Please try again." },
      { status: 500 },
    );
  }
}
