import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    company: { type: "string" }, website: { type: "string" }, summary: { type: "string" },
    fitScore: { type: "integer", minimum: 0, maximum: 100 }, intentScore: { type: "integer", minimum: 0, maximum: 100 },
    priority: { type: "string", enum: ["HOT", "WARM", "LOW"] }, recommendedAction: { type: "string" },
    decisionMaker: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" } }, required: ["name", "title", "linkedin"] },
    signals: { type: "array", items: { type: "object", additionalProperties: false, properties: { signal: { type: "string" }, evidence: { type: "string" }, strength: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] } }, required: ["signal", "evidence", "strength"] } },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["company", "website", "summary", "fitScore", "intentScore", "priority", "recommendedAction", "decisionMaker", "signals", "risks"],
};

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Scout is not configured yet. Add the OpenAI API key in Vercel, then redeploy." }, { status: 503 });

    const body = await request.json().catch(() => null);
    const company = cleanText(body?.company, 200);
    const icp = cleanText(body?.icp, 1000);
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });
    if (company.length < 2) return NextResponse.json({ error: "Enter a valid company name or domain." }, { status: 400 });

    const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      tools: [{ type: "web_search" }],
      instructions: "You are Scout, SwiftLabor's Lead Intelligence Agent. Research B2B prospects for a professional sales team. Use web search before factual claims. Prefer first-party company sources, official filings, company newsroom/careers pages, and reputable professional sources. Never invent people, buying signals, URLs, job titles, company size, or evidence. Every signal must have a concrete, attributable evidence trail. Distinguish observed evidence from inference. Score ICP fit and buying intent independently. A high ICP fit does not imply buying intent. A buying signal should be recent or clearly ongoing when possible. Identify a decision maker only when the person, title, and relevance can be verified from public evidence; otherwise return empty strings. Do not fabricate citations or source URLs. Keep the final record concise and useful for outbound sales.",
      input: `Research this prospect deeply.\n\nCompany/domain: ${company}\nICP criteria: ${icp || "B2B company with a credible need for AI-powered lead research, qualification, buying-signal detection, and sales workflow automation."}\n\nInvestigate company identity and business model, approximate size, sales motion, growth/hiring, operational complexity, technology or automation initiatives, recent announcements, and credible indicators of active buying need. Identify the strongest evidence-backed reason to contact this account and the most relevant executive/revenue leader when verifiable. Return only the requested structured qualification record.`,
      text: { format: { type: "json_schema", name: "lead_qualification", strict: true, schema } },
    });

    let result: unknown;
    try {
      result = JSON.parse(response.output_text);
    } catch {
      console.error("lead-research-agent-invalid-output", response.output_text.slice(0, 1000));
      return NextResponse.json({ error: "Scout returned an invalid research record. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ ...(result as Record<string, unknown>), agent: "Scout" });
  } catch (error) {
    console.error("lead-research-agent", error);
    return NextResponse.json({ error: "Scout could not complete the research. Please try again." }, { status: 500 });
  }
}
