import { describe, expect, it } from "vitest";
import { dependencyList, extractReadableText, summarizeObservatory, summarizeOsv, summarizeRdap, summarizeW3c, summarizeWayback } from "./jarvis-free-checks";

describe("jarvis free checks", () => {
  it("counts W3C errors separately from warnings", () => {
    const s = summarizeW3c({ messages: [{ type: "error", message: "Bad" }, { type: "info", subType: "warning" }] });
    expect(s.errorCount).toBe(1);
    expect(s.warningCount).toBe(1);
  });
  it("reduces version ranges and skips non-versions", () => {
    expect(dependencyList({ a: "^1.2.3", b: "workspace:*" })).toEqual([{ name: "a", version: "1.2.3" }]);
  });
  it("lists only packages with advisories", () => {
    const deps = [{ name: "a", version: "1.0.0" }, { name: "b", version: "2.0.0" }];
    const s = summarizeOsv({ results: [{}, { vulns: [{ id: "GHSA-1" }] }] }, deps);
    expect(s.vulnerablePackages).toEqual([{ name: "b", version: "2.0.0", advisories: ["GHSA-1"] }]);
  });
  it("returns null when Observatory gives no grade", () => {
    expect(summarizeObservatory({ error: "x" })).toBeNull();
  });
  it("reads registrar and expiry from RDAP", () => {
    const s = summarizeRdap({ ldhName: "EX.COM", events: [{ eventAction: "expiration", eventDate: "2027-01-01" }], entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "Reg Inc"]]] }] });
    expect(s).toMatchObject({ domain: "ex.com", registrar: "Reg Inc", expires: "2027-01-01" });
  });
  it("reports no archive when snapshots are absent", () => {
    expect(summarizeWayback({}, {}).archived).toBe(false);
  });
  it("drops scripts and navigation from page text", () => {
    const r = extractReadableText("<title>T</title><nav>Menu</nav><main><p>Hello</p><script>evil()</script></main>");
    expect(r.text).toBe("Hello");
  });
});
