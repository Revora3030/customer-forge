import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientBusinessCount, dedupeClients, isTestRecord, testReason, visibleClients } from "./admin-client-records";

const real = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  is_demo: false,
  is_customer: true,
  owner_name: "Owner",
  owner_email: `${id}@gmail.com`,
  ...extra,
});

// The eight rows the live audit saw: three real clients, QA/test records and a duplicate.
const audit = [
  real("a", "Elite Pressure Washing"),
  real("b", "Tidal Pressure Washing", { owner_email: "tidal@gmail.com", setup_paid_at: "2026-10-01", paid_total: 350 }),
  real("c", "Tidal Pressure Washing", { owner_email: "tidal@gmail.com" }),
  real("d", "Clean Slate Detailing"),
  real("e", "QA Test Business"),
  real("f", "Bigdawg Washing", { owner_email: "bigdawg09091@gmail.com" }),
  real("g", "Danay's Salon", { owner_email: "danaysiaingram42@gmail.com" }),
  real("h", "Internal Build", { is_customer: false }),
];

describe("test records are left out by default", () => {
  it("flags demo, staff-only, confirmed test accounts and QA/test naming, with the reason", () => {
    expect(testReason(real("x", "Anything", { is_demo: true }))).toBe("demo");
    expect(testReason(real("x", "Anything", { is_customer: false }))).toBe("staff_only");
    expect(testReason(real("x", "Anything", { owner_email: "BigDawg09091@gmail.com" }))).toBe("test_account");
    expect(testReason(real("x", "Anything", { owner_email: "danaysiaingram42@gmail.com" }))).toBe("test_account");
    expect(testReason(real("x", "QA Test Business"))).toBe("test_name");
    expect(testReason(real("x", "Acme", { slug: "acme-test" }))).toBe("test_name");
    expect(testReason(real("x", "Acme", { owner_email: "someone@example.com" }))).toBe("test_email");
  });

  it("keeps real businesses, including names that only contain a test-like fragment", () => {
    for (const name of ["Elite Pressure Washing", "Contest Prep Tutoring", "Greatest Lawn Care", "Qatar Imports"]) {
      expect(isTestRecord(real("x", name)), name).toBe(false);
    }
  });
});

describe("duplicate businesses show once", () => {
  it("merges the same business and owner into one row, keeping the fullest copy and deleting nothing", () => {
    const rows = dedupeClients([audit[2]!, audit[1]!]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("b");
    expect(rows[0]!.duplicate_ids).toEqual(["c"]);
  });

  it("merges when one copy has no owner email, but not different owners with the same name", () => {
    expect(dedupeClients([real("1", "Tidal Pressure Washing", { owner_email: null }), real("2", "Tidal Pressure Washing")])).toHaveLength(1);
    expect(dedupeClients([real("1", "Tidal Pressure Washing"), real("2", "Tidal Pressure Washing")])).toHaveLength(2);
  });

  it("ignores case, punctuation and LLC when matching names, and keeps the original order", () => {
    const rows = dedupeClients([real("1", "Alpha Co", { owner_email: "o@x.com" }), real("2", "Zed"), real("3", "ALPHA, LLC", { owner_email: "o@x.com" })]);
    expect(rows.map((r) => r.id)).toEqual(["1", "2"]);
  });
});

describe("the count and the list agree", () => {
  it("shows 3 clients and 3 rows by default for the audited account", () => {
    const rows = visibleClients(audit);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "d"]);
    expect(clientBusinessCount(audit)).toBe(rows.length);
    expect(rows.filter((r) => r.name === "Tidal Pressure Washing")).toHaveLength(1);
  });

  it("'Show test records' brings the QA/test rows back, still without duplicates", () => {
    const rows = visibleClients(audit, true);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "d", "e", "f", "g", "h"]);
  });
});

describe("wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  it("the metric uses the same helper as the lists", () => {
    expect(read("src/lib/admin.functions.ts")).toContain("clients: clientBusinessCount(records)");
    expect(read("src/routes/_authenticated/admin.index.tsx")).toContain("visibleClients(clients.data ?? [], showTest)");
    expect(read("src/routes/_authenticated/admin.clients.tsx")).toContain("visibleClients(clients.data ?? [], showTest)");
  });
  it("both pages have the Show test records toggle", () => {
    expect(read("src/routes/_authenticated/admin.index.tsx")).toContain("<ShowTestRecordsToggle");
    expect(read("src/routes/_authenticated/admin.clients.tsx")).toContain("<ShowTestRecordsToggle");
    expect(read("src/components/admin/ShowTestRecordsToggle.tsx")).toContain("Show test records");
  });
});
