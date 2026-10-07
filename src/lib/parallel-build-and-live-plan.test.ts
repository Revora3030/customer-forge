import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { candidatePageInventory } from "@/lib/site-materialize.server";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("parallel first build", () => {
  const worker = read("src/lib/site-engine.worker.server.ts");
  it("starts the page architect BEFORE picture generation and hands it to materialize", () => {
    const plan = worker.indexOf("const architecturePlan");
    const pictures = worker.indexOf("const starterImages = await generateFirstBuildImages");
    expect(plan).toBeGreaterThan(0);
    expect(plan).toBeLessThan(pictures);
    expect(worker).toContain("architecture_: architecturePlan");
    expect(worker).toContain("architecturePlan?.catch(() => undefined)");
  });

  it("only spends the early architect call on builds that write pages", () => {
    expect(worker).toMatch(/architecturePlan[^=]*= firstBuild\s*\?/);
  });

  it("builds the architect's candidate pages from verified facts only", () => {
    const pages = candidatePageInventory(
      { businessName: "Acme", copy: { heroHeadline: "H", heroSubheadline: "S", about: "", areaCopy: "", primaryCta: "Book" } as never, services: [], hasBooking: true, hasQuoteForm: false },
      "Book",
    );
    expect(pages.map((page) => page.slug)).toContain("book");
    expect(JSON.stringify(pages)).not.toMatch(/award|certified|5-star|testimonial/i);
  });
});

describe("live plan in the chat", () => {
  it("records the AI's reply and each planned step as progress the chat shows", () => {
    const fns = read("src/lib/site-agent.functions.ts");
    expect(fns).toContain('noteStage(orgId, runId, "plan ready"');
    expect(fns).toContain("`step ${i + 1}: ${step.title}`");
    expect(read("src/components/app/BuilderAssistant.tsx")).toContain('step.stage === "plan ready" && step.detail');
  });
});
