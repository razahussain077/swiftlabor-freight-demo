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

You must be evidence-led. Do not invent people, buying signals, URLs, job titles, company size, or evidence. This model is being accessed through OpenRouter and does not automatically have a live browser unless a web-search tool is explicitly enabled. Never claim that you searched the web or verified a fact that is not actually available to you. If a fact cannot be established, leave the relevant field empty or state that it could not be verified. Distinguish observed information from inference. Score ICP fit and buying intent independently. A high ICP fit does not imply buying intent.

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

function getOpenRouterApiKey() {
  // Keep support for the user's existing Vercel variable name: "swift".
  // OpenRouter's conventional name is OPENROUTER_API_KEY.
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.swift ||
    process.env.SWIFT ||
    process.env.openrouter
  );
}

function getOpenRouterModel() {
  // A configured OPENROUTER_MODEL always wins. The default is Kimi K2.6's
  // free endpoint so the demo can run without accidentally spending credits.
  return process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2.6:free";
}

function getProviderError(providerError: unknown) {
  const error = providerError as any;
  const status = Number(error?.status ?? error?.code ?? 0);
  const message = String(error?.error?.message ?? error?.message ?? "");
  const raw = String(error?.error?.metadata?.raw ?? "");
  return { status, message, raw };
}

async function runOpenRouter(company: string, icp: string) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY_MISSING");

  const model = getOpenRouterModel();
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 90_000,
    defaultHeaders: {
      "HTTP-Referer": "https://swiftlabor.ai",
      "X-Title": "SwiftLabor Scout",
    },
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are a precise B2B lead intelligence analyst. Follow the requested JSON object format exactly and never fabricate evidence.",
      },
      { role: "user", content: buildPrompt(company, icp) },
    ],
    // Kimi K2.x endpoints can reject arbitrary temperature values, so let the
    // selected provider/model control generation behavior.
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  const text = response.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("SCOUT_OPENROUTER_EMPTY_OUTPUT");

  try {
    return normalizeRecord(JSON.parse(text));
  } catch {
    throw new Error("SCOUT_OPENROUTER_INVALID_JSON");
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
      const record = await runOpenRouter(company, icp);
      return NextResponse.json({
        ...record,
        agent: "Scout",
        provider: "openrouter",
        model: getOpenRouterModel(),
      });
    } catch (providerError) {
      const { status, message, raw } = getProviderError(providerError);
      console.error("scout-openrouter-failed", {
        status,
        message,
        raw,
        model: getOpenRouterModel(),
      });

      const combined = `${message} ${raw}`.toLowerCase();
      const isRateLimited = status === 429 || combined.includes("rate-limited") || combined.includes("rate limit") || combined.includes("quota");
      const isUnauthorized = status === 401 || combined.includes("invalid api key") || combined.includes("unauthorized");
      const isModelError = status === 404 || (combined.includes("model") && (combined.includes("not found") || combined.includes("unavailable")));

      const error = message === "OPENROUTER_API_KEY_MISSING"
        ? "OpenRouter API key is not configured. Add the Vercel environment variable named swift (or OPENROUTER_API_KEY) and redeploy."
        : isUnauthorized
          ? "OpenRouter rejected the API key. Check the Vercel variable named swift, then redeploy."
          : isRateLimited
            ? "This OpenRouter model/provider is temporarily rate-limited. Try again shortly or select another OpenRouter model."
            : isModelError
              ? `The OpenRouter model is unavailable: ${getOpenRouterModel()}. Set OPENROUTER_MODEL to an available model.`
              : "Scout could not complete the research through OpenRouter. Check the OpenRouter model configuration and deployment logs.";

      return NextResponse.json({ error }, { status: isRateLimited ? 429 : 502 });
    }
  } catch (error) {
    console.error("lead-research-agent", error);
    return NextResponse.json({ error: "Scout could not complete the research. Please try again." }, { status: 500 });
  }
}
