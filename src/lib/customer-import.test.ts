import { describe, expect, it } from "vitest";
import { buildImport, detectMapping, importTags, parseCsv, parseVisitDate, phoneDigits, type ColumnMapping } from "./customer-import";

const NOW = new Date("2026-10-28T12:00:00Z");

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿Name,Notes\r\n"Lopez, Maria","said ""hi""\nthen left"\r\nSam,ok\r\n');
    expect(rows).toEqual([["Name", "Notes"], ["Lopez, Maria", 'said "hi"\nthen left'], ["Sam", "ok"]]);
  });
  it("detects semicolon and tab files and drops blank lines", () => {
    expect(parseCsv("a;b\n1;2\n\n3;4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("keeps a final row with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("detectMapping", () => {
  it("matches common export headers once each", () => {
    const m = detectMapping(["Customer Name", "E-mail", "Mobile Phone", "Last Service Date", "Street Address", "Notes"]);
    expect(m).toMatchObject({ name: 0, email: 1, phone: 2, lastVisit: 3, address: 4 });
  });
  it("matches an Email column and first/last names", () => {
    const m = detectMapping(["First Name", "Last Name", "Email", "Cell"]);
    expect(m).toMatchObject({ firstName: 0, lastName: 1, email: 2, phone: 3, name: -1 });
  });
});

describe("parseVisitDate", () => {
  it("reads ISO and US dates and refuses future, impossible or unreadable ones", () => {
    expect(parseVisitDate("2025-03-04", NOW)).toBe("2025-03-04T12:00:00.000Z");
    expect(parseVisitDate("3/4/2025", NOW)).toBe("2025-03-04T12:00:00.000Z");
    expect(parseVisitDate("3/4/25", NOW)).toBe("2025-03-04T12:00:00.000Z");
    for (const bad of ["2027-01-01", "2/30/2025", "13/1/2025", "yesterday", "", "1/1/1980"]) expect(parseVisitDate(bad, NOW)).toBeNull();
  });
});

describe("buildImport", () => {
  const mapping: ColumnMapping = { name: 0, firstName: -1, lastName: -1, email: 1, phone: 2, lastVisit: 3, address: 4 };
  const run = (rows: string[][], existing: { email: string | null; phone: string | null }[] = []) => buildImport({ rows, mapping, existing, now: NOW });

  it("keeps valid rows exactly as given and never invents a missing field", () => {
    const plan = run([["Maria Lopez", "Maria@Example.com", "(555) 010-0199", "3/4/2025", "12 Pipe St"], ["Sam", "", "555-010-0100", "", ""]]);
    expect(plan.ready).toEqual([
      { name: "Maria Lopez", email: "maria@example.com", phone: "(555) 010-0199", address: "12 Pipe St", last_appointment_at: "2025-03-04T12:00:00.000Z" },
      { name: "Sam", email: null, phone: "555-010-0100", address: null, last_appointment_at: null },
    ]);
  });
  it("skips rows with no name or no usable contact, saying which", () => {
    const plan = run([["", "a@b.co", "", "", ""], ["Bob", "not-an-email", "123", "", ""], ["Ann", "ann@b.co", "", "", ""]]);
    expect(plan.skipped).toEqual([{ line: 2, reason: "no_name" }, { line: 3, reason: "no_contact" }]);
    expect(plan.ready.map((r) => r.name)).toEqual(["Ann"]);
  });
  it("skips people already in the file or already customers, by email or phone digits", () => {
    const plan = run(
      [["A", "a@b.co", "", "", ""], ["A again", "A@B.co", "", "", ""], ["B", "", "1 (555) 010-0100", "", ""], ["C", "new@b.co", "", "", ""]],
      [{ email: null, phone: "555-010-0100" }],
    );
    expect(plan.skipped).toEqual([{ line: 3, reason: "duplicate_in_file" }, { line: 4, reason: "already_customer" }]);
    expect(plan.ready.map((r) => r.name)).toEqual(["A", "C"]);
  });
  it("imports a row whose date is unreadable but counts it", () => {
    const plan = run([["A", "a@b.co", "", "sometime", ""]]);
    expect(plan.ready[0]?.last_appointment_at).toBeNull();
    expect(plan.unreadableDates).toBe(1);
  });
  it("builds a name from first and last columns and stops at the row limit", () => {
    const m: ColumnMapping = { name: -1, firstName: 0, lastName: 1, email: 2, phone: -1, lastVisit: -1, address: -1 };
    expect(buildImport({ rows: [["Maria", "Lopez", "m@b.co"]], mapping: m, existing: [], now: NOW }).ready[0]?.name).toBe("Maria Lopez");
    const many = Array.from({ length: 1005 }, (_, i) => [`N${i}`, `n${i}@b.co`, "", "", ""]);
    const plan = run(many);
    expect(plan.ready).toHaveLength(1000);
    expect(plan.overLimit).toBe(5);
  });
  it("tags a batch with its date and never marks anyone as having agreed to contact", () => {
    expect(importTags(NOW)).toEqual(["Imported", "import:2026-10-28"]);
    expect(phoneDigits("+1 (555) 010-0199")).toBe("5550100199");
  });
});
