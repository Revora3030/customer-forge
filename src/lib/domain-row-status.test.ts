import { describe, expect, it } from "vitest";
import { dnsRows, dnsRowStatus } from "@/lib/domain-setup";

const rows = dnsRows("acme.com", { apex: "lovable_verify=a", www: "lovable_verify=b" });
const byName = (type: string, name: string) => rows.find((r) => r.type === type && r.name === name)!;

describe("dnsRowStatus", () => {
  it("is 'unchecked' before any lookup was saved", () => {
    for (const row of rows) expect(dnsRowStatus(row, null).state).toBe("unchecked");
  });
  it("maps each record to its own lookup result", () => {
    const records = {
      a: ["1.2.3.4"],
      cname: [],
      aMatches: false,
      cnameMatches: false,
      wwwA: ["185.158.133.1"],
      wwwCname: [],
      wwwMatches: true,
      txt: ["lovable_verify=a"],
      txtVerified: true,
      wwwTxt: [],
      wwwTxtVerified: false,
    };
    expect(dnsRowStatus(byName("A", "@"), records)).toEqual({ state: "missing", found: ["1.2.3.4"] });
    expect(dnsRowStatus(byName("A", "www"), records).state).toBe("ok");
    expect(dnsRowStatus(byName("TXT", "_lovable"), records).state).toBe("ok");
    expect(dnsRowStatus(byName("TXT", "_lovable.www"), records)).toEqual({ state: "missing", found: [] });
  });
  it("treats a root CNAME (flattening) as a match and an unchecked www as unchecked", () => {
    const records = { a: [], cname: ["acme.lovable.app"], aMatches: false, cnameMatches: true, wwwMatches: null, wwwTxtVerified: null };
    expect(dnsRowStatus(byName("A", "@"), records).state).toBe("ok");
    expect(dnsRowStatus(byName("A", "www"), records).state).toBe("unchecked");
    expect(dnsRowStatus(byName("TXT", "_lovable.www"), records).state).toBe("unchecked");
  });
});
