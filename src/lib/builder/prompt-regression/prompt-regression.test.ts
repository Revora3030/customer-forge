/**
 * Builder prompt regression suite (stubbed model, runs in CI).
 *
 * The builder's real prompt-building code runs against fixed, fictional
 * businesses; only the model is replaced by a deterministic stub, so nothing
 * here calls a model, spends money or needs a secret. What it protects:
 *  - the prompts themselves (file snapshots + a contract of must-keep rules),
 *  - the output checks (structure, no invented facts, phone-first, lead capture),
 *  - and that those checks really fail on bad output (negative tests).
 * To update on purpose, see docs/prompt-regression.md.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/thinker.server", async () => {
  const harness = await import("./thinker-route");
  return { callBestThinker: harness.routeThinker };
});
// The wording pass's telemetry-free path needs nothing else; guard the one console warning it may print.
vi.spyOn(console, "warn").mockImplementation(() => undefined);

import type { PageArchitecture } from "@/lib/builder/creative-authority";
import {
  contractProblems,
  inventedFactProblems,
  leadCaptureProblems,
  PROMPT_CONTRACT,
  phoneFirstProblems,
  structureProblems,
  wordingProblems,
  architectureText,
  patchText,
} from "./checks";
import { PROMPT_FIXTURES } from "./fixtures";
import { runFixture, type Run } from "./harness";
import { stubModel } from "./stub-model";

const runs = new Map<string, Run>();
async function run(id: string): Promise<Run> {
  const cached = runs.get(id);
  if (cached) return cached;
  const fixture = PROMPT_FIXTURES.find((entry) => entry.id === id)!;
  const result = await runFixture(fixture, stubModel);
  runs.set(id, result);
  return result;
}

describe("fixtures", () => {
  it("cover several trades with fictional contact details", () => {
    expect(new Set(PROMPT_FIXTURES.map((fixture) => fixture.industry)).size).toBeGreaterThanOrEqual(6);
    for (const fixture of PROMPT_FIXTURES) {
      expect(fixture.phone).toMatch(/\(555\) 010-\d{4}/);
      expect(fixture.email).toMatch(/example\.com$/);
    }
    expect(PROMPT_FIXTURES.some((fixture) => fixture.thin)).toBe(true);
  });
});

describe.each(PROMPT_FIXTURES.map((fixture) => [fixture.id, fixture] as const))("stubbed builder run: %s", (id, fixture) => {
  it("plans a site that passes the structure, phone-first and lead-capture checks", async () => {
    const result = await run(id);
    expect(result.architecture.skipped).toBeNull();
    const architecture = result.architecture.architecture!;
    expect(structureProblems(fixture, architecture)).toEqual([]);
    expect(phoneFirstProblems(fixture, architecture)).toEqual([]);
    expect(leadCaptureProblems(architecture)).toEqual([]);
  });

  it("invents no facts, prices or contact details in the plan or the wording", async () => {
    const result = await run(id);
    expect(inventedFactProblems(fixture, architectureText(result.architecture.architecture!))).toEqual([]);
    expect(inventedFactProblems(fixture, patchText(result.wording.patches))).toEqual([]);
  });

  it("fills every empty section body through the wording pass", async () => {
    const result = await run(id);
    expect(wordingProblems(fixture, result.sections, result.wording.patches)).toEqual([]);
  });

  it("keeps every must-have instruction in the prompts it sent", async () => {
    const result = await run(id);
    expect(contractProblems(result.calls, { thin: fixture.thin })).toEqual([]);
  });

  it("makes the same set of model calls every time", async () => {
    const result = await run(id);
    const counts = new Map<string, number>();
    for (const call of result.calls) counts.set(call.purpose, (counts.get(call.purpose) ?? 0) + 1);
    // Counted, not ordered: pages are worded concurrently, so only the totals are stable.
    expect([...counts].sort().map(([purpose, count]) => `${purpose} x${count}`).join("\n")).toMatchSnapshot();
  });
});

describe("prompt snapshots (a prompt edit shows up as a diff here)", () => {
  for (const id of ["plumber", "handyman-sparse"]) {
    it(`prompts for ${id}`, async () => {
      const result = await run(id);
      for (const kind of ["architect", "architectReview", "copy", "copyReview"] as const) {
        // The home page's calls: the wording pass runs one call per page, concurrently.
        const call = result.calls.find((entry) => entry.kind === kind && (kind.startsWith("copy") ? entry.user.includes('"page": "home"') : true))!;
        await expect(`### SYSTEM\n${call.system}\n\n### USER\n${call.user}\n`).toMatchFileSnapshot(`./snapshots/${id}.${kind}.txt`);
      }
    });
  }
});

describe("prompt contract", () => {
  it("lists rules that all reference real call kinds", () => {
    expect(PROMPT_CONTRACT.length).toBeGreaterThan(10);
    expect(new Set(PROMPT_CONTRACT.map((rule) => rule.id)).size).toBe(PROMPT_CONTRACT.length);
  });
  it("fails when a prompt drops a must-keep rule", async () => {
    const result = await run("plumber");
    const edited = result.calls.map((call) => (call.kind === "architect" ? { ...call, system: call.system.replace("Never invent facts", "Be creative") } : call));
    const problems = contractProblems(edited, { thin: false });
    expect(problems.some((problem) => problem.startsWith("architect-no-invention"))).toBe(true);
  });
  it("fails when a call is never made", async () => {
    const result = await run("plumber");
    const problems = contractProblems(result.calls.filter((call) => call.kind !== "copyReview"), { thin: false });
    expect(problems.some((problem) => problem.includes("copyReview"))).toBe(true);
  });
});

describe("the checks catch bad output (negative tests)", () => {
  const plumber = PROMPT_FIXTURES.find((fixture) => fixture.id === "plumber")!;
  it("flags an invented price, phone number, email and numbers", () => {
    const problems = inventedFactProblems(plumber, [
      "Drain cleaning from $49 this week",
      "Call (555) 999-1234 now",
      "Write to boss@made-up.test",
      "Serving over 5000 homes",
    ]);
    expect(problems.join("\n")).toMatch(/invented price "\$49"/);
    expect(problems.join("\n")).toMatch(/invented phone number/);
    expect(problems.join("\n")).toMatch(/invented email/);
    expect(problems.join("\n")).toMatch(/number "5000"/);
  });
  it("flags unsupported claims but allows ones the owner supplied", () => {
    const roofer = PROMPT_FIXTURES.find((fixture) => fixture.id === "roofer")!;
    expect(inventedFactProblems(plumber, ["Award-winning, fully licensed and insured, open 24/7"]).length).toBeGreaterThanOrEqual(3);
    expect(inventedFactProblems(roofer, [`${roofer.yearsInBusiness} years in business`])).toEqual([]);
  });
  it("accepts the supplied phone number in any format", () => {
    expect(inventedFactProblems(plumber, [`Call ${plumber.phone}`, "Call 555-010-0101", "tel 5550100101"])).toEqual([]);
  });
  it("flags a plan that is not phone-first or has no lead capture", async () => {
    const good = (await run("plumber")).architecture.architecture!;
    const stripped: PageArchitecture[] = good.map((page) => ({
      ...page,
      primaryAction: "Learn more",
      sections: page.sections.filter((section) => !["quote", "contact", "sticky_cta"].includes(section.role)).map((section) => ({ ...section, includes: [] })),
    }));
    expect(phoneFirstProblems(plumber, stripped).length).toBeGreaterThan(0);
    expect(leadCaptureProblems(stripped).length).toBeGreaterThan(0);
  });
  it("flags a plan with a missing home page, bad SEO and the business name in a heading", async () => {
    const good = (await run("plumber")).architecture.architecture!;
    expect(structureProblems(plumber, good.filter((page) => page.slug !== "home"))).toEqual(["no home page"]);
    const bad = good.map((page, index) =>
      index === 0
        ? { ...page, seoTitle: "x".repeat(70), sections: page.sections.map((section, i) => (i === 1 ? { ...section, heading: `${plumber.businessName} services` } : section)) }
        : page,
    );
    const problems = structureProblems(plumber, bad).join("\n");
    expect(problems).toMatch(/seoTitle is 70/);
    expect(problems).toMatch(/business name used in a section heading/);
  });
  it("flags wording that leaves a body empty or invents a price", async () => {
    const result = await run("plumber");
    const need = result.sections.find((section) => !["hero", "quote", "contact"].includes(section.kind) && !(section.body ?? "").trim());
    expect(need).toBeDefined();
    expect(wordingProblems(plumber, result.sections, []).length).toBeGreaterThan(0);
    expect(wordingProblems(plumber, result.sections, [{ id: need!.id, body: "Only $19 per drain" }]).join("\n")).toMatch(/invented price/);
  });
});
