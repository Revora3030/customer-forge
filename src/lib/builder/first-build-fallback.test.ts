import { beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";
import { type SectionCheckpoint, type SectionCheckpointStore } from "./first-build-section-checkpoints";

type Req = { user: string };
type Reply = { ok: true; model: string; costMicrocents: number; text: string } | { ok: false; reason: string; detail: string | null };
const state: { calls: string[]; handler: (req: Req) => Promise<Reply> | Reply } = {
  calls: [],
  handler: () => ({ ok: false, reason: "unset", detail: null }),
};

vi.mock("@/lib/ai/thinker.server", () => ({
  callBestThinker: vi.fn(async (req: Req) => {
    state.calls.push(req.user);
    return state.handler(req);
  }),
}));
vi.mock("@/lib/builder/review-panel.server", () => ({
  runAdvisoryPanel: vi.fn(async () => ({ notes: [], models: [], costMicrocents: 0, failed: [] })),
  runReviewPanel: vi.fn(async () => ({ notes: [], models: [], costMicrocents: 0, failed: [] })),
}));

const presentation = {
  title: "Plan your roof repair",
  actionLabel: "Send the roof details",
  successTitle: "Request received",
  successBody: "We will confirm the details with you.",
  theme: { surface: "#f4efe7", text: "#1f2937", muted: "#475569", border: "#64748b", action: "#0f766e", actionText: "#ffffff" },
};
const pictureTree = (ref: string) => ({ version: 1, root: { type: "stack", children: [
  { type: "media", mediaRef: ref, alt: "Roof repair work" },
  { type: "heading", level: 2, text: "Roof repair" },
] } });
const quoteTree = { version: 1, root: { type: "stack", children: [
  { type: "heading", level: 2, text: "Roof repair" },
  { type: "widget", text: "quote_calculator", widgetPresentation: presentation },
] } };
const plainTree = { version: 1, root: { type: "stack", children: [{ type: "heading", level: 2, text: "Questions" }] } };

/** Rows of one build attempt; a retry writes the same material under new ids. */
function rows(prefix: string) {
  return {
    website_sections: [
      { id: `${prefix}-s1`, page_id: `${prefix}-p`, kind: "services", heading: "x", subheading: null, body: null, settings: {} },
      { id: `${prefix}-s2`, page_id: `${prefix}-p`, kind: "faq", heading: "y", subheading: null, body: null, settings: {} },
      { id: `${prefix}-s3`, page_id: `${prefix}-p`, kind: "quote", heading: "z", subheading: null, body: null, settings: {} },
    ],
    website_components: [
      { id: prefix === "a" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222", section_id: `${prefix}-s1`, kind: "image", label: "Roof", body: null, media_url: "org/first-build-roof.png", link_url: null, link_label: null },
    ],
  };
}

function fakeDb(data: Record<string, unknown[]>, updates: unknown[] = []) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain["select"] = () => chain;
      chain["eq"] = () => chain;
      chain["order"] = () => chain;
      chain["range"] = (from: number, to: number) => Promise.resolve({ data: (data[table] ?? []).slice(from, to + 1), error: null });
      chain["update"] = (value: unknown) => {
        updates.push(value);
        let sectionId = "";
        const done = {
          eq: (key: string, value: string) => { if (key === "id") sectionId = value; return done; },
          select: async () => ({ data: [{ id: sectionId }], error: null }),
        };
        return done;
      };
      return chain;
    },
  };
}

function memoryStore(initial: unknown = null) {
  const saves: (SectionCheckpoint | null)[] = [];
  let value: unknown = initial;
  const store: SectionCheckpointStore = {
    load: async () => value,
    save: async (next) => {
      saves.push(next ? JSON.parse(JSON.stringify(next)) : null);
      value = next;
    },
  };
  return { store, saves, current: () => value };
}

async function compose(prefix: string, store: SectionCheckpointStore, lookSummary = "{\"concept\":\"slate\"}", extra: Record<string, unknown> = {}) {
  const { composeFirstBuildSections } = await import("./first-build-compositions.server");
  const updates: { kind?: string; settings?: unknown }[] = [];
  const result = await composeFirstBuildSections({
    db: fakeDb(rows(prefix), updates) as never,
    organizationId: "org",
    facts: { businessName: "Northline", services: ["Roof repair"] } as never,
    lookSummary,
    checkpoint: { jobId: "job-1", store },
    ...extra,
  });
  return { result, updates };
}

beforeEach(() => {
  isolateProviderEnvironment();
  state.calls = [];
});

describe("facts-only fallback when the AI design team is at capacity", () => {
  it("ships every section with a deterministic facts-only layout, flagged for an AI upgrade", async () => {
    state.handler = () => ({ ok: false, reason: "credits_exhausted", detail: "402 Payment Required" });
    const { result, updates } = await compose("a", memoryStore().store);
    expect(result.fallback ?? 0).toBe(0);
    expect(result.composed).toBe(3);
    expect(result.fallbackFilled).toBe(3);
    expect([...(result.fallbackSections ?? [])].sort()).toEqual(["a-s1", "a-s2", "a-s3"]);
    const saves = updates.filter((u) => u.kind === "composition");
    expect(saves).toHaveLength(3);
    for (const save of saves) {
      expect(save.settings).toMatchObject({ layoutSource: "fallback", needsAiUpgrade: true });
      expect(JSON.stringify(save.settings)).not.toMatch(/[$£€]\s?\d|\bstars?\b|★/);
    }
    // The owner's picture is shown, and the quote section keeps its working form.
    expect(JSON.stringify(saves)).toContain("11111111-1111-4111-8111-111111111111");
    expect(JSON.stringify(saves)).toContain("quote_calculator");
    // No AI polish round ran on the fallback sections.
    expect(state.calls.some((c) => /polish|craft bar/i.test(c) && !/SECTIONS? TO DESIGN/.test(c))).toBe(false);
  });

  it("does not fall back when the AI answered but the answer was unusable", async () => {
    state.handler = () => ({ ok: true, model: "sol", costMicrocents: 0, text: "not json" });
    const { result, updates } = await compose("a", memoryStore().store);
    expect(result.fallbackFilled ?? 0).toBe(0);
    expect(updates.some((u) => JSON.stringify(u.settings ?? {}).includes('"layoutSource":"fallback"'))).toBe(false);
  });
});
