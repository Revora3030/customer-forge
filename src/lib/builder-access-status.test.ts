import { describe, expect, it } from "vitest";
import { builderAccessView, type BuilderAccessStatus } from "./builder-access-status";
const base = { signedIn: true, hasWorkspace: true, checking: false, failed: false };
const allowed: BuilderAccessStatus = { allowed: true, canManage: true, state: "ACTIVE_SUBSCRIPTION", reason: "active" };

describe("honest builder access presentation", () => {
  it("does not claim ready while checking or when the check failed", () => {
    expect(builderAccessView({ ...base, checking: true, access: allowed }).state).toBe("checking");
    expect(builderAccessView({ ...base, failed: true, access: allowed }).state).toBe("error");
    expect(builderAccessView(base).state).toBe("checking");
  });
  it.each(["EXPIRED", "CANCELED"])("directs a verified %s block to billing", (state) => {
    const view = builderAccessView({ ...base, access: { ...allowed, allowed: false, state } });
    expect(view).toMatchObject({ state: "blocked", action: { href: "/app/billing" } });
  });
  it("does not treat suspension or an unknown block as a payment remedy", () => {
    for (const state of ["SUSPENDED", "UNKNOWN"]) {
      const view = builderAccessView({ ...base, access: { ...allowed, allowed: false, state } });
      expect(view.state).toBe("blocked");
      expect(view.action).toBeUndefined();
    }
  });
  it("preserves read-only membership and server-authorized grace access", () => {
    expect(builderAccessView({ ...base, access: { ...allowed, canManage: false } }).state).toBe("readonly");
    expect(builderAccessView({ ...base, access: { ...allowed, state: "PAST_DUE" } }).state).toBe("ready");
    expect(builderAccessView({ ...base, access: allowed }).title).toBe("Editing access verified");
  });
  it("does not interpret a stale allowed result as sign-in or workspace authorization", () => {
    expect(builderAccessView({ ...base, signedIn: false, access: allowed }).action?.href).toBe("/auth");
    expect(builderAccessView({ ...base, hasWorkspace: false, access: allowed }).action?.href).toBe("/app");
  });
});
