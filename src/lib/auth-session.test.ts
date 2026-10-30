import { beforeEach, describe, expect, it, vi } from "vitest";
const fixtures = vi.hoisted(() => ({ membershipError: null as { message: string } | null, memberships: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => {
      const result = () => table === "memberships"
        ? { data: fixtures.memberships, error: fixtures.membershipError }
        : { data: [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        order: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  },
}));
import { resolvePostLoginPath } from "./auth-session";
beforeEach(() => {
  fixtures.membershipError = null;
  fixtures.memberships = [];
});
describe("post-login workspace lookup", () => {
  it("does not mistake a failed membership read for an absent workspace", async () => {
    fixtures.membershipError = { message: "unavailable" };
    await expect(resolvePostLoginPath()).rejects.toThrow("couldn't load your workspace");
  });
  it("routes a genuinely new account to the single /get-started door", async () => {
    expect(await resolvePostLoginPath()).toBe("/get-started");
  });
  it("never bounces a /get-started workspace into the onboarding wizard", async () => {
    fixtures.memberships = [{ organizations: { onboarding_completed: false } }];
    expect(await resolvePostLoginPath()).toBe("/app");
  });
  it("routes an existing completed workspace to its dashboard", async () => {
    fixtures.memberships = [{ organizations: { onboarding_completed: true } }];
    expect(await resolvePostLoginPath()).toBe("/app");
  });
});
describe("one onboarding door", () => {
  it("/app sends an account with no workspace to /get-started, not the wizard", async () => {
    const { readFileSync } = await import("node:fs");
    const app = readFileSync("src/routes/_authenticated/app.tsx", "utf8");
    expect(app).toContain('navigate({ to: "/get-started", replace: true })');
    expect(app).not.toContain('navigate({ to: "/onboarding"');
  });
  it("the wizard creates workspaces only through provisionWorkspace", async () => {
    const { readFileSync } = await import("node:fs");
    const onboarding = readFileSync("src/routes/_authenticated/onboarding.tsx", "utf8");
    expect(onboarding).toContain("await provisionWorkspace({");
    expect(onboarding).not.toMatch(/from\("organizations"\)\s*\.insert/);
    expect(onboarding).not.toMatch(/from\("memberships"\)\s*\.insert/);
  });
});
