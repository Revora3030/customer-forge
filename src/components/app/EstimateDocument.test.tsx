import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EstimateDocument } from "./EstimateDocument";
import { blankLine, buildDocument, type DocumentFormState } from "@/lib/estimates/printable-estimate";

const NOW = new Date(2026, 9, 27, 12, 0, 0);
const base: DocumentFormState = {
  kind: "estimate",
  lines: [],
  taxRate: "",
  validDays: "",
  showPrices: false,
  jobSite: "",
  scheduledFor: "",
  assignedTo: "",
  notes: "",
  terms: "",
};

const render = (form: Partial<DocumentFormState>) =>
  renderToStaticMarkup(
    <EstimateDocument
      doc={buildDocument({
        form: { ...base, ...form },
        leadId: "5c0f7d52-3b9a-4a1e-8f6d-2a9b3c4d1a2b",
        now: NOW,
        business: { name: "Northside Plumbing", phone: "555-0100", email: "hello@northside.example", address: "12 Pipe St, Austin, TX 78701" },
        customer: { name: "Maria Lopez", email: "maria@example.com", phone: "555-0199" },
      })}
    />,
  );

describe("estimate document", () => {
  const html = render({
    taxRate: "8.25",
    validDays: "30",
    terms: "50% due on approval.",
    notes: "Replace the 40-gallon heater.",
    jobSite: "88 Elm Ct",
    lines: [
      { ...blankLine(), description: "Labor", quantity: "2", unitPrice: "85", taxable: false },
      { ...blankLine(), description: "Water heater", unitPrice: "120.50" },
    ],
  });

  it("names the business, customer, number, date and expiry", () => {
    expect(html).toContain("Northside Plumbing");
    expect(html).toContain("12 Pipe St, Austin, TX 78701");
    expect(html).toContain("Maria Lopez");
    expect(html).toContain("EST-261027-1A2B");
    expect(html).toContain("Prepared October 27, 2026");
    expect(html).toContain("Valid until November 26, 2026");
    expect(html).toContain("88 Elm Ct");
  });

  it("itemises the lines and totals them to the cent, marking what is not taxed", () => {
    expect(html).toContain("$170.00");
    expect(html).toContain("$120.50");
    expect(html).toContain("Subtotal");
    expect(html).toContain("$290.50");
    expect(html).toContain("Tax (8.25%)");
    expect(html).toContain("$9.94");
    expect(html).toContain("$300.44");
    expect(html).toContain("Labor");
    expect(html).toContain("(not taxed)");
  });

  it("carries the owner's scope and terms and a customer approval line", () => {
    expect(html).toContain("Scope of work");
    expect(html).toContain("Replace the 40-gallon heater.");
    expect(html).toContain("50% due on approval.");
    expect(html).toContain("Customer approval — signature");
    expect(html).not.toContain("Customer sign-off");
  });

  it("prints no tax row or expiry when the owner entered none", () => {
    const plain = render({ lines: [{ ...blankLine(), description: "Tune-up", unitPrice: "99" }] });
    expect(plain).not.toContain("Tax (");
    expect(plain).not.toContain("Valid until");
    expect(plain).not.toContain("(not taxed)");
    expect(plain).toContain("$99.00");
  });
});

describe("work order document", () => {
  const crewCopy = render({
    kind: "work_order",
    scheduledFor: "Wed, Oct 28 · 9:00 AM",
    assignedTo: "Sam",
    notes: "Gate code is on the fridge.",
    lines: [
      { ...blankLine(), description: "Replace anode rod" },
      { ...blankLine(), description: "Flush tank", quantity: "2.5" },
    ],
  });

  it("is a checklist for the crew with no prices, tax or total", () => {
    expect(crewCopy).toContain("Work order");
    expect(crewCopy).toContain("WO-261027-1A2B");
    expect(crewCopy).toContain("Replace anode rod");
    expect(crewCopy).toContain("2.5");
    expect(crewCopy).toContain("Done");
    expect(crewCopy).not.toContain("Unit price");
    expect(crewCopy).not.toContain("Subtotal");
    expect(crewCopy).not.toContain("Total");
    expect(crewCopy).not.toContain("$");
  });

  it("shows the schedule, crew and notes, and both sign-off lines", () => {
    expect(crewCopy).toContain("Wed, Oct 28 · 9:00 AM");
    expect(crewCopy).toContain("Sam");
    expect(crewCopy).toContain("Notes for the crew");
    expect(crewCopy).toContain("Gate code is on the fridge.");
    expect(crewCopy).toContain("Work completed by — signature");
    expect(crewCopy).toContain("Customer sign-off — signature");
    expect(crewCopy).not.toContain("Valid until");
    expect(crewCopy).not.toContain("Terms");
  });

  it("can show prices when the owner turns them on", () => {
    const priced = render({
      kind: "work_order",
      showPrices: true,
      lines: [{ ...blankLine(), description: "Replace anode rod", unitPrice: "45" }],
    });
    expect(priced).toContain("Unit price");
    expect(priced).toContain("$45.00");
    expect(priced).toContain("Total");
  });
});
