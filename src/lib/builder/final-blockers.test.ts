import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("final blocker regressions", () => {
  it("visual measurement never uses eval (blocked by the site's security policy)", () => {
    const src = read("src/lib/builder/visual-measure.ts");
    expect(src).not.toMatch(/\.eval\b/);
    expect(src).not.toMatch(/new Function/);
    expect(src).toContain("JSON.parse(");
  });

  it("private preview links can open every page, not only home", () => {
    expect(read("src/routes/p.$token_.$page.tsx")).toContain('createFileRoute("/p/$token_/$page")');
    expect(read("src/lib/public-site.functions.ts")).toMatch(/pageSlug: page/);
  });

  it("first-build retry cleanup is fenced to rows the job wrote", () => {
    const src = read("src/lib/site-engine.worker.server.ts");
    expect(src).not.toMatch(/from\("website_(pages|sections|components)"\)\.delete\(\)\.eq\("organization_id", orgId\);/);
    expect(read("src/lib/site-materialize.server.ts")).toContain('db.rpc("clear_website_content", { p_org_id: orgId })');
    expect(src).toContain('buildState: "materializing"');
    expect(src).toContain('priorGeneration["jobId"] === job.id');
  });

  it("the materializer does not impose picture treatment by slot", () => {
    const src = read("src/lib/site-materialize.server.ts");
    expect(src).not.toMatch(/asset\.slot === "hero" \? "(large|strong)"/);
  });

  it("the materializer adds buttons and cards only when the AI asked, never by section name", () => {
    const src = read("src/lib/site-materialize.server.ts");
    expect(src).not.toMatch(/\/hero\|cta\|action\|conversion\/i\.test\(role\)/);
    expect(src).not.toMatch(/\/services\|offers\|solutions\/i\.test\(role\)/);
    expect(src).toContain('includes.includes("primary_action")');
    expect(src).toContain('includes.includes("service_cards")');
  });
});

import { normalizePageArchitecture } from "@/lib/builder/ai-page-architecture";
describe("AI-requested section material", () => {
  const candidate = [{ slug: "home", title: "Home", purpose: "p", primaryAction: "Call", sections: [{ role: "hero" }, { role: "services" }, { role: "contact" }] }];
  it("keeps only the includes the AI requested and drops unknown ones", () => {
    const out = normalizePageArchitecture({
      candidate,
      proposal: [{ slug: "home", sections: [{ role: "hero", includes: ["primary_action", "script"] }, { role: "services" }, { role: "contact" }] }] as never,
    });
    const sections = out!.architecture[0]!.sections;
    expect(sections[0]!.includes).toEqual(["primary_action"]);
    expect(sections[1]!.includes).toBeUndefined();
  });
});

import { PHONE_SAFETY_CSS } from "@/components/site/CompositionRenderer";
describe("phone safety safeguards", () => {
  it("enforces readable text, tap size and no overflow only on phones, without choosing design", () => {
    expect(PHONE_SAFETY_CSS).toContain("max(14px,1em)");
    expect(PHONE_SAFETY_CSS).toContain("min-height:44px");
    expect(PHONE_SAFETY_CSS).toContain("overflow-x:clip");
    expect(PHONE_SAFETY_CSS).not.toMatch(/color:|font-family|background/);
  });
});

describe("visual check false positives", () => {
  const src = read("src/lib/builder/visual.ts");
  const measure = read("src/lib/builder/visual-measure.ts");
  it("ignores hidden answers inside closed details and sticky chrome for overlap", () => {
    expect(src).toContain('details:not([open])');
    expect(src).toMatch(/pos === "sticky" \|\| pos === "fixed"/);
  });
  it("does not count its own resize reflow as visitor layout shift", () => {
    expect(measure).toMatch(/index > 0[\s\S]*__revoraCls = 0/);
  });
  it("phone safeguards outrank AI breakpoint rules regardless of stylesheet order", () => {
    // The shared sheet is hoisted to <head>; specificity (doubled attribute)
    // now guarantees the safeguards win over per-block [data-cn] rules.
    const src = read("src/components/site/CompositionRenderer.tsx");
    expect(src).toContain("[data-composition][data-composition] h1{font-size:min(2.75rem,11vw)!important");
    expect(src).toContain('precedence="rv-cn"');
  });
});

import { readFileSync as __readAttemptSrc } from "node:fs";
describe("build attempt fencing", () => {
  const src = __readAttemptSrc("src/lib/site-engine.worker.server.ts", "utf8");
  it("progress, completion and failure writes are fenced by attempt", () => {
    expect(src).toMatch(/\.eq\("attempts", job\.attempts\)\s*\.select\("id"\)/);
    expect(src).toMatch(/status: "completed"[\s\S]{0,400}\.eq\("attempts", job\.attempts\)/);
    // The update payload may carry a type cast (`}) as never,`); the attempt fence must still follow the id match.
    expect(src).toMatch(/lease_expires_at: null \}\)?(?: as never)?,\s*\)\s*\.eq\("id", job\.id\)\s*(?:\/\/[^\n]*\n\s*)+\.eq\("attempts", job\.attempts\)/);
  });
  it("a superseded attempt stops without requeuing or restoring", () => {
    expect(src).toContain("if (error instanceof StaleAttemptError) continue;");
  });
});
