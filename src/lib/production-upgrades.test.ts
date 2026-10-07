/**
 * Coverage for the production-upgrade commits in this PR:
 *  - build failure classification (spec C)
 *  - CRM five-stage pipeline read model (spec G)
 *  - single analytics taxonomy (spec I)
 *  - AI team authority + no-silent-fallback policy (spec B)
 *  - runbooks for provider / payment / domain / stuck-build incidents (spec L)
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILD_FAILURE_KINDS,
  classifyBuildFailure,
  readFailureKind,
  tagFailureMessage,
  untaggedMessage,
} from "@/lib/builder/build-failure";
import { CRM_STAGES, crmStageOf, statusForCrmStage, LEAD_STATUSES } from "@/lib/domain";
import {
  EVENT_TAXONOMY,
  FUNNEL,
  eventIdempotencyKey,
  isNonProductionTraffic,
  isServerConfirmed,
} from "@/lib/analytics-taxonomy";
import { AI_TEAM, chooseFallback } from "@/lib/ai/team-roles";

describe("build failure classification", () => {
  it("covers exactly the nine spec failure kinds", () => {
    expect([...BUILD_FAILURE_KINDS].sort()).toEqual(
      ["content", "image", "infrastructure", "intake_validation", "preview", "provider", "publish", "rendering", "validation"].sort(),
    );
  });

  it("classifies provider statuses before message text", () => {
    expect(classifyBuildFailure(new Error("copy failed"), 429).kind).toBe("provider");
    expect(classifyBuildFailure(new Error("x"), 503).kind).toBe("provider");
    expect(classifyBuildFailure(new Error("x"), 402)).toMatchObject({ kind: "provider", retryable: false });
  });

  it("classifies by message", () => {
    expect(classifyBuildFailure(new Error("Revora still needs: phone number.")).kind).toBe("intake_validation");
    expect(classifyBuildFailure(new Error("Hero image generation failed")).kind).toBe("image");
    expect(classifyBuildFailure(new Error("Composition could not be materialized")).kind).toBe("rendering");
    expect(classifyBuildFailure(new Error("Broken link to /pricing")).kind).toBe("validation");
    expect(classifyBuildFailure(new Error("Copy contained an unsupported claim")).kind).toBe("content");
    expect(classifyBuildFailure(new Error("fetch failed")).kind).toBe("infrastructure");
    expect(classifyBuildFailure("something odd").kind).toBe("infrastructure");
  });

  it("does not retry intake validation, and gives owners plain messages", () => {
    const intake = classifyBuildFailure(new Error("Revora still needs: email."));
    expect(intake.retryable).toBe(false);
    expect(intake.ownerMessage).toMatch(/press Build again/);
    expect(classifyBuildFailure(new Error("fetch failed")).retryable).toBe(true);
  });

  it("round-trips a stable tag on the stored message", () => {
    const tagged = tagFailureMessage("image", "Hero failed");
    expect(tagged).toBe("[image] Hero failed");
    expect(tagFailureMessage("content", tagged)).toBe("[content] Hero failed");
    expect(readFailureKind(tagged)).toBe("image");
    expect(readFailureKind("plain message")).toBeNull();
    expect(readFailureKind("[nonsense] x")).toBeNull();
    expect(untaggedMessage(tagged)).toBe("Hero failed");
  });

  it("is wired into the worker's generic failure path", () => {
    const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
    expect(worker).toContain("classifyBuildFailure(error, status)");
    expect(worker).toContain("error_message: taggedMessage");
    expect(worker).toContain("attempts >= MAX_ATTEMPTS || !failure.retryable");
  });
});

describe("CRM five-stage pipeline", () => {
  it("is New → Contacted → Quoted → Won → Closed", () => {
    expect(CRM_STAGES.map((s) => s.label)).toEqual(["New", "Contacted", "Quoted", "Won", "Closed"]);
  });

  it("maps every stored lead status to exactly one stage", () => {
    const covered = CRM_STAGES.flatMap((s) => [...s.statuses]);
    expect([...covered].sort()).toEqual(LEAD_STATUSES.map((s) => s.value).sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("reads and writes stages without inventing statuses", () => {
    expect(crmStageOf("qualified")).toBe("contacted");
    expect(crmStageOf("booked")).toBe("won");
    expect(crmStageOf("completed")).toBe("won");
    expect(crmStageOf("lost")).toBe("closed");
    expect(crmStageOf(null)).toBe("new");
    expect(statusForCrmStage("won")).toBe("booked");
    expect(statusForCrmStage("closed")).toBe("lost");
  });
});

describe("analytics taxonomy", () => {
  it("defines the nine-step business funnel in order", () => {
    expect(FUNNEL.map((e) => e.event)).toEqual([
      "landing_view",
      "account_created",
      "trial_started",
      "trial_active",
      "checkout_started",
      "setup_payment_completed",
      "subscription_active",
      "site_published",
      "lead_created",
    ]);
  });

  it("has one entry per event", () => {
    const names = EVENT_TAXONOMY.map((e) => e.event);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only counts server-confirmed events as business outcomes", () => {
    expect(isServerConfirmed("setup_payment_completed")).toBe(true);
    expect(isServerConfirmed("lead_created")).toBe(true);
    expect(isServerConfirmed("checkout_return")).toBe(false);
    expect(isServerConfirmed("checkout_completed")).toBe(false);
    expect(isServerConfirmed("unknown_event")).toBe(false);
    for (const step of FUNNEL.slice(1)) expect(step.source).toBe("server");
  });

  it("builds stable idempotency keys", () => {
    expect(eventIdempotencyKey("lead_created", "lead-1")).toBe("lead_created:per_record:lead-1");
    expect(eventIdempotencyKey("setup_payment_completed", "evt_1")).toBe("setup_payment_completed:per_provider_event:evt_1");
    expect(eventIdempotencyKey("lead_created", "lead-1")).toBe(eventIdempotencyKey("lead_created", "lead-1"));
  });

  it("keeps preview and dev traffic out of customer analytics", () => {
    expect(isNonProductionTraffic("localhost")).toBe(true);
    expect(isNonProductionTraffic("127.0.0.1")).toBe(true);
    expect(isNonProductionTraffic("id-preview--abc.lovable.app")).toBe(true);
    expect(isNonProductionTraffic("revoragrowthsystems.com", "/draft/acme")).toBe(true);
    expect(isNonProductionTraffic("revoragrowthsystems.com", "/p/token123")).toBe(true);
    expect(isNonProductionTraffic("revoragrowthsystems.com", "/s/acme")).toBe(false);
    expect(isNonProductionTraffic("www.acme-plumbing.com", "/")).toBe(false);
  });
});

describe("AI team authority and fallback policy", () => {
  it("names Sol as final creative authority and Terra/Luna as reviewers", () => {
    expect(AI_TEAM.sol.owns).toContain("visual composition");
    expect(AI_TEAM.terra.owns).toContain("accessibility");
    expect(AI_TEAM.luna.owns).toContain("truthfulness");
    expect(AI_TEAM.sora.when).toBe("motion_improves_experience");
  });

  const base = { capabilities: ["critique", "qa", "accessibility", "vision"] as const, available: true, paid: false, verified: true };

  it("never silently falls back to an unverified, unavailable, paid or under-capable model", () => {
    const decision = chooseFallback(
      "terra",
      [
        { ...base, model: "unverified", verified: false },
        { ...base, model: "down", available: false },
        { ...base, model: "paid", paid: true },
        { ...base, model: "textonly", capabilities: ["critique", "qa"] },
      ],
      { freeOnly: true, failedModel: "primary", failureReason: "timeout" },
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.reason).toMatch(/no verified, available fallback/);
      expect(decision.reason).toMatch(/unverified/);
      expect(decision.reason).toMatch(/paid on a free-only lane/);
      expect(decision.reason).toMatch(/textonly: lacks accessibility, vision/);
    }
  });

  it("picks the first verified, available, capable candidate and explains why", () => {
    const decision = chooseFallback(
      "terra",
      [{ ...base, model: "primary" }, { ...base, model: "good" }],
      { freeOnly: true, failedModel: "primary", failureReason: "429" },
    );
    expect(decision).toMatchObject({ ok: true, model: "good" });
    if (decision.ok) expect(decision.reason).toMatch(/primary failed \(429\)/);
  });
});

describe("operations runbooks", () => {
  it("covers provider outage, payment failure, domain/SSL and stuck builds", () => {
    const path = "docs/runbooks/provider-payment-domain-build-incidents.md";
    expect(existsSync(path)).toBe(true);
    const doc = readFileSync(path, "utf8");
    for (const heading of ["AI provider outage", "Payment / webhook failure", "Custom domain / SSL", "Stuck or failing first builds"]) {
      expect(doc).toContain(heading);
    }
    expect(doc).toContain("$350 setup, 3-day full access, first month free, $100/month");
  });
});
