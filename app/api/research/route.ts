import OpenAI from "openai";
import { NextResponse } from "next/server";

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
  required: ["company","website","summary","fitScore","intentScore","priority","recommendedAction","decisionMaker","signals","risks"],
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    const client = new OpenAI({ apiKey });
    const body = await request.json();
    const company = String(body.company ?? "").trim();
    const icp = String(body.icp ?? "").trim();
    if (!company) return NextResponse.json({ error: "Company or domain is required." }, { status: 400 });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      tools: [{ type: "web_search" }],
      instructions: "You are SwiftLabor's Lead Intelligence Agent. Research B2B companies for sales teams. Use web search before factual claims. Prefer first-party company sources and reputable professional sources. Never invent people, buying signals, URLs, job titles, or evidence. Distinguish observed evidence from inference. Score ICP fit and buying intent independently. A buying signal needs a concrete evidence trail. If a decision maker cannot be verified, return empty strings rather than guessing.",
      input: `Research this prospect deeply.\n\nCompany/domain: ${company}\nICP criteria: ${icp || "B2B company with a credible need for AI-powered lead research, qualification, buying-signal detection, and sales workflow automation."}\n\nReturn a concise evidence-led qualification record. Look for company size, business model, growth/hiring, sales motion, technology/automation initiatives, relevant operational pain, recent announcements, and other credible indicators of active need. Identify the most relevant executive or revenue leader only when verifiable.`,
      text: { format: { type: "json_schema", name: "lead_qualification", strict: true, schema } },
    });
    return NextResponse.json({ ...JSON.parse(response.output_text), agent: "Scout" });
  } catch (error) {
    console.error("lead-research-agent", error);
    return NextResponse.json({ error: "Research failed. Check the agent configuration and try again." }, { status: 500 });
  }
}
