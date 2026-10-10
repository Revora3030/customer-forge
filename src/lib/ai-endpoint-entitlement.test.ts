import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the handlers with an authenticated context, without issuing an HTTP
// request or bypassing the real role checks inside the handler.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    // TanStack's compiler supplies (RPC, handler) in SSR builds; untransformed
    // code supplies (handler). Always execute the actual final handler.
    const chain = { middleware: () => chain, validator: () => chain, handler: (...args: unknown[]) => args.at(-1) };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/entitlement.server", () => ({ assertOrgEntitled: vi.fn(async () => { throw new Error("Workspace subscription is inactive"); }) }));

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const endpoints = [
  ["suggestions", "ai-suggestions", "getAiSuggestions"],
  ["studio generation", "image-studio", "generateStudioImage"],
  ["studio editing", "image-studio", "editStudioImage"],
  ["image regeneration", "image-records", "regenerateImage"],
  ["site restyle", "site-restyle", "restyleSiteWithAi"],
  ["video generation", "site-video", "generateSectionVideo"],
  ["site redesign", "site-upgrade", "applySiteWideRedesign"],
  ["screenshot review", "site-upgrade", "reviewPageScreenshot"],
  ["menu repair", "site-upgrade", "designSiteChrome"],
  ["brief analysis", "site-engine", "analyzeSiteBrief"],
  ["reference extraction", "site-engine", "extractScreenshotReference"],
  ["live AI diagnostic", "site-engine", "runSiteEngineCheck"],
] as const;

async function loadHandler(moduleName: string, exportName: string) {
  // TanStack's ordinary SSR import replaces handlers with RPC facades whose
  // manifest is absent in Vitest. Its lookup view retains the implementation,
  // so this unit test executes the real handler, not a copied access check.
  const path = `./${moduleName}.functions.ts?server-fn-module-lookup`;
  const module = await import(/* @vite-ignore */ path);
  return module[exportName] as (input: unknown) => Promise<unknown>;
}

function membershipClient(role = "manager") {
  const from = vi.fn((table: string) => {
    if (table !== "memberships") throw new Error(`Unexpected ${table} access before entitlement`);
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { role }, error: null }) };
    return query;
  });
  return { from };
}

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No external call is allowed"); })); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("billable AI endpoint access", () => {
  it.each(endpoints)("%s rejects inactive access before provider or draft writes", async (_name, moduleName, exportName) => {
    const handler = await loadHandler(moduleName, exportName);
    const supabase = membershipClient();
    await expect(handler({ data: { organizationId: orgId }, context: { supabase, userId } }))
      .rejects.toThrow("Workspace subscription is inactive");
    const { assertOrgEntitled } = await import("./entitlement.server");
    expect(assertOrgEntitled).toHaveBeenCalledWith(supabase, orgId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not let a viewer generate paid video even with workspace read access", async () => {
    const handler = await loadHandler("site-video", "generateSectionVideo");
    await expect(handler({ data: { organizationId: orgId }, context: { supabase: membershipClient("viewer"), userId } }))
      .rejects.toThrow("permission");
    const { assertOrgEntitled } = await import("./entitlement.server");
    expect(assertOrgEntitled).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
