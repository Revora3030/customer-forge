import { describe, expect, it } from "vitest";
import {
  EMPTY_DEFAULTS,
  blankLine,
  buildDocument,
  businessAddress,
  documentLogBody,
  documentNumber,
  formatCents,
  formatSchedule,
  initialFormState,
  latestQuoteFor,
  loadDefaults,
  nextAppointmentLabel,
  parseMoneyToCents,
  parseQuantity,
  parseTaxRate,
  parseValidDays,
  quoteChoices,
  quoteChoicesText,
  saveDefaults,
  type DocumentFormState,
  type LineDraft,
} from "./printable-estimate";

// Local noon, so the date parts agree in every time zone.
const NOW = new Date(2026, 9, 27, 12, 0, 0);
const LEAD_ID = "5c0f7d52-3b9a-4a1e-8f6d-2a9b3c4d1a2b";
const business = { name: "Northside Plumbing", phone: "555-0100" };
const customer = { name: "Maria Lopez", email: "maria@example.com", phone: "555-0199" };

const line = (description: string, unitPrice: string, extra: Partial<LineDraft> = {}): LineDraft => ({
  ...blankLine(),
  description,
  unitPrice,
  ...extra,
});

const form = (over: Partial<DocumentFormState> = {}): DocumentFormState => ({
  ...initialFormState({ serviceName: null, scheduledFor: "", assignedTo: "", defaults: EMPTY_DEFAULTS }),
  lines: [],
  ...over,
});

const build = (over: Partial<DocumentFormState> = {}) =>
  buildDocument({ form: form(over), leadId: LEAD_ID, now: NOW, business, customer });

describe("parsing what the owner types", () => {
  it("reads dollars to exact cents and rounds half up on a third decimal", () => {
    expect(parseMoneyToCents("1,234.5")).toBe(123450);
    expect(parseMoneyToCents("$19.99")).toBe(1999);
    expect(parseMoneyToCents("1.005")).toBe(101);
    expect(parseMoneyToCents("1.004")).toBe(100);
    expect(parseMoneyToCents(".5")).toBe(50);
    expect(parseMoneyToCents("0")).toBe(0);
    expect(parseMoneyToCents("-50")).toBe(-5000);
  });

  it("never produces negative zero", () => {
    expect(Object.is(parseMoneyToCents("-0"), 0)).toBe(true);
  });

  it("rejects blanks, words, stray symbols and amounts beyond the line limit", () => {
    for (const bad of ["", "abc", "12.3.4", "1e5", ".", "$", "10000000.01", "99999999999"]) {
      expect(parseMoneyToCents(bad)).toBeNull();
    }
    expect(parseMoneyToCents("10000000")).toBe(1_000_000_000);
  });

  it("accepts quantities above zero to three decimals and rejects the rest", () => {
    expect(parseQuantity("2.5")).toBe(2.5);
    expect(parseQuantity("1,000")).toBe(1000);
    expect(parseQuantity("0.0004")).toBeNull();
    for (const bad of ["", "0", "-1", "abc", "100001"]) expect(parseQuantity(bad)).toBeNull();
  });

  it("reads a tax rate as a percent, treats blank as no tax and refuses anything outside 0 to 30", () => {
    expect(parseTaxRate("")).toBe(0);
    expect(parseTaxRate("8.25%")).toBe(8.25);
    expect(parseTaxRate("8.875")).toBe(8.875);
    expect(parseTaxRate("30")).toBe(30);
    expect(parseTaxRate("31")).toBeNull();
    expect(parseTaxRate("abc")).toBeNull();
    expect(parseTaxRate("-1")).toBeNull();
  });

  it("reads the valid-for days as whole days from 1 to 365, blank meaning no expiry", () => {
    expect(parseValidDays("")).toEqual({ days: null, valid: true });
    expect(parseValidDays("30")).toEqual({ days: 30, valid: true });
    for (const bad of ["0", "400", "3.5", "x"]) expect(parseValidDays(bad).valid).toBe(false);
  });
});

describe("formatting", () => {
  it("prints exact cents with a real minus sign", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(-5000)).toBe("−$50.00");
  });

  it("numbers a document by kind, local date and the lead id's last four characters", () => {
    expect(documentNumber("estimate", LEAD_ID, NOW)).toBe("EST-261027-1A2B");
    expect(documentNumber("work_order", LEAD_ID, NOW)).toBe("WO-261027-1A2B");
    expect(documentNumber("estimate", "ab", new Date(2026, 0, 5))).toBe("EST-260105-00AB");
  });

  it("describes an appointment start in plain words, or nothing when unreadable", () => {
    expect(formatSchedule(new Date(2026, 9, 28, 9, 0).toISOString())).toBe("Wed, Oct 28 · 9:00 AM");
    expect(formatSchedule("not a date")).toBe("");
  });
});

describe("estimate arithmetic", () => {
  it("adds tax only on taxable lines and the total is exactly subtotal plus tax", () => {
    const doc = build({
      taxRate: "8.25",
      lines: [
        line("Labor", "85", { quantity: "2", taxable: false }),
        line("Parts", "120.50"),
      ],
    });
    expect(doc.problems).toEqual([]);
    expect(doc.lines.map((l) => l.amountCents)).toEqual([17000, 12050]);
    expect(doc.subtotalCents).toBe(29050);
    // 12050 × 8.25% = 994.125 cents, rounded to the cent.
    expect(doc.taxCents).toBe(994);
    expect(doc.totalCents).toBe(30044);
    expect(doc.taxRateLabel).toBe("8.25%");
    expect(formatCents(doc.totalCents)).toBe("$300.44");
  });

  it("rounds a fractional quantity and a half-cent of tax half up", () => {
    // 2.5 × $19.99 = 4997.5 cents.
    expect(build({ lines: [line("Pipe", "19.99", { quantity: "2.5" })] }).lines[0]?.amountCents).toBe(4998);
    // 10% of 5 cents is half a cent.
    expect(build({ taxRate: "10", lines: [line("Washer", "0.05")] }).taxCents).toBe(1);
  });

  it("lets a discount line reduce the taxable amount, or not when it is marked untaxed", () => {
    const taxed = build({
      taxRate: "8",
      lines: [line("Repair", "200"), line("Loyalty discount", "-50")],
    });
    expect(taxed.subtotalCents).toBe(15000);
    expect(taxed.taxCents).toBe(1200);
    expect(taxed.totalCents).toBe(16200);

    const untaxed = build({
      taxRate: "8",
      lines: [line("Repair", "200"), line("Loyalty discount", "-50", { taxable: false })],
    });
    expect(untaxed.taxCents).toBe(1600);
    expect(untaxed.totalCents).toBe(16600);
  });

  it("prints no tax line when no rate is entered", () => {
    const doc = build({ lines: [line("Tune-up", "99")] });
    expect(doc.taxRateLabel).toBeNull();
    expect(doc.taxCents).toBe(0);
    expect(doc.totalCents).toBe(9900);
  });

  it("keeps the printed lines, tax and total in agreement across awkward values", () => {
    const rows: [string, string][] = [["3", "33.33"], ["0.333", "100"], ["7", "0.01"], ["12.5", "19.99"]];
    for (const [quantity, price] of rows) {
      const doc = build({ taxRate: "7.125", lines: [line("Item", price, { quantity })] });
      expect(doc.problems).toEqual([]);
      expect(doc.subtotalCents).toBe(doc.lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0));
      expect(doc.totalCents).toBe(doc.subtotalCents + doc.taxCents);
      expect(Number.isInteger(doc.totalCents)).toBe(true);
    }
  });
});

describe("what blocks printing", () => {
  it("asks for at least one line", () => {
    expect(build({ lines: [blankLine(), blankLine()] }).problems).toEqual(["Add at least one line to the document."]);
  });

  it("ignores untouched rows but names the row that is wrong", () => {
    const doc = build({
      lines: [blankLine(), line("", "50"), line("Valve", "", { quantity: "1" }), line("Hose", "10", { quantity: "0" }), line("Cap", "ten")],
    });
    expect(doc.lines).toEqual([]);
    expect(doc.problems).toEqual([
      "Line 2 has a price but no description.",
      "Line 3 needs a price. Enter 0 if it is included.",
      "Line 4 needs a quantity above zero.",
      "Line 5 has a price that isn't a dollar amount.",
    ]);
  });

  it("flags a bad tax rate, a bad validity and discounts larger than the work", () => {
    expect(build({ taxRate: "99", lines: [line("A", "1")] }).problems).toEqual(["The tax rate must be a number from 0 to 30."]);
    expect(build({ validDays: "999", lines: [line("A", "1")] }).problems).toEqual([
      '"Valid for" must be a whole number of days from 1 to 365.',
    ]);
    expect(build({ lines: [line("Work", "10"), line("Credit", "-25")] }).problems).toEqual([
      "The discounts are larger than the work. The total can't go below zero.",
    ]);
  });

  it("refuses a line that is too large to print exactly", () => {
    const doc = build({ lines: [line("Everything", "5000000", { quantity: "3" })] });
    expect(doc.problems).toEqual(["Line 1 is too large to print. Check the quantity and price."]);
  });

  it("clips an over-long description", () => {
    expect(build({ lines: [line("x".repeat(400), "1")] }).lines[0]?.description).toHaveLength(160);
  });
});

describe("the estimate document", () => {
  it("carries the validity date, terms and notes the owner wrote, and nothing they did not", () => {
    const doc = build({ validDays: "30", terms: "50% due on approval.", notes: "Replace the 40-gallon heater.", lines: [line("Heater", "1200")] });
    expect(doc.title).toBe("Estimate");
    expect(doc.number).toBe("EST-261027-1A2B");
    expect(doc.preparedOn).toBe("October 27, 2026");
    expect(doc.validUntil).toBe("November 26, 2026");
    expect(doc.terms).toBe("50% due on approval.");
    expect(doc.notes).toBe("Replace the 40-gallon heater.");
    expect(doc.business.name).toBe("Northside Plumbing");
    expect(doc.customer.name).toBe("Maria Lopez");

    const bare = build({ lines: [line("Heater", "1200")] });
    expect(bare.validUntil).toBeNull();
    expect(bare.terms).toBe("");
  });

  it("always shows prices, even when the crew-copy switch was left off", () => {
    const doc = build({ showPrices: false, lines: [line("Heater", "1200")] });
    expect(doc.showPrices).toBe(true);
    expect(doc.totalCents).toBe(120000);
  });
});

describe("the work order", () => {
  const workOrder = (over: Partial<DocumentFormState> = {}) =>
    build({ kind: "work_order", scheduledFor: "Wed, Oct 28 · 9:00 AM", assignedTo: "Sam", validDays: "30", terms: "Net 30", ...over });

  it("is a crew copy without prices by default and does not need any", () => {
    const doc = workOrder({ lines: [line("Replace anode rod", ""), line("Flush tank", "")] });
    expect(doc.problems).toEqual([]);
    expect(doc.title).toBe("Work order");
    expect(doc.number).toBe("WO-261027-1A2B");
    expect(doc.showPrices).toBe(false);
    expect(doc.totalCents).toBe(0);
    expect(doc.taxRateLabel).toBeNull();
    expect(doc.scheduledFor).toBe("Wed, Oct 28 · 9:00 AM");
    expect(doc.assignedTo).toBe("Sam");
  });

  it("never prints an estimate's validity or terms", () => {
    const doc = workOrder({ lines: [line("Flush tank", "")] });
    expect(doc.validUntil).toBeNull();
    expect(doc.terms).toBe("");
  });

  it("is not blocked by a tax rate it will not print, but prices are checked once shown", () => {
    expect(workOrder({ taxRate: "abc", lines: [line("Flush tank", "")] }).problems).toEqual([]);
    expect(workOrder({ showPrices: true, taxRate: "abc", lines: [line("Flush tank", "")] }).problems).toEqual([
      "Line 1 needs a price. Enter 0 if it is included.",
      "The tax rate must be a number from 0 to 30.",
    ]);
  });

  it("totals the priced copy the same way as an estimate", () => {
    const doc = workOrder({ showPrices: true, taxRate: "10", lines: [line("Part", "100")] });
    expect(doc.problems).toEqual([]);
    expect(doc.totalCents).toBe(11000);
  });
});

describe("the activity-feed line", () => {
  it("names the document and its total", () => {
    const doc = build({ taxRate: "10", lines: [line("A", "100"), line("B", "50")] });
    expect(documentLogBody(doc)).toBe("Estimate EST-261027-1A2B prepared, total $165.00 (2 lines).");
  });

  it("leaves the money out of a crew copy", () => {
    const doc = build({ kind: "work_order", lines: [line("Flush tank", "")] });
    expect(documentLogBody(doc)).toBe("Work order WO-261027-1A2B prepared (1 task).");
  });
});

describe("quote calculator choices", () => {
  it("reads the visitor's recorded answers and skips anything malformed", () => {
    const stored = [
      { question: "Heater type", answer: "Tankless", modifier: 400 },
      { question: "Add-on", answer: "Old unit removal", modifier: 150 },
      { question: "", answer: "blank question" },
      { question: "No answer" },
      "junk",
      null,
    ];
    const choices = quoteChoices(stored);
    expect(choices).toEqual([
      { question: "Heater type", answer: "Tankless" },
      { question: "Add-on", answer: "Old unit removal" },
    ]);
    expect(quoteChoicesText(choices)).toBe("Heater type: Tankless\nAdd-on: Old unit removal");
    expect(quoteChoices(null)).toEqual([]);
    expect(quoteChoices({})).toEqual([]);
  });
});

describe("remembered owner defaults", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it("round-trips the tax rate, validity and terms per workspace", () => {
    const storage = memory();
    saveDefaults("org-a", { taxRate: "8.25", validDays: "30", terms: "Net 15" }, storage);
    expect(loadDefaults("org-a", storage)).toEqual({ taxRate: "8.25", validDays: "30", terms: "Net 15" });
    expect(loadDefaults("org-b", storage)).toEqual(EMPTY_DEFAULTS);
  });

  it("falls back to blank on corrupt, missing or blocked storage and never throws", () => {
    const corrupt = { getItem: () => "{not json", setItem: () => undefined };
    expect(loadDefaults("org-a", corrupt)).toEqual(EMPTY_DEFAULTS);
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadDefaults("org-a", blocked)).toEqual(EMPTY_DEFAULTS);
    expect(() => saveDefaults("org-a", EMPTY_DEFAULTS, blocked)).not.toThrow();
    expect(loadDefaults(undefined, memory())).toEqual(EMPTY_DEFAULTS);
    expect(loadDefaults("org-a", null)).toEqual(EMPTY_DEFAULTS);
  });

  it("ignores stored values of the wrong type", () => {
    const storage = { getItem: () => JSON.stringify({ taxRate: 8.25, validDays: ["30"], terms: { a: 1 } }), setItem: () => undefined };
    expect(loadDefaults("org-a", storage)).toEqual(EMPTY_DEFAULTS);
  });
});

describe("starting a new document", () => {
  it("puts the service on the first line without pricing it, and applies the remembered terms", () => {
    const state = initialFormState({
      serviceName: "Water heater install",
      scheduledFor: "Wed, Oct 28 · 9:00 AM",
      assignedTo: "Sam",
      defaults: { taxRate: "8.25", validDays: "30", terms: "Net 15" },
    });
    expect(state.kind).toBe("estimate");
    expect(state.lines).toEqual([{ description: "Water heater install", quantity: "1", unitPrice: "", taxable: true }]);
    expect(state.taxRate).toBe("8.25");
    expect(state.terms).toBe("Net 15");
    expect(state.scheduledFor).toBe("Wed, Oct 28 · 9:00 AM");
    expect(state.showPrices).toBe(false);
  });

  it("starts with an empty line when the lead named no service", () => {
    const state = initialFormState({ serviceName: null, scheduledFor: "", assignedTo: "", defaults: EMPTY_DEFAULTS });
    expect(state.lines).toEqual([blankLine()]);
  });
});

describe("appointment and quote lookups", () => {
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString();

  it("picks the lead's soonest upcoming pending or confirmed appointment", () => {
    const appointments = [
      { lead_id: LEAD_ID, status: "confirmed", starts_at: at(30, 9) },
      { lead_id: LEAD_ID, status: "pending", starts_at: at(28, 9) },
      { lead_id: LEAD_ID, status: "cancelled", starts_at: at(27, 15) },
      { lead_id: LEAD_ID, status: "confirmed", starts_at: at(20, 9) },
      { lead_id: "someone-else", status: "confirmed", starts_at: at(27, 13) },
    ];
    expect(nextAppointmentLabel(LEAD_ID, appointments, NOW)).toBe("Wed, Oct 28 · 9:00 AM");
  });

  it("returns nothing when there is no upcoming appointment or the timestamp is unreadable", () => {
    expect(nextAppointmentLabel(LEAD_ID, [], NOW)).toBe("");
    expect(nextAppointmentLabel(LEAD_ID, [{ lead_id: LEAD_ID, status: "confirmed", starts_at: "garbage" }], NOW)).toBe("");
    expect(nextAppointmentLabel(LEAD_ID, [{ lead_id: LEAD_ID, status: "completed", starts_at: at(30, 9) }], NOW)).toBe("");
  });

  it("uses the lead's newest quote request and reads its choices safely", () => {
    const requests = [
      { lead_id: LEAD_ID, answers: [{ question: "Size", answer: "Small" }], estimate_min: 100, estimate_max: 150, created_at: "2026-10-01T10:00:00Z" },
      { lead_id: LEAD_ID, answers: [{ question: "Size", answer: "Large" }, "junk"], estimate_min: "900", estimate_max: 1300, created_at: "2026-10-20T10:00:00Z" },
      { lead_id: "other", answers: [], estimate_min: 1, estimate_max: 2, created_at: "2026-10-25T10:00:00Z" },
    ];
    expect(latestQuoteFor(LEAD_ID, requests)).toEqual({ min: 900, max: 1300, choices: [{ question: "Size", answer: "Large" }] });
    expect(latestQuoteFor("nobody", requests)).toBeNull();
  });
});

describe("the business's own address", () => {
  it("joins whichever parts the profile holds", () => {
    expect(businessAddress({ address: "123 Main St", city: "Austin", state: "TX", zip: "78701" })).toBe("123 Main St, Austin, TX 78701");
    expect(businessAddress({ city: "Austin", state: "TX" })).toBe("Austin, TX");
    expect(businessAddress({ address: " 9 Oak Ave ", zip: "10001" })).toBe("9 Oak Ave, 10001");
    expect(businessAddress({})).toBe("");
    expect(businessAddress(null)).toBe("");
  });
});
