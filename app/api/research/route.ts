import OpenAI from "openai";
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

You must be evidence-led. Do not invent people, buying signals, URLs, job titles, company size, or evidence. This request uses Kimi's API without an external browser/search tool, so never claim that you searched the web or verified a fact that is not actually available to you. If a fact cannot be established, leave the relevant field empty or state that it could not be verified. Distinguish observed information from inference. Score ICP fit and buying intent independently. A high ICP fit does not imply buying intent.

Company/domain: ${company}
ICP criteria: ${icp || "US B2B companies with an active sales motion and a credible need for AI-powered lead research, qualification, buying-signal detection, or sales workflow automation."}

Analyze the company identity and business model, likely sales motion, operational complexity, technology/automation needs, and the strongest plausible reason to contact this account. Identify a decision maker only when you can provide a reliable public URL from your available knowledge; otherwise return empty strings. Do not fabricate sources.

Return ONLY one valid JSON object matching this schema. Do not wrap it in markdown fences:
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

function getKimiApiKey() {
  // Vercel environment variable names are case-sensitive. The user's existing
  // key is named "swift", while the conventional Kimi names are also supported.
  return (
    process.env.swift ||
    process.env.SWIFT ||
    process.env.KIMI_API_KEY ||
    process.env.MOONSHOT_API_KEY
  );
}

async function runKimi(company: string, icp: string) {
  const apiKey = getKimiApiKey();
  if (!apiKey) throw new Error("KIMI_API_KEY_MISSING");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.moonshot.ai/v1",
    timeout: 90_000,
  });

  const response = await client.chat.completions.create({
    model: process.env.KIMI_MODEL || "kimi-k2.6",
    messages: [
      {
        role: "system",
        content: "You are a precise B2B lead intelligence analyst. Follow the requested JSON object format exactly and never fabricate evidence.",
      },
      { role: "user", content: buildPrompt(company, icp) },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
    extra_body: {
      thinking: { type: "disabled" },
    },
  });

  const text = response.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("SCOUT_KIMI_EMPTY_OUTPUT");

  try {
    return normalizeRecord(JSON.parse(text));
  } catch {
    throw new Error("SCOUT_KIMI_INVALID_JSON");
  }
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

    try {
      const record = await runKimi(company, icp);
      return NextResponse.json({
        ...record,
        agent: "Scout",
        provider: "kimi",
        model: process.env.KIMI_MODEL || "kimi-k2.6",
      });
    } catch (providerError) {
      console.error("scout-kimi-failed", providerError);
      const message = String((providerError as Error)?.message || "");
      const status = message.includes("429") || message.includes("rate") || message.includes("quota") ? 429 : 502;
      const error = message === "KIMI_API_KEY_MISSING"
        ? "Kimi API key is not configured. Add the Vercel environment variable named swift (or KIMI_API_KEY) and redeploy."
        : status === 429
          ? "Scout is temporarily rate-limited by Kimi. Please try again shortly."
          : message.includes("401") || message.includes("Unauthorized")
            ? "Kimi rejected the API key. Check that the Vercel variable named swift contains the Kimi API key, then redeploy."
            : message.includes("model_not_found") || message.includes("model")
              ? "The configured Kimi model is unavailable. Check KIMI_MODEL or use kimi-k2.6."
              : "Scout could not complete the research through Kimi. Check the Kimi API key and deployment logs.";
      return NextResponse.json({ error }, { status });
    }
  } catch (error) {
    console.error("lead-research-agent", error);
    return NextResponse.json({ error: "Scout could not complete the research. Please try again." }, { status: 500 });
  }
}
