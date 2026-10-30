/**
 * Real PDF of an owner's estimate or work order, built in the browser with
 * pdf-lib (MIT, no server, no service). Mirrors EstimateDocument: business
 * header, customer, line items, totals, scope, terms and, when the customer
 * signed on screen, their signature image with name and time. The browser's
 * Print / Save as PDF stays available as a fallback.
 *
 * Uses the built-in Helvetica (WinAnsi), so text is normalised to characters it
 * can draw; anything else becomes "?" rather than failing the whole PDF.
 */
import type { DocumentModel } from "@/lib/estimates/printable-estimate";
import { formatCents } from "@/lib/estimates/printable-estimate";
import type { EstimateSignature } from "@/lib/estimates/estimate-signature";
import { signaturePngBytes } from "@/lib/estimates/estimate-signature";

const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** Characters Helvetica/WinAnsi can't encode, mapped to safe stand-ins. */
export function pdfSafe(text: string): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u2212/g, "-")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/\u00a0|\u202f|\u2009/g, " ")
    .replace(/[^\n\u0020-\u007e\u00a1-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac\u00b7]/g, "?");
}

type Font = { widthOfTextAtSize(text: string, size: number): number };

/** Greedy word wrap to a width; long words are hard-broken. */
export function wrapText(text: string, font: Font, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

export function estimatePdfFileName(doc: DocumentModel): string {
  const base = `${doc.title} ${doc.number} - ${doc.business.name}`
    .replace(/[^A-Za-z0-9 ._-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${base || "estimate"}.pdf`;
}

export async function renderEstimatePdf(
  doc: DocumentModel,
  options: { signature?: EstimateSignature | null } = {},
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`${doc.title} ${doc.number}`));
  pdf.setAuthor(pdfSafe(doc.business.name));
  pdf.setProducer("Revora");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE: [number, number] = [612, 792]; // US Letter
  const M = 48;
  const W = PAGE[0] - M * 2;
  const ink = rgb(0.09, 0.09, 0.09);
  const muted = rgb(0.4, 0.4, 0.4);
  const rule = rgb(0.8, 0.8, 0.8);

  let page = pdf.addPage(PAGE);
  let y = PAGE[1] - M;
  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage(PAGE);
      y = PAGE[1] - M;
    }
  };
  const text = (value: string, x: number, size = 10, font = regular, color = ink) =>
    page.drawText(pdfSafe(value), { x, y, size, font, color });
  const right = (value: string, xRight: number, size = 10, font = regular, color = ink) =>
    text(value, xRight - font.widthOfTextAtSize(pdfSafe(value), size), size, font, color);
  const hr = (color = rule) =>
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.75, color });
  const para = (value: string, size = 10, color = ink, width = W) => {
    for (const line of wrapText(value, regular, size, width)) {
      ensure(size + 4);
      text(line, M, size, regular, color);
      y -= size + 4;
    }
  };

  // Header: business on the left, document title on the right.
  text(doc.business.name, M, 16, bold);
  right(doc.title.toUpperCase(), M + W, 16, bold);
  y -= 18;
  right(doc.number, M + W, 10, bold);
  if (doc.business.address) text(doc.business.address, M, 9, regular, muted);
  y -= 12;
  right(`Prepared ${doc.preparedOn}`, M + W, 9, regular, muted);
  const contact = [doc.business.phone, doc.business.email, doc.business.website].filter(Boolean).join("  ·  ");
  if (contact) text(contact, M, 9, regular, muted);
  y -= 12;
  if (doc.validUntil) {
    right(`Valid until ${doc.validUntil}`, M + W, 9, regular, muted);
    y -= 12;
  }
  y -= 4;
  hr();
  y -= 18;

  // Customer and job.
  text(doc.kind === "estimate" ? "PREPARED FOR" : "CUSTOMER", M, 8, bold, muted);
  y -= 13;
  text(doc.customer.name, M, 11, bold);
  y -= 13;
  for (const line of [doc.customer.phone, doc.customer.email, doc.jobSite && `Job site: ${doc.jobSite}`, doc.scheduledFor && `Scheduled: ${doc.scheduledFor}`, doc.assignedTo && `Crew: ${doc.assignedTo}`]) {
    if (!line) continue;
    para(String(line), 10, ink);
  }
  y -= 10;

  // Line items.
  const colQty = M + W - (doc.showPrices ? 190 : 0);
  const colUnit = M + W - 90;
  const descWidth = colQty - M - 40;
  ensure(30);
  text("DESCRIPTION", M, 8, bold, muted);
  right("QTY", colQty, 8, bold, muted);
  if (doc.showPrices) {
    right("UNIT PRICE", colUnit, 8, bold, muted);
    right("AMOUNT", M + W, 8, bold, muted);
  }
  y -= 6;
  hr(muted);
  y -= 14;
  const markUntaxed = doc.showPrices && doc.taxRateLabel !== null;
  for (const line of doc.lines) {
    const label = `${line.description}${markUntaxed && !line.taxable ? " (not taxed)" : ""}`;
    const wrapped = wrapText(label, regular, 10, descWidth);
    ensure(wrapped.length * 13 + 8);
    const top = y;
    wrapped.forEach((part, i) => {
      y = top - i * 13;
      text(part, M);
    });
    y = top;
    right(quantityFormat.format(line.quantity), colQty);
    if (doc.showPrices) {
      if (line.unitCents !== null) right(formatCents(line.unitCents), colUnit);
      if (line.amountCents !== null) right(formatCents(line.amountCents), M + W, 10, bold);
    }
    y = top - wrapped.length * 13 - 2;
    hr();
    y -= 13;
  }

  // Totals.
  if (doc.showPrices) {
    ensure(60);
    y -= 4;
    const label = M + W - 200;
    text("Subtotal", label, 10, regular, muted);
    right(formatCents(doc.subtotalCents), M + W);
    y -= 14;
    if (doc.taxRateLabel) {
      text(`Tax (${doc.taxRateLabel})`, label, 10, regular, muted);
      right(formatCents(doc.taxCents), M + W);
      y -= 14;
    }
    page.drawLine({ start: { x: label, y: y + 10 }, end: { x: M + W, y: y + 10 }, thickness: 0.75, color: muted });
    y -= 2;
    text("Total", label, 13, bold);
    right(formatCents(doc.totalCents), M + W, 13, bold);
    y -= 24;
  }

  const section = (title: string, body: string) => {
    if (!body) return;
    ensure(36);
    text(title.toUpperCase(), M, 8, bold, muted);
    y -= 13;
    para(body, 10, ink);
    y -= 8;
  };
  section(doc.kind === "estimate" ? "Scope of work" : "Notes for the crew", doc.notes);
  section("Terms", doc.terms);

  // Signatures.
  ensure(110);
  y -= 16;
  const sig = options.signature ?? null;
  const png = sig ? signaturePngBytes(sig.dataUrl) : null;
  const signLine = (label: string, x: number, width: number) => {
    page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.75, color: ink });
    page.drawText(pdfSafe(label), { x, y: y - 11, size: 8, font: regular, color: muted });
  };
  if (doc.kind === "estimate") {
    if (png && sig) {
      const image = await pdf.embedPng(png);
      const scale = Math.min(220 / image.width, 60 / image.height, 1);
      page.drawImage(image, { x: M, y: y + 2, width: image.width * scale, height: image.height * scale });
      signLine(`Approved by ${sig.signerName} — signed electronically`, M, W * 0.6);
      text(new Date(sig.signedAt).toLocaleString("en-US"), M + W * 0.66, 10);
      signLine("Date", M + W * 0.66, W * 0.34);
    } else {
      y -= 30;
      signLine("Customer approval — signature", M, W * 0.6);
      signLine("Date", M + W * 0.66, W * 0.34);
    }
  } else {
    y -= 30;
    signLine("Work completed by — signature", M, W * 0.6);
    signLine("Date completed", M + W * 0.66, W * 0.34);
    y -= 50;
    ensure(20);
    signLine("Customer sign-off — signature", M, W * 0.6);
    signLine("Date", M + W * 0.66, W * 0.34);
  }

  return pdf.save();
}
