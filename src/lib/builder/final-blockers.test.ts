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
    expect(src).toContain('.lt("created_at", since)');
  });

  it("the materializer does not impose picture treatment by slot", () => {
    const src = read("src/lib/site-materialize.server.ts");
    expect(src).not.toMatch(/asset\.slot === "hero" \? "(large|strong)"/);
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
