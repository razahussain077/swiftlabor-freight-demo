import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocKind = "invoice" | "rate_confirmation" | "pod";
type Severity = "HIGH" | "MEDIUM" | "LOW";

type ParsedDoc = {
  kind: DocKind;
  fileName: string;
  pages?: number;
  text: string;
  fields: Record<string, string | number | boolean | null>;
  parsed: boolean;
};

type Check = {
  severity: Severity;
  title: string;
  detail: string;
  amount?: number;
};

const MAX_FILE_BYTES = 1_500_000;

function money(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function first(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractFields(text: string) {
  const clean = text.replace(/\r/g, " ").replace(/[ \t]+/g, " ");
  const invoiceNumber = first(clean, [
    /(?:invoice|inv(?:oice)?)[\s#:-]*([A-Z0-9-]{4,})/i,
    /INV[\s-]?([A-Z0-9-]{4,})/i
  ]);
  const loadNumber = first(clean, [
    /(?:load|shipment|trip)[\s#:-]*([A-Z0-9-]{4,})/i,
    /(?:PRO|reference)[\s#:-]*([A-Z0-9-]{4,})/i
  ]);
  const carrier = first(clean, [
    /(?:carrier|vendor|payee|billed from)[\s:=-]*([A-Za-z0-9 &.'-]{3,60})(?=\s*(?:invoice|inv|load|date|amount|total|$))/i
  ]);
  const totalRaw = first(clean, [
    /(?:invoice total|grand total|total due|amount due|total)[\s:$-]*([0-9,]+\.\d{2})/i
  ]);
  const linehaulRaw = first(clean, [
    /(?:linehaul|line haul|base rate|line-haul)[\s:$-]*([0-9,]+\.\d{2})/i
  ]);
  const fuelRaw = first(clean, [
    /(?:fuel surcharge|fuel)[\s:$-]*([0-9,]+\.\d{2})/i
  ]);
  const accessorialRaw = first(clean, [
    /(?:accessorial|detention|lumper|stop[- ]?off|layover|tonu)[\s:$-]*([0-9,]+\.\d{2})/i
  ]);
  const dueDate = first(clean, [
    /(?:due date|payment due)[\s:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
  ]);

  return {
    invoiceNumber,
    loadNumber,
    carrier,
    total: money(totalRaw),
    linehaul: money(linehaulRaw),
    fuel: money(fuelRaw),
    accessorial: money(accessorialRaw),
    dueDate,
    signed: /signed|signature|received in good order|POD SIGNED/i.test(clean)
  };
}

async function parseFile(file: File, kind: DocKind): Promise<ParsedDoc> {
  if (file.size > 1_500_000) {
    throw new Error(file.name + " is larger than 1.5 MB. Please use a smaller document for this demo.");
  }

  const lower = file.name.toLowerCase();

  if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
    return {
      kind,
      fileName: file.name,
      pages: 1,
      parsed: false,
      text: "PDF upload received. Full PDF/OCR extraction is enabled in the production implementation.",
      fields: {}
    };
  }

  const text = await file.text();
  const parsed = text.trim().length > 10;
  return {
    kind,
    fileName: file.name,
    parsed,
    text: text.slice(0, 12000),
    fields: parsed ? extractFields(text) : {}
  };
}

const sample: ParsedDoc[] = [
  {
    kind: "invoice",
    fileName: "CarrierOne_INV-4821.pdf",
    pages: 1,
    parsed: true,
    fields: {
      invoiceNumber: "INV-4821",
      loadNumber: "TL-78431",
      carrier: "CarrierOne Logistics",
      total: 1816,
      linehaul: 1450,
      fuel: 216,
      accessorial: 150,
      dueDate: "10/03/2026",
      signed: false
    },
    text: "CarrierOne Logistics | Invoice INV-4821 | Load TL-78431 | Linehaul $1,450.00 | Fuel surcharge $216.00 | Detention $150.00 | Invoice total $1,816.00 | Due date 10/03/2026"
  },
  {
    kind: "rate_confirmation",
    fileName: "TL-78431_Rate_Confirmation.pdf",
    pages: 1,
    parsed: true,
    fields: {
      invoiceNumber: null,
      loadNumber: "TL-78431",
      carrier: "CarrierOne Logistics",
      total: null,
      linehaul: 1350,
      fuel: 216,
      accessorial: 0,
      dueDate: null,
      signed: false
    },
    text: "Rate Confirmation | Load TL-78431 | Carrier CarrierOne Logistics | Linehaul $1,350.00 | Fuel surcharge $216.00 | Approved accessorials $0.00"
  },
  {
    kind: "pod",
    fileName: "TL-78431_POD.pdf",
    pages: 1,
    parsed: true,
    fields: {
      invoiceNumber: null,
      loadNumber: "TL-78431",
      carrier: "CarrierOne Logistics",
      total: null,
      linehaul: null,
      fuel: null,
      accessorial: null,
      dueDate: null,
      signed: true
    },
    text: "Proof of Delivery | Load TL-78431 | Delivered 09/24/2026 | Signed by receiver"
  }
];

function analyze(documents: ParsedDoc[]) {
  const invoice = documents.find(d => d.kind === "invoice");
  const rate = documents.find(d => d.kind === "rate_confirmation");
  const pod = documents.find(d => d.kind === "pod");
  const checks: Check[] = [];

  if (!invoice?.parsed) {
    checks.push({
      severity: "HIGH",
      title: "Invoice text could not be extracted",
      detail: "The invoice may be scanned or image-only. Route it to manual review."
    });
  }

  const inv = invoice?.fields || {};
  const rc = rate?.fields || {};

  if (inv.linehaul != null && rc.linehaul != null && Math.abs(Number(inv.linehaul) - Number(rc.linehaul)) > 1) {
    const delta = Math.round((Number(inv.linehaul) - Number(rc.linehaul)) * 100) / 100;
    checks.push({
      severity: "HIGH",
      title: "Linehaul exceeds approved rate",
      detail: "Invoice shows $" + Number(inv.linehaul).toFixed(2) + " vs $" + Number(rc.linehaul).toFixed(2) + " on the rate confirmation.",
      amount: delta
    });
  }

  if (inv.fuel != null && rc.fuel != null && Math.abs(Number(inv.fuel) - Number(rc.fuel)) > 1) {
    const delta = Math.round((Number(inv.fuel) - Number(rc.fuel)) * 100) / 100;
    checks.push({
      severity: delta > 25 ? "MEDIUM" : "LOW",
      title: "Fuel surcharge differs from rate confirmation",
      detail: "Invoice shows $" + Number(inv.fuel).toFixed(2) + " vs $" + Number(rc.fuel).toFixed(2) + " approved.",
      amount: delta
    });
  }

  if (inv.accessorial != null && Number(inv.accessorial) > 0 && (rc.accessorial == null || Number(rc.accessorial) < Number(inv.accessorial))) {
    checks.push({
      severity: "HIGH",
      title: "Unsupported accessorial detected",
      detail: "Invoice contains $" + Number(inv.accessorial).toFixed(2) + " in accessorial charges, while the rate confirmation approves $" + Number(rc.accessorial || 0).toFixed(2) + ".",
      amount: Number(inv.accessorial) - Number(rc.accessorial || 0)
    });
  }

  if (!pod?.parsed) {
    checks.push({
      severity: "MEDIUM",
      title: "POD is missing",
      detail: "Proof of delivery is not available in this document set."
    });
  } else if (pod.fields.signed !== true) {
    checks.push({
      severity: "MEDIUM",
      title: "POD signature not verified",
      detail: "The extracted POD did not contain a clear signature or receipt confirmation."
    });
  }

  if (invoice?.fields.loadNumber && rate?.fields.loadNumber && invoice.fields.loadNumber !== rate.fields.loadNumber) {
    checks.push({
      severity: "HIGH",
      title: "Load number mismatch",
      detail: "Invoice references " + invoice.fields.loadNumber + "; rate confirmation references " + rate.fields.loadNumber + "."
    });
  }

  const invoiceTotal = money(inv.total as string | number | null | undefined);
  const expected = [
    money(rc.linehaul as string | number | null | undefined),
    money(rc.fuel as string | number | null | undefined),
    money(rc.accessorial as string | number | null | undefined)
  ]
    .filter((x): x is number => x != null)
    .reduce((a, b) => a + b, 0);

  if (invoiceTotal != null && expected > 0 && Math.abs(invoiceTotal - expected) > 1) {
    const delta = Math.round((invoiceTotal - expected) * 100) / 100;
    checks.push({
      severity: Math.abs(delta) > 100 ? "HIGH" : "MEDIUM",
      title: "Invoice total does not match approved charges",
      detail: "Invoice total is $" + invoiceTotal.toFixed(2) + "; approved charges total $" + expected.toFixed(2) + ".",
      amount: delta
    });
  }

  if (checks.length === 0) {
    return {
      status: "READY",
      severity: "LOW" as Severity,
      headline: "No exception found",
      decision: "Approve for AP processing",
      checks,
      riskAmount: 0,
      summary: "The submitted documents are internally consistent based on the extracted fields."
    };
  }

  const high = checks.filter(c => c.severity === "HIGH");
  const medium = checks.filter(c => c.severity === "MEDIUM");
  const riskAmount = Math.round(checks.reduce((sum, c) => sum + Math.max(0, Number(c.amount || 0)), 0) * 100) / 100;

  return {
    status: high.length ? "EXCEPTION" : "REVIEW",
    severity: (high.length ? "HIGH" : "MEDIUM") as Severity,
    headline: high.length ? "Exception requires review" : "Review recommended",
    decision: high.length ? "Hold payment and route to exception queue" : "Route to AP review",
    checks,
    riskAmount,
    summary: high.length
      ? high.length + " high-severity issue" + (high.length > 1 ? "s" : "") + " detected. Review before releasing payment."
      : medium.length + " review item" + (medium.length > 1 ? "s" : "") + " detected."
  };
}

async function aiExtract(texts: string[]) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt =
    "Extract freight document fields. Return ONLY JSON. Do not infer missing values." +
    "\n\n" +
    texts.map((t, i) => "DOCUMENT " + (i + 1) + ":\n" + t.slice(0, 8000)).join("\n\n") +
    "\n\nJSON schema:" +
    '\n{"invoiceNumber":string|null,"loadNumber":string|null,"carrier":string|null,"total":number|null,"linehaul":number|null,"fuel":number|null,"accessorial":number|null,"dueDate":string|null,"signed":boolean}';

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0
          }
        }),
        cache: "no-store"
      }
    );

    if (!response.ok) return null;
    const json = await response.json();
    const output = (json?.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p.text || "")
      .join("");
    const cleaned = output
      .replace(/^\x60\x60\x60json\s*/i, "")
      .replace(/\s*\x60\x60\x60$/i, "")
      .trim();

    return cleaned ? JSON.parse(cleaned) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") || "");

    if (mode === "sample") {
      const analysis = analyze(sample);
      return NextResponse.json({
        mode: "sample",
        documents: sample,
        ...analysis,
        processedAt: new Date().toISOString(),
        engine: "SwiftLabor document automation"
      });
    }

    const entries: Array<[FormDataEntryValue | null, DocKind]> = [
      [form.get("invoice"), "invoice"],
      [form.get("rate_confirmation"), "rate_confirmation"],
      [form.get("pod"), "pod"]
    ];

    const files = entries.filter(
      ([value]) => value instanceof File && (value as File).size > 0
    );

    if (!files.length) {
      return NextResponse.json(
        { error: "Upload at least one document or load the sample case." },
        { status: 400 }
      );
    }

    const documents: ParsedDoc[] = [];
    for (const [value, kind] of files) {
      documents.push(await parseFile(value as File, kind));
    }

    const ai = await aiExtract(documents.map(d => d.text).filter(Boolean));
    if (ai && documents[0]) {
      const fields = { ...documents[0].fields };
      for (const key of ["invoiceNumber", "loadNumber", "carrier", "dueDate", "total", "linehaul", "fuel", "accessorial", "signed"]) {
        if (ai[key] !== undefined && ai[key] !== null && ai[key] !== "") fields[key] = ai[key];
      }
      documents[0].fields = fields;
    }

    const analysis = analyze(documents);
    return NextResponse.json({
      mode: "uploaded",
      documents,
      ...analysis,
      processedAt: new Date().toISOString(),
      engine: ai ? "SwiftLabor AI document automation" : "SwiftLabor document automation"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process the documents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
