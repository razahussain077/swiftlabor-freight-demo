"use client";

import { ChangeEvent, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileText,
  LockKeyhole,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
  XCircle,
  Zap
} from "lucide-react";

type DocKind = "invoice" | "rate_confirmation" | "pod";

type Result = {
  documents: Array<{
    kind: DocKind;
    fileName: string;
    pages?: number;
    parsed: boolean;
    fields: Record<string, string | number | boolean | null>;
  }>;
  status: "EXCEPTION" | "REVIEW" | "READY";
  severity: "HIGH" | "MEDIUM" | "LOW";
  headline: string;
  decision: string;
  checks: Array<{ severity: "HIGH" | "MEDIUM" | "LOW"; title: string; detail: string; amount?: number }>;
  riskAmount: number;
  summary: string;
  processedAt: string;
  engine: string;
};

const docMeta: Record<DocKind, { label: string; hint: string }> = {
  invoice: { label: "Carrier invoice", hint: "Amount requested for payment" },
  rate_confirmation: { label: "Rate confirmation", hint: "Approved charges" },
  pod: { label: "Proof of delivery", hint: "Delivery evidence" }
};

export default function Home() {
  const [files, setFiles] = useState<Record<DocKind, File | null>>({
    invoice: null,
    rate_confirmation: null,
    pod: null
  });
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState("");

  const count = Object.values(files).filter(Boolean).length;

  async function run(mode: "sample" | "upload") {
    if (running) return;
    setRunning(true);
    setError("");
    setNotice("");
    setAction("");

    const body = new FormData();
    if (mode === "sample") body.append("mode", "sample");
    else Object.entries(files).forEach(([kind, file]) => file && body.append(kind, file));

    try {
      const response = await fetch("/api/exception", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The workflow could not be completed.");
      setResult(data);
      setNotice(mode === "sample" ? "Working example loaded" : "Documents analyzed");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The workflow could not be completed.");
    } finally {
      setRunning(false);
    }
  }

  function select(kind: DocKind, e: ChangeEvent<HTMLInputElement>) {
    setFiles(current => ({ ...current, [kind]: e.target.files?.[0] || null }));
  }

  function clear(kind: DocKind) {
    setFiles(current => ({ ...current, [kind]: null }));
  }

  function runAction(name: string) {
    setAction(name);
    setNotice(
      name === "hold"
        ? "Payment hold prepared for the exception queue"
        : name === "request"
        ? "Carrier document request prepared"
        : "Packet prepared for AP review"
    );
    window.setTimeout(() => setNotice(""), 2600);
  }

  return (
    <main className="exceptionDesk">
      <header className="exceptionHeader">
        <div className="brand">
          <div className="brandMark">S</div>
          <div><b>SwiftLabor</b><span>FREIGHT EXCEPTION DESK</span></div>
        </div>
        <div className="headerMeta">
          <span><i /> Private workflow</span>
          <span><Zap size={13} /> Evidence-first automation</span>
        </div>
      </header>

      <div className="exceptionLayout">
        <aside className="rail">
          <div className="railTitle">PAYMENT WORKFLOW</div>
          <RailStep n="01" title="Document intake" sub="Invoice + support docs" active />
          <RailStep n="02" title="Cross-check" sub="Compare approved charges" />
          <RailStep n="03" title="Exception decision" sub="Hold, review or approve" />
          <RailStep n="04" title="Next action" sub="Route the packet" />
          <div className="railCallout">
            <ShieldCheck size={15} />
            <div><b>Human control</b><span>The system surfaces evidence and prepares the next action. Your team decides.</span></div>
          </div>
        </aside>

        <section className="content">
          <div className="heroRow">
            <div>
              <div className="eyebrow">FREIGHT OPERATIONS / PAYMENT CONTROL</div>
              <h1>Catch the exception before AP pays it.</h1>
              <p>Upload the document set. SwiftLabor extracts the charges, cross-checks them and explains exactly why a payment needs attention.</p>
            </div>
            <button className="exampleButton" onClick={() => run("sample")} disabled={running}>
              <FileCheck2 size={15} /> Run working example
            </button>
          </div>

          <section className="card intake">
            <div className="cardHeading">
              <div className="headingWithStep"><span>01</span><div><div className="cardEyebrow">DOCUMENT INTAKE</div><h2>Build the payment packet</h2><p>Use one or all three document types. Text-based PDFs work in this prototype.</p></div></div>
              <b className="count">{count}/3</b>
            </div>

            <div className="uploadGrid">
              {(["invoice", "rate_confirmation", "pod"] as DocKind[]).map(kind => (
                <DocUpload key={kind} kind={kind} file={files[kind]} onSelect={select} onClear={clear} />
              ))}
            </div>

            <div className="intakeFooter">
              <div className="privacy"><LockKeyhole size={13} /> Files are processed in memory for the demo.</div>
              <button className="primaryButton" onClick={() => run("upload")} disabled={running || count === 0}>
                {running ? <><RefreshCw className="spin" size={15} /> Processing…</> : <><Upload size={15} /> Analyze documents <ArrowRight size={15} /></>}
              </button>
            </div>
            {error && <div className="error"><AlertCircle size={15} /> {error}</div>}
          </section>

          <div className="sectionRow">
            <div><div className="eyebrow">02 / DECISION RECORD</div><h2>What should happen to this payment?</h2></div>
            {notice && <div className="notice">{notice}</div>}
          </div>

          {!result ? <EmptyState onRun={() => run("sample")} /> : <ResultView result={result} action={action} onAction={runAction} />}

          <footer className="footer"><b>SwiftLabor.ai</b><span>Freight exception automation · Prototype</span></footer>
        </section>
      </div>
    </main>
  );
}

function RailStep({ n, title, sub, active }: { n: string; title: string; sub: string; active?: boolean }) {
  return <div className={"railStep " + (active ? "active" : "")}><span>{n}</span><div><b>{title}</b><small>{sub}</small></div></div>;
}

function DocUpload({
  kind, file, onSelect, onClear
}: {
  kind: DocKind;
  file: File | null;
  onSelect: (kind: DocKind, e: ChangeEvent<HTMLInputElement>) => void;
  onClear: (kind: DocKind) => void;
}) {
  const inputId = "doc-" + kind;
  return <div className={"docUpload " + (file ? "selected" : "")}>
    <input id={inputId} className="hiddenFile" type="file" accept=".pdf,.txt,.csv,.json" onChange={e => onSelect(kind, e)} />
    <label htmlFor={inputId} className="docClick">
      <div className="docIcon">{file ? <FileCheck2 size={17} /> : <Upload size={17} />}</div>
      <div><span>{docMeta[kind].label}</span><b>{file ? file.name : "Choose document"}</b><small>{docMeta[kind].hint}</small></div>
    </label>
    {file && <button className="remove" type="button" onClick={() => onClear(kind)} aria-label="Remove document"><XCircle size={15} /></button>}
  </div>;
}

function EmptyState({ onRun }: { onRun: () => void }) {
  return <div className="empty card">
    <div className="emptyIcon"><FileText size={20} /></div>
    <div><b>No payment packet analyzed yet</b><p>Run the working example to see a real exception flow: overcharge → evidence → recommended action.</p>
    <button className="secondaryButton" onClick={onRun}>Run working example <ArrowRight size={14} /></button></div>
  </div>;
}

function ResultView({ result, action, onAction }: { result: Result; action: string; onAction: (name: string) => void }) {
  const invoice = result.documents.find(x => x.kind === "invoice");
  const rate = result.documents.find(x => x.kind === "rate_confirmation");
  const approvedTotal = num(rate?.fields.linehaul) + num(rate?.fields.fuel) + num(rate?.fields.accessorial);

  return <div className="results">
    <section className="decision card">
      <div className={"decisionIcon " + result.status.toLowerCase()}>
        {result.status === "EXCEPTION" ? <AlertTriangle size={20} /> : result.status === "READY" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
      </div>
      <div className="decisionCopy"><div className="decisionLabel">{result.status} · {result.severity}</div><h3>{result.headline}</h3><p>{result.summary}</p></div>
      <div className="risk"><span>AMOUNT AT RISK</span><b>{"$" + result.riskAmount.toFixed(2)}</b><small>{result.decision}</small></div>
    </section>

    <div className="metricGrid">
      <Metric label="Invoice total" value={money(invoice?.fields.total)} sub={String(invoice?.fields.invoiceNumber || "Not verified")} />
      <Metric label="Approved total" value={money(approvedTotal)} sub={rate?.fields.loadNumber ? "Load " + rate.fields.loadNumber : "Rate confirmation"} />
      <Metric label="Findings" value={String(result.checks.length)} sub="Evidence-backed" />
      <Metric label="Workflow" value={result.status} sub={result.engine.includes("AI") ? "AI extraction" : "Rule-based extraction"} />
    </div>

    <section className="card compare">
      <div className="cardHeading simple"><div><div className="cardEyebrow">CHARGE RECONCILIATION</div><h3>Invoice vs approved</h3></div><span className="verified"><ShieldCheck size={12}/> Evidence matched</span></div>
      <div className="tableHead"><span>CHARGE</span><span>INVOICE</span><span>APPROVED</span><span>DELTA</span></div>
      <Compare name="Linehaul" a={invoice?.fields.linehaul} b={rate?.fields.linehaul} />
      <Compare name="Fuel surcharge" a={invoice?.fields.fuel} b={rate?.fields.fuel} />
      <Compare name="Accessorials" a={invoice?.fields.accessorial} b={rate?.fields.accessorial} />
      <Compare name="Invoice total" a={invoice?.fields.total} b={approvedTotal} />
    </section>

    <div className="twoCol">
      <section className="card findings"><div className="cardHeading simple"><div><div className="cardEyebrow">EXCEPTION LOG</div><h3>Why it was flagged</h3></div><span className="findingCount">{result.checks.length} findings</span></div>
        {result.checks.map((item, i) => <div className="finding" key={i}><div className={"findingIcon " + item.severity.toLowerCase()}>{item.severity === "HIGH" ? <AlertTriangle size={15}/> : <AlertCircle size={15}/>}</div><div><div className="findingTitle"><b>{item.title}</b><span>{item.severity}</span></div><p>{item.detail}</p></div>{item.amount != null && <strong>{"$" + Number(item.amount).toFixed(2)}</strong>}</div>)}
      </section>

      <aside className="card source"><div className="cardHeading simple"><div><div className="cardEyebrow">SOURCE PACKET</div><h3>Documents</h3></div><span className="verified"><FileCheck2 size={12}/> Reviewed</span></div>
        {(["invoice", "rate_confirmation", "pod"] as DocKind[]).map(kind => {
          const doc = result.documents.find(x => x.kind === kind);
          return <div className={"sourceRow " + (!doc ? "missing" : "")} key={kind}><div className="sourceIcon">{doc ? <FileText size={14}/> : <XCircle size={14}/>}</div><div><b>{docMeta[kind].label}</b><small>{doc ? doc.fileName : "Not supplied"}</small></div><span>{doc ? (doc.parsed ? "Parsed" : "Review") : "Missing"}</span></div>;
        })}
      </aside>
    </div>

    <section className="card nextAction"><div><div className="cardEyebrow">03 / NEXT ACTION</div><h3>{result.status === "EXCEPTION" ? "Hold the payment before it leaves AP." : result.decision + "."}</h3><p>The workflow prepares the action; your operator confirms it.</p></div>
      <div className="actions">
        {result.status === "EXCEPTION" && <button className={"hold " + (action === "hold" ? "chosen" : "")} onClick={() => onAction("hold")}><LockKeyhole size={14}/> Hold payment</button>}
        <button className={action === "request" ? "chosen" : ""} onClick={() => onAction("request")}><Send size={14}/> Request documents</button>
        <button className={"dark " + (action === "approve" ? "chosen" : "")} onClick={() => onAction("approve")}><CheckCircle2 size={14}/> Send to AP</button>
      </div>
    </section>

    {action && <div className="actionBar"><CheckCircle2 size={15}/> {action === "hold" ? "Payment hold prepared for the exception queue." : action === "request" ? "Document request prepared for the carrier." : "Packet prepared for AP review."}</div>}
    <div className="controlLine"><ShieldCheck size={14}/> Evidence stays visible. Automation does not silently release payment.</div>
  </div>;
}

function Compare({ name, a, b }: { name: string; a: string | number | boolean | null | undefined; b: string | number | boolean | null | undefined }) {
  const av = num(a); const bv = num(b); const has = a != null && b != null; const d = Math.round((av - bv) * 100) / 100;
  return <div className="tableRow"><b>{name}</b><span>{money(a)}</span><span>{money(b)}</span><span className={has && d > 0 ? "badText" : "okText"}>{has ? (d > 0 ? "+" : "") + "$" + d.toFixed(2) : "—"}</span></div>;
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="metric card"><span>{label}</span><b>{value}</b><small>{sub}</small></div>;
}

function money(value: string | number | boolean | null | undefined) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? "$" + n.toFixed(2) : String(value);
}

function num(value: string | number | boolean | null | undefined) {
  if (value == null || typeof value === "boolean") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
