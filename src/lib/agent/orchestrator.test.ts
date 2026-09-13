import { describe, expect, it, vi } from "vitest";
import { capabilityBrief, CAPABILITIES } from "@/lib/agent/capabilities";
import {
  workspaceSummary,
  getWorkspaceContext,
  invalidateWorkspaceContext,
} from "@/lib/agent/workspace-context.server";
import { orchestrate, planningBrief } from "@/lib/agent/orchestrator.server";
import { understandWithoutModel } from "@/lib/agent/understanding.server";
import { designWithoutModel } from "@/lib/agent/design-brief.server";
import { CRITIQUE_DIMENSIONS } from "@/lib/agent/critique.server";

import type { AgentContext } from "@/lib/site-agent.server";
import type { Understanding } from "@/lib/agent/understanding.server";

const context: AgentContext = {
  business: {
    name: "Ridge Plumbing",
    industry: "plumbing",
    tagline: null,
    description: null,
    city: "Leeds",
    state: null,
    serviceArea: null,
    phone: null,
    email: null,
    yearsInBusiness: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    fontPreference: null,
    services: [{ name: "Boiler repair", price: null, startingPrice: null }],
    publishedReviewCount: 0,
    photoCount: 2,
  },
  pages: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "",
      title: "Home",
      kind: "home",
      is_visible: true,
      noindex: false,
      seo_title: null,
      seo_description: null,
      sections: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          kind: "hero",
          variant: "default",
          is_visible: true,
          heading: "We fix boilers",
          subheading: null,
          body: null,
          sort_order: 0,
          components: [],
        },
      ],
    },
  ],
  sectionKinds: ["hero", "services", "reviews"],
  pageKinds: ["home", "about"],
  componentKinds: ["feature"],
};

describe("agent capability registry", () => {
  it("only advertises capabilities that carry real guidance", () => {
    for (const capability of CAPABILITIES) {
      expect(capability.guidance.length).toBeGreaterThan(30);
      if (capability.handoff) expect(capability.handoff.route.startsWith("/")).toBe(true);
    }
  });

  it("falls back to baseline capabilities rather than returning nothing", () => {
    expect(capabilityBrief([]).guidance.length).toBeGreaterThan(0);
    expect(capabilityBrief(["seo"]).guidance.join(" ")).toMatch(/search/i);
    expect(capabilityBrief(["capture"]).handoffs.length).toBe(1);
  });
});

describe("workspace context", () => {
  it("summarises the workspace without dumping every word on the site", () => {
    const summary = workspaceSummary(context);
    expect(summary).toMatch(/Ridge Plumbing/);
    expect(summary).toMatch(/hero/);
    expect(summary.length).toBeLessThan(6001);
  });

  it("reuses a fresh picture and drops it when the site is written to", async () => {
    const org = "33333333-3333-4333-8333-333333333333";
    invalidateWorkspaceContext(org);
    const load = vi.fn(async () => context);
    const first = await getWorkspaceContext(org, load);
    const second = await getWorkspaceContext(org, load);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);

    invalidateWorkspaceContext(org);
    const third = await getWorkspaceContext(org, load);
    expect(third.cached).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("planning brief", () => {
  it("hands the planner the request, the reading and the requirements", () => {
    const brief = planningBrief("make the homepage feel expensive", {
      goal: "A more premium homepage",
      requirements: ["Stronger hero hierarchy", "Clear single call to action"],
      capabilities: ["design", "copy", "cta"],
      tasks: [
        { title: "Restyle the hero", brief: "tighten hierarchy", capabilities: ["design"] },
        { title: "Sharpen the CTA", brief: "one obvious action", capabilities: ["cta"] },
      ],
      complexity: "complex",
      question: null,
      source: "model",
    });
    expect(brief).toMatch(/make the homepage feel expensive/);
    expect(brief).toMatch(/Stronger hero hierarchy/);
    expect(brief).toMatch(/DO ALL OF THESE/);
    expect(brief).toMatch(/never ask the owner to name a section/i);
    expect(brief).toMatch(/Do not ask any questions/);
  });
});

describe("orchestrator pipeline", () => {
  const understanding: { complex: Understanding } = {
    complex: {
      goal: "A more premium homepage",
      requirements: ["Stronger hero hierarchy", "Clear single call to action"],
      capabilities: ["design"],
      tasks: [
        { title: "a", brief: "b", capabilities: ["design"] },
        { title: "c", brief: "d", capabilities: ["cta"] },
      ],
      complexity: "complex",
      question: null,
      source: "model",
    },
  };

  const understand = async () => understanding.complex;

  // The design and grading stages are stubbed here so the pipeline is tested,
  // not the gateway. `strongCritique` keeps the auto-fix pass out of the way;
  // the auto-fix test below supplies a weak grade on purpose.
  const design = async () => designWithoutModel("roofing");
  const grade =
    (overall: number, fixes: string[] = []) =>
    async () => ({
      scores: Object.fromEntries(CRITIQUE_DIMENSIONS.map((d) => [d, overall])) as Record<
        (typeof CRITIQUE_DIMENSIONS)[number],
        number
      >,
      overall,
      fixes,
      verdict: "Reviewed",
      source: "model" as const,
    });
  const critique = grade(9);

  it("merges the review pass, never repeating an identical action", async () => {
    const first = {
      reply: "Here we go",
      summary: "Premium homepage",
      actions: [{ type: "set_theme", patch: { primary_color: "#101014" } }],
      questions: [],
      notes: [],
    };
    const second = {
      reply: "Finished",
      actions: [
        { type: "set_theme", patch: { primary_color: "#101014" } },
        { type: "set_section_effect", sectionId: "x", effect: "rise" },
      ],
      missing: [],
      notes: ["Left your prices alone"],
    };
    const plan = vi
      .fn()
      .mockResolvedValueOnce(first as Record<string, unknown>)
      .mockResolvedValueOnce(second as Record<string, unknown>);

    const result = await orchestrate({
      context,
      workspaceSummary: workspaceSummary(context),
      instruction: "make the homepage feel expensive",
      history: [],
      attachments: [],
      plan,
      understand,
      design,
      critique,
    });

    expect(plan).toHaveBeenCalledTimes(2);
    expect((result.raw["actions"] as unknown[]).length).toBe(2);
    expect(result.trace.some((line) => /Review/i.test(line))).toBe(true);
    expect(result.requirements.every((requirement) => requirement.covered)).toBe(true);
  });

  it("reports an unmet requirement as still open instead of claiming success", async () => {
    const plan = vi
      .fn()
      .mockResolvedValueOnce({
        reply: "Starting",
        actions: [{ type: "set_section_text", sectionId: "x", field: "heading", value: "Hi" }],
        questions: [],
        notes: [],
      } as Record<string, unknown>)
      .mockResolvedValueOnce({
        reply: "Partly done",
        actions: [],
        missing: ["Clear single call to action"],
        notes: [],
      } as Record<string, unknown>);

    const result = await orchestrate({
      context,
      workspaceSummary: "",
      instruction: "make the homepage convert better",
      history: [],
      attachments: [],
      plan,
      understand,
      design,
      critique,
    });

    const open = result.requirements.find((r) => r.label === "Clear single call to action");
    expect(open?.covered).toBe(false);
    expect((result.raw["notes"] as string[]).join(" ")).toMatch(/Still open/);
  });

  it("keeps the first plan when the review pass fails", async () => {
    const plan = vi
      .fn()
      .mockResolvedValueOnce({
        reply: "Here we go",
        actions: [{ type: "set_backdrop", backdrop: "aurora" }],
        questions: [],
        notes: [],
      } as Record<string, unknown>)
      .mockRejectedValueOnce(new Error("gateway down"));

    const result = await orchestrate({
      context,
      workspaceSummary: "",
      instruction: "make it feel like Apple",
      history: [],
      attachments: [],
      plan,
      understand,
      design,
      critique,
    });
    expect((result.raw["actions"] as unknown[]).length).toBe(1);
    expect(result.trace.join(" ")).toMatch(/first drafted/);
  });

  it("carries the design direction into the planning brief", async () => {
    const plan = vi.fn().mockResolvedValue({
      reply: "Done",
      actions: [{ type: "set_backdrop", backdrop: "aurora" }],
      questions: [],
      notes: [],
    } as Record<string, unknown>);

    const result = await orchestrate({
      context,
      workspaceSummary: "",
      instruction: "make my website amazing",
      history: [],
      attachments: [],
      plan,
      understand,
      design,
      critique,
    });

    const brief = String(plan.mock.calls[0]?.[1] ?? "");
    expect(brief).toMatch(/THE DESIGN DIRECTION/);
    expect(brief).toMatch(/must NOT look like/);
    expect(result.design.story.length).toBeGreaterThan(0);
    expect(result.critique?.overall).toBe(9);
  });

  it("improves its own plan when it grades itself below the professional bar", async () => {
    const plan = vi
      .fn()
      .mockResolvedValueOnce({
        reply: "First pass",
        actions: [{ type: "set_backdrop", backdrop: "aurora" }],
        questions: [],
        notes: [],
      } as Record<string, unknown>)
      .mockResolvedValueOnce({
        reply: "Reviewed",
        actions: [],
        missing: [],
        notes: [],
      } as Record<string, unknown>)
      .mockResolvedValueOnce({
        reply: "Raised",
        actions: [{ type: "set_section_effect", sectionId: "x", effect: "rise" }],
        notes: [],
      } as Record<string, unknown>);

    const result = await orchestrate({
      context,
      workspaceSummary: "",
      instruction: "make my homepage amazing",
      history: [],
      attachments: [],
      plan,
      understand,
      design,
      critique: grade(5, ["Give the hero a real headline about the outcome"]),
    });

    expect(plan).toHaveBeenCalledTimes(3);
    expect((result.raw["actions"] as unknown[]).length).toBe(2);
    expect(result.trace.join(" ")).toMatch(/Raised it itself/);
  });

  it("does not grade or improve a simple request", async () => {
    const plan = vi.fn().mockResolvedValue({
      reply: "Done",
      actions: [{ type: "set_backdrop", backdrop: "aurora" }],
      questions: [],
      notes: [],
    } as Record<string, unknown>);

    const result = await orchestrate({
      context,
      workspaceSummary: "",
      instruction: "change my phone number",
      history: [],
      attachments: [],
      plan,
      understand: async () => ({ ...understanding.complex, complexity: "simple" as const }),
      design,
      critique,
    });

    expect(plan).toHaveBeenCalledTimes(1);
    expect(result.critique).toBeNull();
  });
});

describe("deterministic fallback understanding", () => {
  it("never rejects a request and never demands Revora vocabulary", () => {
    for (const text of ["make this look expensive", "fix whatever is broken", "asdkjh"]) {
      const understanding = understandWithoutModel(text);
      expect(understanding.capabilities.length).toBeGreaterThan(0);
      expect(understanding.tasks.length).toBeGreaterThan(0);
      expect(understanding.source).toBe("fallback");
    }
  });
});
