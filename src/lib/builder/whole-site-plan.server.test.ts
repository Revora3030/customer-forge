import { beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";
import type { AgentContext } from "@/lib/site-agent.server";

const { thinker } = vi.hoisted(() => ({ thinker: vi.fn() }));
vi.mock("@/lib/ai/thinker.server", () => ({ callBestThinker: thinker }));
import { planWebsiteChangesWithAi } from "./ai-agent-plan.server";

const home = "11111111-1111-4111-8111-111111111111";
const services = "22222222-2222-4222-8222-222222222222";
const hero = "33333333-3333-4333-8333-333333333333";
const offer = "44444444-4444-4444-8444-444444444444";
const context = {
  business: { name: "Elite", services: [], publishedReviewCount: 0 },
  pages: [
    { id: home, slug: "home", title: "Home", kind: "home", sections: [{ id: hero, kind: "hero", is_visible: true, components: [] }] },
    { id: services, slug: "services", title: "Services", kind: "custom", sections: [{ id: offer, kind: "services", is_visible: true, components: [] }] },
  ], sectionKinds: ["hero", "services"], pageKinds: ["home", "custom"], componentKinds: [],
} as unknown as AgentContext;
const answer = (data: unknown) => ({ ok: true, text: JSON.stringify(data), model: "mock-free", costMicrocents: 0 });
const plan = { scope: { breadth: "site", operation: "redesign" }, reply: "I will redesign all pages", actions: [{ type: "set_theme", patch: { primary_color: "#000000" } }] };

describe("real planner whole-site gate", () => {
  beforeEach(() => { isolateProviderEnvironment(); thinker.mockReset(); });
  it("rejects a theme-only whole-site rebuild after the same-request repair fails", async () => {
    thinker.mockResolvedValueOnce(answer(plan)).mockResolvedValueOnce(answer({ reject: [] })).mockResolvedValueOnce({ ok: false, reason: "capacity", detail: null });
    const result = await planWebsiteChangesWithAi({ organizationId: "test", instruction: "Rebuild every page", history: [], context, attachments: [] });
    expect(result).toMatchObject({ ok: false, reason: "incomplete_site" });
    expect(thinker).toHaveBeenCalledTimes(3);
    expect(thinker.mock.calls[2]?.[0].user).toContain(offer);
    expect(thinker.mock.calls[2]?.[0].user).toContain(hero);
  });
});