import { describe, expect, it } from "vitest";
import { breakerScopeKey } from "./router.server";

describe("AI breaker isolation", () => {
  const base = {
    caller: { organizationId: "org-a", userId: "user-a", task: "visual-review" },
    provider: "google" as const,
    model: "model-a",
  };

  it("isolates one tenant from another tenant's provider failure", () => {
    expect(breakerScopeKey(base)).not.toBe(
      breakerScopeKey({ ...base, caller: { ...base.caller, organizationId: "org-b" } }),
    );
  });

  it("isolates sibling models and tasks on the same provider", () => {
    expect(breakerScopeKey(base)).not.toBe(breakerScopeKey({ ...base, model: "model-b" }));
    expect(breakerScopeKey(base)).not.toBe(
      breakerScopeKey({ ...base, caller: { ...base.caller, task: "translation" } }),
    );
  });

  it("uses the user identity when no workspace is present", () => {
    const userScoped = breakerScopeKey({
      ...base,
      caller: { organizationId: null, userId: "user-a", task: "diagnostic" },
    });
    expect(userScoped.startsWith("user-a\u001fdiagnostic")).toBe(true);
  });
});