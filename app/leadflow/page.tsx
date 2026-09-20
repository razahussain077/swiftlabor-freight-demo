"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Inbox,
  MapPin,
  MessageSquareText,
  Phone,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";
import styles from "./leadflow.module.css";

const initialLead = {
  name: "Sarah Mitchell",
  phone: "(214) 555-0186",
  zip: "75229",
  service: "AC Repair",
  urgency: "Today",
  property: "Single-family home",
  issue: "System is running but the home isn't cooling below 78°F.",
  time: "Today · 2:00–4:00 PM",
};

export default function LeadFlowDemo() {
  const [submitted, setSubmitted] = useState(false);
  const [lead, setLead] = useState(initialLead);
  const [activeTab, setActiveTab] = useState<"flow" | "lead">("flow");

  const submit = () => setSubmitted(true);
  const reset = () => {
    setSubmitted(false);
    setLead(initialLead);
    setActiveTab("flow");
  };

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <div className={styles.brand}><div className={styles.logo}>S</div><div><strong>SwiftLabor</strong><span>LEADFLOW</span></div></div>
      <div className={styles.topMeta}><span className={styles.demoBadge}><span /> Demo environment</span><span className={styles.secure}><ShieldCheck size={13}/> No API keys required</span></div>
    </header>

    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.workspaceName}><div className={styles.workspaceIcon}>AC</div><div><b>Northstar HVAC</b><small>Operations workspace</small></div><ChevronDown size={14}/></div>
        <nav>
          <button className={styles.navActive}><Inbox size={16}/> Lead inbox <b>4</b></button>
          <button><CalendarClock size={16}/> Appointments</button>
          <button><UserRound size={16}/> Customers</button>
          <button><Zap size={16}/> Automations</button>
          <button><Settings2 size={16}/> Settings</button>
        </nav>
        <div className={styles.sidebarFoot}><div className={styles.statusDot}/><div><b>LeadFlow active</b><small>Capturing and routing requests</small></div></div>
      </aside>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div><div className={styles.eyebrow}>SWIFTLABOR / LEADFLOW</div><h1>Turn service requests into ready-to-work leads.</h1><p>One workflow from customer inquiry to a structured, actionable lead.</p></div>
          <button className={styles.reset} onClick={reset}><RotateCcw size={14}/> Reset demo</button>
        </div>

        <div className={styles.stats}>
          <Stat icon={<Inbox size={15}/>} label="New requests" value="4" detail="today"/>
          <Stat icon={<Clock3 size={15}/>} label="Avg. response" value="2m" detail="last 30 days"/>
          <Stat icon={<CalendarClock size={15}/>} label="Appointments" value="7" detail="this week"/>
          <Stat icon={<Bell size={15}/>} label="Needs attention" value="1" detail="now"/>
        </div>

        <div className={styles.tabs}>
          <button className={activeTab === "flow" ? styles.tabActive : ""} onClick={() => setActiveTab("flow")}>Live workflow</button>
          <button className={activeTab === "lead" ? styles.tabActive : ""} onClick={() => setActiveTab("lead")}>Lead record</button>
        </div>

        {activeTab === "flow" ? <div className={styles.flowGrid}>
          <section className={styles.card}>
            <div className={styles.cardHeader}><div><span className={styles.cardKicker}>STEP 01 · CUSTOMER INTAKE</span><h2>Smart service request</h2></div><span className={styles.live}><span/> LIVE</span></div>
            <div className={styles.form}>
              <Field label="Customer name" icon={<UserRound size={14}/>} value={lead.name} onChange={v=>setLead({...lead,name:v})}/>
              <div className={styles.two}><Field label="Phone" icon={<Phone size={14}/>} value={lead.phone} onChange={v=>setLead({...lead,phone:v})}/><Field label="ZIP code" icon={<MapPin size={14}/>} value={lead.zip} onChange={v=>setLead({...lead,zip:v})}/></div>
              <div className={styles.two}>
                <SelectField label="Service needed" value={lead.service} onChange={v=>setLead({...lead,service:v})} options={["AC Repair","AC Replacement","Heating Repair","Maintenance"]}/>
                <SelectField label="Urgency" value={lead.urgency} onChange={v=>setLead({...lead,urgency:v})} options={["Today","This week","Flexible","Emergency"]}/>
              </div>
              <SelectField label="Property" value={lead.property} onChange={v=>setLead({...lead,property:v})} options={["Single-family home","Townhome","Commercial property","Other"]}/>
              <label className={styles.textarea}><span>WHAT'S HAPPENING?</span><textarea value={lead.issue} onChange={e=>setLead({...lead,issue:e.target.value})}/></label>
              <button className={styles.primary} onClick={submit}><Play size={14} fill="currentColor"/> Simulate customer submission <ArrowRight size={14}/></button>
              <div className={styles.formNote}><ShieldCheck size={13}/> Demo data only · no customer information is sent</div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}><div><span className={styles.cardKicker}>STEP 02–05 · AUTOMATED HANDOFF</span><h2>What happens next</h2></div><Sparkles size={16} className={styles.spark}/></div>
            <WorkflowStep number="02" icon={<FileText size={15}/>} title="Request structured" text="Service, urgency, location and issue are captured as fields." state={submitted ? "done" : "waiting"}/>
            <WorkflowStep number="03" icon={<Zap size={15}/>} title="Lead qualified" text="Urgency and service type are checked against routing rules." state={submitted ? "done" : "waiting"}/>
            <WorkflowStep number="04" icon={<Bell size={15}/>} title="Office notified" text="A clean lead record is sent to the team instead of raw form data." state={submitted ? "done" : "waiting"}/>
            <WorkflowStep number="05" icon={<CalendarClock size={15}/>} title="Follow-up ready" text="Customer gets confirmation and the team gets the next action." state={submitted ? "done" : "waiting"}/>
            {submitted ? <div className={styles.successBox}><Check size={15}/><div><b>Lead ready for the team</b><span>Qualified request created in 1.8 seconds.</span></div><button onClick={()=>setActiveTab("lead")}>View record <ArrowRight size={12}/></button></div> : <div className={styles.waitBox}><Clock3 size={14}/><span>Submit the request on the left to run the workflow.</span></div>}
          </section>
        </div> : <LeadRecord lead={lead} submitted={submitted} onBack={()=>setActiveTab("flow")}/>}

        <div className={styles.bottomNote}><Wrench size={14}/><div><b>Built for service businesses.</b><span>LeadFlow can be adapted to HVAC, plumbing, electrical, roofing and other appointment-driven teams.</span></div><span className={styles.brandNote}>SWIFTLABOR</span></div>
      </section>
    </div>
  </main>;
}

function Stat({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string}) {
  return <div className={styles.stat}><div className={styles.statIcon}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}
function Field({label,icon,value,onChange}:{label:string;icon:React.ReactNode;value:string;onChange:(v:string)=>void}) {
  return <label className={styles.field}><span>{label}</span><div><i>{icon}</i><input value={value} onChange={e=>onChange(e.target.value)}/></div></label>;
}
function SelectField({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:string[]}) {
  return <label className={styles.field}><span>{label}</span><div><i><ChevronDown size={14}/></i><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select></div></label>;
}
function WorkflowStep({number,icon,title,text,state}:{number:string;icon:React.ReactNode;title:string;text:string;state:"done"|"waiting"}) {
  return <div className={styles.workflowStep + (state==="done" ? " " + styles.stepDone : "")}><div className={styles.stepNumber}>{state==="done"?<Check size={12}/>:number}</div><div className={styles.stepIcon}>{icon}</div><div><b>{title}</b><p>{text}</p></div>{state==="done"&&<span className={styles.doneLabel}>COMPLETE</span>}</div>;
}
function LeadRecord({lead,submitted,onBack}:{lead:typeof initialLead;submitted:boolean;onBack:()=>void}) {
  return <div>
    <div className={styles.recordTop}><button className={styles.back} onClick={onBack}>← Back to workflow</button><span className={submitted?styles.ready:""}>{submitted?"READY FOR TEAM":"PREVIEW"}</span></div>
    <div className={styles.recordGrid}>
      <section className={styles.card}>
        <div className={styles.recordHero}><div className={styles.customerAvatar}>SM</div><div><span className={styles.cardKicker}>NEW SERVICE REQUEST</span><h2>{lead.name}</h2><p>{lead.service} · {lead.zip} · {lead.urgency}</p></div><div className={styles.hot}>PRIORITY <b>{lead.urgency==="Today"?"HIGH":"NORMAL"}</b></div></div>
        <div className={styles.detailGrid}><Detail label="PHONE" value={lead.phone}/><Detail label="PROPERTY" value={lead.property}/><Detail label="SERVICE" value={lead.service}/><Detail label="PREFERRED WINDOW" value={lead.time}/></div>
        <div className={styles.issue}><span>ISSUE DESCRIPTION</span><p>{lead.issue}</p></div>
        <div className={styles.actionRow}><button className={styles.primary}><CalendarClock size={14}/> Schedule appointment</button><button className={styles.secondary}><MessageSquareText size={14}/> Send update</button><button className={styles.ghost}><Phone size={14}/> Call customer</button></div>
      </section>
      <aside className={styles.card + " " + styles.timeline}><span className={styles.cardKicker}>AUTOMATION LOG</span><h3>LeadFlow activity</h3>
        {["Request received","Fields structured","Priority determined","Team notification queued","Customer confirmation ready"].map((x,i)=><div className={styles.timelineItem} key={x}><div className={styles.timelineDot}>{i<4?<Check size={10}/>:<Clock3 size={10}/>}</div><div><b>{x}</b><small>{i<4?"Completed just now":"Next action"}</small></div></div>)}
      </aside>
    </div>
  </div>;
}
function Detail({label,value}:{label:string;value:string}) {
  return <div className={styles.detail}><span>{label}</span><b>{value}</b></div>;
}
