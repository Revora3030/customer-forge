import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");
const dialog = readFileSync("src/components/app/EstimateBuilderDialog.tsx", "utf8");
const leads = readFileSync("src/routes/_authenticated/app.leads.tsx", "utf8");

/**
 * Printing an owner document only works because of three things lining up: the copy that prints is
 * rendered straight under <body>, it is hidden on screen, and the print stylesheet drops everything
 * else. Break any one and the printout becomes the whole dialog, clipped to the first page.
 */
describe("owner document printing contract", () => {
  it("renders the printing copy under <body>, outside the scrolling dialog", () => {
    expect(dialog).toContain("data-print-document");
    expect(dialog).toMatch(/createPortal\([\s\S]*document\.body,?\s*\)/);
  });

  it("hides that copy on screen", () => {
    expect(css).toMatch(/\[data-print-document\]\s*\{\s*display:\s*none;\s*\}/);
  });

  it("drops everything except the copy from the printout and unlocks the scroll-locked page", () => {
    expect(css).toMatch(/body:has\(\[data-print-document\]\)\s*>\s*:not\(\[data-print-document\]\)\s*\{\s*display:\s*none\s*!important;/);
    expect(css).toMatch(/body:has\(\[data-print-document\]\)\s*>\s*\[data-print-document\]\s*\{\s*display:\s*block\s*!important;/);
    expect(css).toMatch(/overflow:\s*visible\s*!important/);
  });

  it("is reachable from a lead and records the document on the lead's activity", () => {
    expect(leads).toContain("EstimateBuilderDialog");
    expect(leads).toContain("documentLogBody(doc)");
  });

  it("never sends anything to the customer from the dialog", () => {
    expect(dialog).not.toMatch(/mailto:|sms:|sendEmail|sendMessage|fetch\(/);
  });
});
