import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fallbackDecision } from "@/lib/builder/conversation.server";

describe("builder chat when the AI team can't decide", () => {
  it("answers greetings instead of running the redesign planner", () => {
    expect(fallbackDecision("hi").mode).toBe("answer");
    expect(fallbackDecision("Thanks!").mode).toBe("answer");
  });
  it("answers questions honestly", () => {
    const decision = fallbackDecision("how much does it cost per month?");
    expect(decision.mode).toBe("answer");
  });
  it("still sends clear edit requests to the planner", () => {
    expect(fallbackDecision("make the headline bigger").mode).toBe("change");
    expect(fallbackDecision("add a reviews section").mode).toBe("change");
    expect(fallbackDecision("do it").mode).toBe("change");
  });
});

describe("customer lead forms", () => {
  const forms = readFileSync("src/components/site/SiteForms.tsx", "utf8");
  it("refuse to send a request the business could never reply to", () => {
    expect(forms).toMatch(/function contactProblem/);
    expect((forms.match(/const problem = contactProblem\(/g) ?? []).length).toBe(2);
  });
  it("fill name, phone and email from the visitor's phone autofill", () => {
    expect(forms).toMatch(/autoComplete="tel" inputMode="tel"/);
    expect(forms).toMatch(/autoComplete="email" inputMode="email"/);
  });
});

describe("builder requests", () => {
  it("offer Retry when planning a request fails", () => {
    const hooks = readFileSync("src/lib/builder-requests.hooks.ts", "utf8");
    expect(hooks).toMatch(/state: "failed",\n\s*error: message,\n\s*retryable: true,/);
  });
});
