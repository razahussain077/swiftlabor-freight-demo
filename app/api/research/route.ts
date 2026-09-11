import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = {
  type: "object",
  properties: {
    company: { type: "string" }, website: { type: "string" }, summary: { type: "string" },
    fitScore: { type: "integer" }, intentScore: { type: "integer" }, priority: { type: "string" }, recommendedAction: { type: "string" },
    decisionMaker: { type: "object", properties: { name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" }, confidence: { type: "string" }, whyRelevant: { type: "string" } }, required: ["name","title","linkedin","confidence","whyRelevant"] },
    decisionMakers: { type: "array", items: { type: "object", properties: { name: { type: "string" }, title: { type: "string" }, linkedin: { type: "string" }, confidence: { type: "string" }, whyRelevant: { type: "string" }, evidence: { type: "string" } }, required: ["name","title","linkedin","confidence","whyRelevant","evidence"] } },
    signals: { type: "array", items: { type: "object", properties: { signal: { type: "string" }, evidence: { type: "string" }, strength: { type: "string" }, sourceUrl: { type: "string" } }, required: ["signal","evidence","strength","sourceUrl"] } },
    sources: { type: "array", items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" }, type: { type: "string" } }, required: ["title","url","type"] } },
    risks: { type: "array", items: { type: "string" } },
    research: { type: "object", properties: { searchesPerformed: { type: "integer" }, pagesReviewed: { type: "integer" }, evidenceBacked: { type: "boolean" }, confidence: { type: "string" }, notes: { type: "string" } }, required: ["searchesPerformed","pagesReviewed","evidenceBacked","confidence","notes"] }
  },
  required: ["company","website","summary","fitScore","intentScore","priority","recommendedAction","decisionMaker","decisionMakers","signals","sources","risks","research"]
};

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
function normalizeUrl(value: unknown) { const raw = String(value ?? "").trim(); try { const u = new URL(raw); return u.protocol === "https:" || u.protocol === "http:" ? raw : ""; } catch { return ""; } }
function uniqueByUrl<T extends {url:string}>(items:T[]) { return items.filter((x,i,a)=>x.url && a.findIndex(y=>y.url===x.url)===i); }

function buildPrompt(company: string, icp: string) {
  return `You are Scout, a senior B2B lead-intelligence analyst. Research this company using LIVE Google Search grounding and return a compact evidence-led qualification record.

COMPANY: ${company}
ICP: ${icp || "US B2B companies, 20–500 employees, active sales motion, and a credible need for lead research, qualification, buying-signal detection, or sales automation."}

RESEARCH PRIORITY:
1) Official company/site and what the company actually does.
2) Leadership/team pages and public professional profiles. Find the 2–3 people most likely to own the ICP problem; do not default to CEO. Never invent names or LinkedIn URLs.
3) One or two recent concrete buying signals: hiring, growth, expansion, funding, acquisition, new location, technology/AI/automation initiative, operational complexity, or relevant public statement.

RULES:
- Prefer official and recent sources.
- Use no more than 3 focused search queries when possible.
- Separate observed evidence from inference.
- Every important claim needs a source found during research.
- If a person or LinkedIn profile cannot be verified, leave the URL empty and use UNVERIFIED.
- Return at most 3 decision makers, 5 signals, and 8 sources.
- fitScore = ICP fit 0–100. intentScore = credible/recent buying intent 0–100. HOT only when both are strong.
- recommendedAction must be a concrete next sales action.
- Do not fabricate URLs, facts, people, titles, or buying signals.

Return ONLY JSON matching the supplied schema. No markdown.`;
}

function normalizeRecord(result:any) {
  const r = result && typeof result === "object" ? result : {};
  r.company=cleanText(r.company,200); r.website=normalizeUrl(r.website); r.summary=cleanText(r.summary,1000);
  r.fitScore=Math.max(0,Math.min(100,Number(r.fitScore)||0)); r.intentScore=Math.max(0,Math.min(100,Number(r.intentScore)||0));
  r.priority=["HOT","WARM","LOW"].includes(String(r.priority).toUpperCase())?String(r.priority).toUpperCase():"LOW";
  r.recommendedAction=cleanText(r.recommendedAction,500);
  r.decisionMakers=Array.isArray(r.decisionMakers)?r.decisionMakers.slice(0,3).map((p:any)=>({name:cleanText(p.name,120),title:cleanText(p.title,140),linkedin:normalizeUrl(p.linkedin),confidence:["HIGH","MEDIUM","LOW","UNVERIFIED"].includes(String(p.confidence).toUpperCase())?String(p.confidence).toUpperCase():"UNVERIFIED",whyRelevant:cleanText(p.whyRelevant,350),evidence:cleanText(p.evidence,450)})):[];
  const p=r.decisionMaker||{}; r.decisionMaker={name:cleanText(p.name,120),title:cleanText(p.title,140),linkedin:normalizeUrl(p.linkedin),confidence:["HIGH","MEDIUM","LOW","UNVERIFIED"].includes(String(p.confidence).toUpperCase())?String(p.confidence).toUpperCase():"UNVERIFIED",whyRelevant:cleanText(p.whyRelevant,350)};
  if(!r.decisionMaker.name&&r.decisionMakers[0])r.decisionMaker={...r.decisionMakers[0]};
  r.signals=Array.isArray(r.signals)?r.signals.slice(0,5).map((s:any)=>({signal:cleanText(s.signal,160),evidence:cleanText(s.evidence,500),strength:["HIGH","MEDIUM","LOW"].includes(String(s.strength).toUpperCase())?String(s.strength).toUpperCase():"LOW",sourceUrl:normalizeUrl(s.sourceUrl)})):[];
  r.sources=Array.isArray(r.sources)?uniqueByUrl(r.sources.slice(0,8).map((s:any)=>({title:cleanText(s.title||"Web source",160),url:normalizeUrl(s.url),type:cleanText(s.type||"web",40)}))):[];
  r.risks=Array.isArray(r.risks)?r.risks.slice(0,5).map((x:any)=>cleanText(x,250)):[];
  r.research={searchesPerformed:Math.max(0,Number(r.research?.searchesPerformed)||0),pagesReviewed:Math.max(0,Number(r.research?.pagesReviewed)||0),evidenceBacked:Boolean(r.research?.evidenceBacked),confidence:["HIGH","MEDIUM","LOW"].includes(String(r.research?.confidence).toUpperCase())?String(r.research.confidence).toUpperCase():"LOW",notes:cleanText(r.research?.notes,450)};
  return r;
}

function geminiKey(){return process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY||"";}
function geminiModel(){return process.env.GEMINI_MODEL?.trim()||"gemini-3.7-flash";}

async function callGemini(company:string,icp:string){
  const key=geminiKey(); if(!key) { const e:any=new Error("GEMINI_API_KEY_MISSING"); e.status=503; throw e; }
  const model=geminiModel();
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),55000);
  try {
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},signal:controller.signal,
      body:JSON.stringify({contents:[{role:"user",parts:[{text:buildPrompt(company,icp)}]}],tools:[{google_search:{}}],generationConfig:{temperature:0.1,maxOutputTokens:4500,responseMimeType:"application/json",responseSchema:schema}})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){const e:any=new Error(String(payload?.error?.message||`Gemini HTTP ${response.status}`));e.status=response.status;e.provider=payload?.error;throw e;}
    const candidate=payload?.candidates?.[0];
    const text=String(candidate?.content?.parts?.map((p:any)=>p?.text||"").join("")||"");
    if(!text) { const e:any=new Error("SCOUT_GEMINI_EMPTY_OUTPUT"); e.status=502; throw e; }
    let record:any; try{record=JSON.parse(text);}catch{const e:any=new Error("SCOUT_GEMINI_INVALID_JSON");e.status=502;throw e;}
    record=normalizeRecord(record);
    const grounding=candidate?.groundingMetadata||{};
    const chunks=Array.isArray(grounding.groundingChunks)?grounding.groundingChunks:[];
    const grounded=uniqueByUrl(chunks.map((c:any)=>({title:cleanText(c?.web?.title||"Web source",160),url:normalizeUrl(c?.web?.uri),type:"google-search"})).filter((x:any)=>x.url));
    record.sources=uniqueByUrl([...record.sources,...grounded]).slice(0,8);
    if(Array.isArray(grounding.webSearchQueries))record.research.searchesPerformed=Math.max(record.research.searchesPerformed,grounding.webSearchQueries.length);
    record.research.pagesReviewed=Math.max(record.research.pagesReviewed,grounded.length);
    if(grounded.length)record.research.evidenceBacked=true;
    if(!record.research.notes)record.research.notes="Scout used Google Search grounding and retained verified public sources.";
    return {record,model};
  } catch(error:any) {
    if(error?.name==="AbortError"){const e:any=new Error("Scout research timed out while waiting for Google Search and Gemini. Please try again.");e.status=504;throw e;}
    throw error;
  } finally {clearTimeout(timeout);}
}

export async function POST(request:Request){
  try{
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"Invalid research request."},{status:400});
    const company=cleanText((body as any).company,200); const icp=cleanText((body as any).icp,1000);
    if(!company)return NextResponse.json({error:"Company or domain is required."},{status:400});
    if(company.length<2)return NextResponse.json({error:"Enter a valid company name or domain."},{status:400});
    try{
      const result=await callGemini(company,icp);
      return NextResponse.json({...result.record,agent:"Scout",provider:"google-gemini",model:result.model,liveResearch:true});
    }catch(providerError:any){
      const status=Number(providerError?.status)||502; const message=String(providerError?.message||""); const lower=message.toLowerCase();
      console.error("scout-provider-failed",{status,message,provider:"google-gemini",model:geminiModel()});
      let error="Scout could not complete live research. Please try again.";
      if(message==="GEMINI_API_KEY_MISSING")error="Scout is not configured yet. Add GEMINI_API_KEY to the Vercel Production environment, then redeploy.";
      else if(status===401||lower.includes("api key")||lower.includes("unauthorized"))error="Gemini rejected the API key. Check GEMINI_API_KEY in Vercel Production and redeploy.";
      else if(status===429||lower.includes("quota")||lower.includes("rate limit"))error="Gemini API quota or rate limit was reached. Please retry after the limit resets or use a higher-limit API key.";
      else if(status===504||lower.includes("timed out"))error="Live research took too long. Scout timed out safely; please try the company again.";
      else if(status>=500)error="Gemini is temporarily unavailable. Please retry in a moment.";
      return NextResponse.json({error},{status:status>=400&&status<600?status:502});
    }
  }catch(error){console.error("scout-request-failed",error);return NextResponse.json({error:"Scout could not process this research request."},{status:500});}
}
