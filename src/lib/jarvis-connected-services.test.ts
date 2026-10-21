import { describe, expect, it } from "vitest";
import { cleanDomain, connectedServicePath, parseSpreadsheetId, summarizeConnected } from "./jarvis-connected-services";

describe("jarvis connected services", () => {
  it("extracts spreadsheet IDs from URLs and rejects junk", () => {
    expect(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit")).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms");
    expect(parseSpreadsheetId("../etc/passwd")).toBeNull();
    expect(connectedServicePath("workspace.sheets.read", { query: "nope" })).toBeNull();
  });
  it("only accepts plain hostnames for DNS lookups", () => {
    expect(cleanDomain("https://RevoraGrowthSystems.com/about")).toBe("revoragrowthsystems.com");
    expect(cleanDomain("localhost")).toBeNull();
    expect(cleanDomain("a b.com")).toBeNull();
  });
  it("drops attendee details from calendar events", () => {
    const out = summarizeConnected("workspace.calendar.upcoming", { items: [{ summary: "Call", attendees: [{ email: "x@y.com" }], start: { dateTime: "2026-10-22T10:00:00Z" }, end: { dateTime: "2026-10-22T10:30:00Z" } }] });
    expect(JSON.stringify(out)).not.toContain("x@y.com");
  });
});
