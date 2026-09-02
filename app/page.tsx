"use client";

import { useState } from "react";
import { ArrowUpRight, Check, CircleHelp, ExternalLink, Globe2, Loader2, Search, ShieldCheck, Sparkles, Target, Users, Zap, Copy } from "lucide-react";

type Result = {
  company:string; website:string; summary:string; fitScore:number; intentScore:number;
  priority:"HOT"|"WARM"|"LOW"; recommendedAction:string;
  decisionMaker:{name:string;title:string;linkedin:string};
  signals:{signal:string;evidence:string;strength:"HIGH"|"MEDIUM"|"LOW"}[];
  sources:{title:string;url:string;type:string}[]; risks:string[]; agent:string
};

const steps=["Discover","Research","Verify","Score","Recommend"];

export default function Home(){
  const[company,setCompany]=useState("");
  const[icp,setIcp]=useState("US B2B companies, 20–500 employees, active sales team, clear need for lead research or sales automation");
  const[running,setRunning]=useState(false);
  const[step,setStep]=useState(0);
  const[result,setResult]=useState<Result|null>(null);
  const[error,setError]=useState("");
  const[notice,setNotice]=useState("");

  async function runAgent(){
    if(!company.trim()||running)return;
    setRunning(true);setError("");setNotice("");setResult(null);setStep(0);
    const timer=window.setInterval(()=>setStep(s=>Math.min(s+1,4)),1100);
    try{
      const res=await fetch("/api/research",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({company:company.trim(),icp:icp.trim()})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||"Research failed");
      setResult(data);setStep(4);
    }catch(e){setError(e instanceof Error?e.message:"Research failed");}
    finally{window.clearInterval(timer);setRunning(false);}
  }

  async function copyBrief(){
    if(!result)return;
    const text=`${result.company}\nICP fit: ${result.fitScore}/100\nBuying intent: ${result.intentScore}/100\nPriority: ${result.priority}\n\n${result.summary}\n\nRecommended action: ${result.recommendedAction}`;
    try{await navigator.clipboard.writeText(text);setNotice("Qualification brief copied");window.setTimeout(()=>setNotice(""),2200)}catch{setNotice("Copy unavailable in this browser")}
  }

  return <main>
    <header className="topbar"><div className="topbarInner"><div className="brand"><span className="brandMark">S</span><span className="brandName">SwiftLabor</span><span className="brandDivider"/><span className="productName">LEAD INTELLIGENCE</span></div><div className="topRight"><span className="liveDot"/> Agent ready <button className="iconButton" aria-label="Scout information"><CircleHelp size={16}/></button></div></div></header>
    <div className="appShell">
      <aside className="sidebar"><div className="sideLabel">WORKSPACE</div><nav><div className="active"><Target size={16}/> Prospect research</div><div><Users size={16}/> Decision makers <span>Scout output</span></div><div><Zap size={16}/> Buying signals <span>Scout output</span></div></nav><div className="sideBottom"><ShieldCheck size={15}/><div><b>Evidence-first</b><small>Observed evidence is separated from inference.</small></div></div></aside>
      <section className="workspace">
        <div className="pageIntro"><div><div className="kicker">SWIFTLABOR / AGENT 01</div><h1>Prospect Research</h1><p>Scout finds the accounts worth your team's attention — then explains why.</p></div><div className="agentBadge"><span><Sparkles size={14}/></span><div><b>Scout</b><small>Lead Research & Qualification Agent</small></div></div></div>
        <div className="researchCard">
          <div className="researchTop"><div><span className="stepPill">01</span><div><h2>Research a company</h2><p>Scout browses public sources, verifies evidence and builds a qualification record.</p></div></div><span className="secure"><ShieldCheck size={13}/> Server-side research</span></div>
          <div className="fields"><label><span>COMPANY OR DOMAIN</span><div className="inputWrap"><Globe2 size={16}/><input value={company} onChange={e=>setCompany(e.target.value)} placeholder="e.g. acme.com or Acme Logistics" onKeyDown={e=>e.key==="Enter"&&runAgent()}/></div></label><label><span>ICP / QUALIFICATION CRITERIA</span><div className="inputWrap"><Target size={16}/><input value={icp} onChange={e=>setIcp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runAgent()}/></div></label><button className="runButton" onClick={runAgent} disabled={running||!company.trim()}>{running?<><Loader2 size={15} className="spin"/> Researching</>:<><Search size={15}/> Run Scout <ArrowUpRight size={15}/></>}</button></div>
          {running&&<div className="progress"><div className="progressLine"><i style={{width:`${((step+1)/steps.length)*100}%`}}/></div><div className="progressSteps">{steps.map((x,i)=><span className={step>=i?"done":""} key={x}>{step>i?<Check size={11}/>:i+1} {x}</span>)}</div></div>}
          {error&&<div className="error" role="alert">{error}</div>}
        </div>
        <div className="resultsHeader"><div><div className="kicker">02 / QUALIFICATION RECORD</div><h2>Evidence-led account intelligence</h2></div>{notice&&<div className="notice">{notice}</div>}</div>
        {!result?<div className="emptyState"><div className="emptyIcon"><Search size={20}/></div><b>{company?"Ready to research":"No prospect selected"}</b><p>Enter a company or domain above. Scout will research the account and return only evidence it can support.</p><span className="emptyMeta"><ShieldCheck size={12}/> No API key is exposed to the browser</span></div>:<ResultView result={result} onCopy={copyBrief}/>} 
      </section>
    </div>
    <footer><span>SwiftLabor</span><span>Lead Intelligence · Private workspace · {new Date().getFullYear()}</span></footer>
  </main>
}

function ResultView({result,onCopy}:{result:Result;onCopy:()=>void}){return <div className="resultArea"><div className="overviewGrid"><div className="companyCard card"><div className="companyEyebrow"><span className={`priority ${result.priority.toLowerCase()}`}>{result.priority}</span><span>QUALIFIED PROSPECT</span></div><div className="companyName"><div className="companyLogo">{result.company.slice(0,1).toUpperCase()}</div><div><h3>{result.company}</h3>{result.website&&<a href={result.website} target="_blank" rel="noreferrer">{result.website.replace(/^https?:\/\//,"")} <ExternalLink size={12}/></a>}</div></div><p>{result.summary}</p><div className="decision"><div className="avatar">{result.decisionMaker.name?result.decisionMaker.name.split(" ").map(x=>x[0]).join("").slice(0,2):"—"}</div><div><span>RECOMMENDED DECISION MAKER</span><b>{result.decisionMaker.name||"Not verified"}</b><small>{result.decisionMaker.title||"No verified title returned"}</small></div>{result.decisionMaker.linkedin&&<a className="linkedin" href={result.decisionMaker.linkedin} target="_blank" rel="noreferrer">Profile <ExternalLink size={11}/></a>}</div></div><div className="scoreCard card"><div className="scoreTitle">QUALIFICATION</div><div className="scores"><Score label="ICP fit" value={result.fitScore}/><Score label="Buying intent" value={result.intentScore}/></div><div className="scoreRule"/><div className="actionLabel">NEXT BEST ACTION</div><p>{result.recommendedAction}</p><button onClick={onCopy}><Copy size={14}/> Copy qualification brief</button></div></div><div className="lowerGrid"><div className="signals card"><div className="cardHead"><div><span className="kicker">SIGNALS</span><h3>Why Scout qualified this account</h3></div><span className="verified"><Check size={12}/> Evidence reviewed</span></div>{result.signals.length?result.signals.map((s,i)=><div className="signal" key={i}><span className={`strength ${s.strength.toLowerCase()}`}>{s.strength}</span><div><b>{s.signal}</b><p>{s.evidence}</p></div></div>):<div className="noData">No qualifying signals were returned.</div>}</div><div className="risks card"><span className="kicker">CONFIDENCE NOTES</span><h3>What to validate</h3>{result.risks.length?result.risks.map((r,i)=><p key={i}><span>•</span>{r}</p>):<p><Check size={13}/> No material qualification risks returned.</p>}<div className="sources"><span className="kicker">SOURCES</span>{result.sources.length?result.sources.slice(0,5).map((s,i)=><a key={i} href={s.url} target="_blank" rel="noreferrer">{s.title||s.url}<ExternalLink size={10}/></a>):<small>No source URLs returned.</small>}</div><div className="agentFoot"><Sparkles size={13}/><span>Analyzed by <b>{result.agent}</b></span></div></div></div></div>}
function Score({label,value}:{label:string;value:number}){return <div className="score"><div className="scoreRing" style={{background:`conic-gradient(#155eef ${Math.max(0,Math.min(100,value))}%, #eaf0f7 0)`}}><div><b>{value}</b><small>/100</small></div></div><span>{label}</span></div>}
