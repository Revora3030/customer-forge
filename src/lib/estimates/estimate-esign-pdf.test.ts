import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { EMPTY_DEFAULTS, blankLine, buildDocument, initialFormState, type DocumentFormState } from "./printable-estimate";
import {
  canonicalDocumentJson,
  cleanSignerName,
  isMissingSchema,
  sha256Hex,
  signaturePngBytes,
} from "./estimate-signature";
import { estimatePdfFileName, pdfSafe, renderEstimatePdf, wrapText } from "./estimate-pdf";

const NOW = new Date(2026, 9, 27, 12, 0, 0);
const LEAD_ID = "5c0f7d52-3b9a-4a1e-8f6d-2a9b3c4d1a2b";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const doc = (over: Partial<DocumentFormState> = {}) =>
  buildDocument({
    form: {
      ...initialFormState({ serviceName: null, scheduledFor: "", assignedTo: "", defaults: EMPTY_DEFAULTS }),
      lines: [
        { ...blankLine(), description: "Replace water heater — 50 gal", unitPrice: "1450" },
        { ...blankLine(), description: "Haul away old unit", unitPrice: "75", quantity: "1" },
      ],
      notes: "Includes permit.\nCustomer keeps old parts on request.",
      terms: "50% deposit; balance on completion.",
      ...over,
    },
    leadId: LEAD_ID,
    now: NOW,
    business: { name: "Northside Plumbing", phone: "555-0100" },
    customer: { name: "Maria López", email: "maria@example.com", phone: "555-0199" },
  });

describe("estimate signature audit helpers", () => {
  it("fingerprints the document stably, ignoring key order and validation problems", async () => {
    const a = doc();
    const b = { ...a, problems: ["something"] };
    expect(canonicalDocumentJson(a)).toBe(canonicalDocumentJson(b));
    const hash = await sha256Hex(canonicalDocumentJson(a));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(canonicalDocumentJson(doc({ terms: "Net 30" })))).not.toBe(hash);
  });

  it("accepts only small real PNG data URLs", () => {
    expect(signaturePngBytes(PNG)?.length).toBeGreaterThan(8);
    expect(signaturePngBytes("data:image/jpeg;base64,/9j/4AAQ")).toBeNull();
    expect(signaturePngBytes("data:image/png;base64,SGVsbG8gd29ybGQ=")).toBeNull();
    expect(signaturePngBytes("data:image/png;base64,not base64!")).toBeNull();
    expect(signaturePngBytes(`data:image/png;base64,${"A".repeat(500_000)}`)).toBeNull();
  });

  it("cleans signer names and spots a not-yet-applied migration", () => {
    expect(cleanSignerName("  Maria\n\tLópez  ")).toBe("Maria López");
    expect(cleanSignerName("x".repeat(200))).toHaveLength(120);
    expect(isMissingSchema("Bucket not found")).toBe(true);
    expect(isMissingSchema("x", "PGRST205")).toBe(true);
    expect(isMissingSchema("relation \"public.estimate_signatures\" does not exist")).toBe(true);
    expect(isMissingSchema("duplicate key value")).toBe(false);
  });
});

describe("estimate PDF (pdf-lib)", () => {
  it("maps characters Helvetica can't draw instead of throwing", () => {
    expect(pdfSafe("−$50 · café — ok")).toBe("-$50 · café — ok");
    expect(pdfSafe("pipe 🚿 fix")).toBe("pipe ?? fix");
  });

  it("wraps long text to the width", () => {
    const font = { widthOfTextAtSize: (t: string, size: number) => t.length * size * 0.5 };
    const lines = wrapText("one two three four five six seven", font, 10, 60);
    expect(lines.every((l) => l.length * 5 <= 60)).toBe(true);
    expect(lines.join(" ")).toBe("one two three four five six seven");
    expect(wrapText("a\n\nb", font, 10, 60)).toEqual(["a", "", "b"]);
  });

  it("produces a loadable PDF for an estimate, with and without a signature", async () => {
    const d = doc();
    const plain = await renderEstimatePdf(d);
    expect(new TextDecoder().decode(plain.slice(0, 5))).toBe("%PDF-");
    const loaded = await PDFDocument.load(plain);
    expect(loaded.getPageCount()).toBe(1);
    expect(loaded.getTitle()).toContain(d.number);

    const signed = await renderEstimatePdf(d, {
      signature: { dataUrl: PNG, signerName: "Maria López", signedAt: "2026-10-30T12:00:00.000Z" },
    });
    expect(signed.length).toBeGreaterThan(plain.length);
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(1);
  });

  it("paginates long work orders and negative amounts", async () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ ...blankLine(), description: `Task ${i + 1} with a fairly long description that wraps onto another line`, unitPrice: i === 0 ? "-20" : "10" }));
    const pdf = await PDFDocument.load(await renderEstimatePdf(doc({ kind: "work_order", lines })));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("names the file after the document", () => {
    expect(estimatePdfFileName(doc())).toMatch(/^Estimate .+ - Northside Plumbing\.pdf$/);
  });
});

describe("e-sign wiring", () => {
  const dialog = readFileSync("src/components/app/EstimateBuilderDialog.tsx", "utf8");
  const migration = readFileSync("supabase/migrations/20261030140000_estimate_signatures.sql", "utf8");

  it("voids a signature when the estimate changes and keeps the print fallback", () => {
    expect(dialog).toContain("signed.docJson === docJson");
    expect(dialog).toContain("window.print()");
    expect(dialog).toContain("Download PDF");
  });

  it("stores signatures privately, member-readable and service-role-written", () => {
    expect(migration).toMatch(/'estimate-signatures', 'estimate-signatures', false/);
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("is_org_member(organization_id)");
    expect(migration).toMatch(/revoke insert, update, delete on public\.estimate_signatures from authenticated/);
  });
});
