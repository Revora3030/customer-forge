import { describe, expect, it } from "vitest";
import { findGlobalSeoFindings } from "./global-seo-intelligence";

describe("global SEO intelligence", () => {
  it("finds missing, duplicate and oversized metadata", () => {
    const context = { pages: [
      { id:"1", title:"Home", slug:"", kind:"home", is_visible:true, noindex:false, seo_title:"Same title", seo_description:null, sections:[] },
      { id:"2", title:"Services", slug:"services", kind:"services", is_visible:true, noindex:false, seo_title:"Same title", seo_description:"x".repeat(161), sections:[] }
    ] } as never;
    const findings = findGlobalSeoFindings(context);
    expect(findings.some((f) => f.kind === "missing_description")).toBe(true);
    expect(findings.some((f) => f.kind === "duplicate_title")).toBe(true);
    expect(findings.some((f) => f.kind === "description_length")).toBe(true);
  });
});
