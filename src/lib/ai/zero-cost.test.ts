/**
 * ZERO-COST MODE PROOF.
 *
 * These tests exist to guarantee the business promise: customers never need AI
 * credits or an API key, because core website building never contacts an
 * external model. They assert the block holds even when provider keys ARE
 * present — the strongest form of the guarantee — and that Revora's native
 * engine still builds a full website with every provider disabled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { readActions } from "@/lib/site-agent";
import { buildDeterministicPlan } from "@/lib/builder/deterministic";

const KEYS = ["ZERO_AI_COST_MODE", "GOOGLE_AI_API_KEY", "OPENAI_API_KEY"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
  vi.resetModules();
});

async function config() {
  vi.resetModules();
  return import("@/lib/ai/config");
}

describe("ZERO_AI_COST_MODE", () => {
  it("is the default when the variable is not set at all", async () => {
    delete process.env["ZERO_AI_COST_MODE"];
    const { zeroAiCostMode } = await config();
    expect(zeroAiCostMode()).toBe(true);
  });

  it("blocks Google even when a Google key is present", async () => {
    process.env["ZERO_AI_COST_MODE"] = "true";
    process.env["GOOGLE_AI_API_KEY"] = "test-google-key";
    const { providerChain, isAiConfigured, requireProviderChain } = await config();
    expect(providerChain()).toHaveLength(0);
    expect(isAiConfigured()).toBe(false);
    expect(() => requireProviderChain()).toThrow(/ZERO_AI_COST_MODE/);
  });

  it("blocks OpenAI even when an OpenAI key is present", async () => {
    process.env["ZERO_AI_COST_MODE"] = "true";
    process.env["OPENAI_API_KEY"] = "test-openai-key";
    const { providerChain, requireProviderChain } = await config();
    expect(providerChain()).toHaveLength(0);
    expect(() => requireProviderChain()).toThrow(/ZERO_AI_COST_MODE/);
  });

  it("blocks an unknown provider name outright", async () => {
    process.env["ZERO_AI_COST_MODE"] = "true";
    process.env["AI_DEFAULT_PROVIDER"] = "some-other-vendor";
    process.env["GOOGLE_AI_API_KEY"] = "test-google-key";
    const { providerChain } = await config();
    expect(providerChain()).toHaveLength(0);
    delete process.env["AI_DEFAULT_PROVIDER"];
  });

  it("only an explicit server-side opt-out re-enables optional providers", async () => {
    process.env["ZERO_AI_COST_MODE"] = "false";
    process.env["GOOGLE_AI_API_KEY"] = "test-google-key";
    const { providerChain, zeroAiCostMode } = await config();
    expect(zeroAiCostMode()).toBe(false);
    expect(providerChain().map((entry) => entry.name)).toContain("google");
  });

  it("carries a non-retryable category so nothing loops on it", async () => {
    process.env["ZERO_AI_COST_MODE"] = "true";
    const { requireProviderChain } = await config();
    try {
      requireProviderChain();
      expect.unreachable("should have thrown");
    } catch (error) {
      const failure = error as { category: string; retryable: boolean };
      expect(failure.category).toBe("zero_cost_mode");
      expect(failure.retryable).toBe(false);
    }
  });
});

/* ------------- the native engine, with every provider disabled ------------- */

const HOME = "33333333-3333-4333-8333-333333333333";
const HERO = "11111111-1111-4111-8111-111111111111";

function workspace(): AgentContext {
  return {
    business: {
      name: "Ridgeline Plumbing",
      industry: "Plumbing",
      tagline: null,
      description: "Repairs, installations and emergency call-outs.",
      city: "Denver",
      state: "CO",
      serviceArea: null,
      phone: "303 555 0142",
      email: null,
      yearsInBusiness: null,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      fontPreference: null,
      services: [
        { name: "Leak repair", price: null, startingPrice: null },
        { name: "Boiler installation", price: null, startingPrice: null },
        { name: "Drain clearing", price: null, startingPrice: null },
      ],
      publishedReviewCount: 0,
      photoCount: 0,
    },
    pages: [
      {
        id: HOME,
        slug: "/",
        title: "Home",
        kind: "home",
        is_visible: true,
        noindex: false,
        seo_title: null,
        seo_description: null,
        sections: [
          {
            id: HERO,
            kind: "hero",
            variant: "split",
            is_visible: true,
            heading: "Ridgeline Plumbing",
            subheading: null,
            body: null,
            sort_order: 0,
            components: [],
          },
        ],
      },
    ],
    sectionKinds: [
      "hero",
      "trust_bar",
      "intro",
      "services",
      "pricing",
      "quote",
      "booking",
      "reviews",
      "gallery",
      "faq",
      "guarantee",
      "offer",
      "cta",
      "sticky_cta",
      "area",
      "contact",
      "process",
      "benefits",
      "lead_magnet",
    ],
    pageKinds: ["home", "services", "about", "contact", "custom"],
    componentKinds: ["feature", "faq", "step", "button", "card", "link", "image"],
  };
}

describe("native engine with no AI keys at all", () => {
  beforeEach(() => {
    process.env["ZERO_AI_COST_MODE"] = "true";
    delete process.env["GOOGLE_AI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
  });

  it("passes the acceptance request end to end", () => {
    const plan = buildDeterministicPlan(
      workspace(),
      "Build me a professional modern plumbing company website with a home page, services page, about page, contact page, three services, strong call-to-action buttons, mobile optimization, and SEO.",
    );

    expect(plan.requiresExternalReasoning).toBe(false);
    expect(plan.actions.some((action) => action.type === "add_page")).toBe(true);
    expect(plan.actions.some((action) => action.type === "add_section")).toBe(true);
    expect(plan.actions.some((action) => action.type === "set_theme")).toBe(true);
    expect(plan.actions.some((action) => action.type === "set_page")).toBe(true);
    expect(plan.actions.some((action) => action.type === "add_component")).toBe(true);

    const validated = readActions(plan.actions, {
      pageIds: new Set([HOME]),
      sectionIds: new Set([HERO]),
      componentIds: new Set<string>(),
    });
    expect(validated.length).toBeGreaterThan(0);
  });

  it("executes a compound follow-up request", () => {
    const plan = buildDeterministicPlan(
      workspace(),
      "make the colors darker, make the hero bigger, add a phone call button and add a reviews section",
      { history: ["build me a plumbing website"] },
    );
    expect(plan.actions.some((action) => action.type === "set_theme")).toBe(true);
    expect(plan.actions.some((action) => action.type === "set_section_variant")).toBe(true);
    expect(
      plan.actions.some(
        (action) => action.type === "add_component" && action.link_url?.startsWith("tel:"),
      ),
    ).toBe(true);
    expect(
      plan.actions.some((action) => action.type === "add_section" && action.kind === "reviews"),
    ).toBe(true);
    expect(plan.requiresExternalReasoning).toBe(false);
  });

  it("never invents licences, ratings, awards or prices", () => {
    const plan = buildDeterministicPlan(workspace(), "build me a full professional website");
    const text = JSON.stringify(plan.actions).toLowerCase();
    expect(text).not.toMatch(
      /award|licen[cs]ed|insured|certified|\d(?:\.\d)? ?star|guarantee[ds]|\$\d|years in business/,
    );
  });

  it("uses only the workspace's own phone number for a call button", () => {
    const plan = buildDeterministicPlan(workspace(), "add a call button");
    const buttons = plan.actions.filter(
      (action) => action.type === "add_component" && action.kind === "button",
    );
    for (const button of buttons)
      if (button.type === "add_component" && button.link_url?.startsWith("tel:"))
        expect(button.link_url.replace(/\D/g, "")).toBe("3035550142");
  });
});
