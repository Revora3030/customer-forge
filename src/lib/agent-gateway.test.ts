import { describe, expect, it } from "vitest";
import { agentKeyMatches, agentProspectBatchSchema, prospectsToCsv, MAX_PROSPECTS_PER_CALL } from "./agent-gateway";
import { readImport, normalizeLeadRow } from "./prospect-lead-import";

const lead = { business_name: "Apex Plumbing", city: "Durham", state: "NC", trade: "plumber" };

describe("agent gateway", () => {
  it("rejects a public email sent without the page it came from", () => {
    const r = agentProspectBatchSchema.safeParse({ prospects: [{ ...lead, verified_email: "a@apex.com" }] });
    expect(r.success).toBe(false);
  });

  it("accepts a public email with its source page", () => {
    const r = agentProspectBatchSchema.safeParse({ prospects: [{ ...lead, verified_email: "a@apex.com", source_url: "https://apex.com/contact" }] });
    expect(r.success).toBe(true);
  });

  it(`caps a call at ${MAX_PROSPECTS_PER_CALL} leads`, () => {
    const r = agentProspectBatchSchema.safeParse({ prospects: Array.from({ length: MAX_PROSPECTS_PER_CALL + 1 }, () => lead) });
    expect(r.success).toBe(false);
  });

  it("keeps the city and trade that were sent", () => {
    const parsed = readImport(prospectsToCsv([{ ...lead, city: "Tampa", trade: "roofing", website: "https://apexroof.com" }]));
    if (!parsed.ok) throw new Error(parsed.message);
    const row = normalizeLeadRow(parsed.rows[0], parsed.fields, { category: null });
    if ("reason" in row) throw new Error(row.reason);
    expect(row.lead.city).toBe("Tampa");
    expect(row.lead.category).toBe("roofing");
  });

  it("only accepts the exact configured key", () => {
    const key = "k".repeat(32);
    expect(agentKeyMatches(key, key)).toBe(true);
    expect(agentKeyMatches(key + "x", key)).toBe(false);
    expect(agentKeyMatches(null, key)).toBe(false);
    expect(agentKeyMatches(key, undefined)).toBe(false);
  });
});
