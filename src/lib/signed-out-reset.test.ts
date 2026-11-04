import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { resetSignedOutState } from "./signed-out-reset";

describe("resetSignedOutState", () => {
  it("drops the previous account's cached data, session policy and builder chat", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["workspace"], { organizationId: "org-a", role: "owner" });
    queryClient.setQueryData(["leads", "org-a"], [{ id: "lead-1", name: "Private customer" }]);
    const clearSessionPolicy = vi.fn();
    const clearCachedTurns = vi.fn();

    await resetSignedOutState({ queryClient, clearSessionPolicy, clearCachedTurns });

    expect(queryClient.getQueryData(["workspace"])).toBeUndefined();
    expect(queryClient.getQueryData(["leads", "org-a"])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(clearSessionPolicy).toHaveBeenCalledTimes(1);
    expect(clearCachedTurns).toHaveBeenCalledTimes(1);
  });

  it("cancels in-flight queries before clearing so a late response can't refill the cache", async () => {
    const order: string[] = [];
    const queryClient = {
      cancelQueries: vi.fn(async () => void order.push("cancel")),
      clear: vi.fn(() => void order.push("clear")),
    };
    await resetSignedOutState({
      queryClient,
      clearSessionPolicy: () => void order.push("policy"),
      clearCachedTurns: () => void order.push("turns"),
    });
    expect(order).toEqual(["cancel", "clear", "policy", "turns"]);
  });

  it("is safe to run twice (manual sign-out, then the SIGNED_OUT event)", async () => {
    const queryClient = new QueryClient();
    const clearSessionPolicy = vi.fn();
    await resetSignedOutState({ queryClient, clearSessionPolicy });
    await expect(resetSignedOutState({ queryClient, clearSessionPolicy })).resolves.toBeUndefined();
    expect(clearSessionPolicy).toHaveBeenCalledTimes(2);
  });

  it("keeps going and never throws when a step fails", async () => {
    const clear = vi.fn();
    const clearSessionPolicy = vi.fn(() => {
      throw new Error("storage blocked");
    });
    const clearCachedTurns = vi.fn(async () => {
      throw new Error("module failed to load");
    });
    await expect(
      resetSignedOutState({
        queryClient: { cancelQueries: vi.fn(async () => Promise.reject(new Error("abort"))), clear },
        clearSessionPolicy,
        clearCachedTurns,
      }),
    ).resolves.toBeUndefined();
    expect(clear).toHaveBeenCalled();
    expect(clearSessionPolicy).toHaveBeenCalled();
    expect(clearCachedTurns).toHaveBeenCalled();
  });
});

describe("every sign-out path uses the shared reset", () => {
  const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");

  it("the root auth listener resets on SIGNED_OUT (expiry, revoked token, other tab)", () => {
    const root = read("routes/__root.tsx");
    const branch = root.slice(root.indexOf('if (event === "SIGNED_OUT") {'));
    expect(branch.length).toBeLessThan(root.length);
    expect(branch.slice(0, 800)).toMatch(/resetSignedOutState\(\{[\s\S]*queryClient[\s\S]*clearSessionPolicy/);
  });

  it("useSignOut resets before signing out", () => {
    const src = read("lib/use-tenant.ts");
    const fn = src.slice(src.indexOf("export function useSignOut"));
    expect(fn.indexOf("resetSignedOutState(")).toBeGreaterThan(-1);
    expect(fn.indexOf("resetSignedOutState(")).toBeLessThan(fn.indexOf("supabase.auth.signOut("));
    expect(fn.slice(0, 400)).toContain("clearSessionPolicy");
  });

  it("the Settings sign-out goes through useSignOut", () => {
    const settings = read("routes/_authenticated/app.settings.tsx");
    expect(settings).not.toContain("supabase.auth.signOut(");
    expect(settings).toContain("useSignOut()");
  });
});
