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
  it("routes a genuinely new account to onboarding", async () => {
    expect(await resolvePostLoginPath()).toBe("/onboarding");
  });
  it("routes an existing completed workspace to its dashboard", async () => {
    fixtures.memberships = [{ organizations: { onboarding_completed: true } }];
    expect(await resolvePostLoginPath()).toBe("/app");
  });
});