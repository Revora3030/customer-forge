import { beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";
import {
  inputDigest,
  readSectionCheckpoint,
  remapMediaRefs,
  type SectionCheckpoint,
  type SectionCheckpointStore,
} from "./first-build-section-checkpoints";

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

/** Answers every design, rescue and repair call with valid trees for the ids it names. */
function designAll(mediaRef: string) {
  return (req: Req): Reply => {
    const ids = [...req.user.matchAll(/"sectionId": "([^"]+)"/g)].map((m) => m[1]!);
    const sections = Object.fromEntries(ids.map((id) => [id, id.endsWith("s1") ? pictureTree(mediaRef) : id.endsWith("s3") ? quoteTree : plainTree]));
    return { ok: true, model: "sol", costMicrocents: 1, text: JSON.stringify({ sections }) };
  };
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

describe("section checkpoint helpers", () => {
  it("digests ignore key order and change with content", () => {
    expect(inputDigest({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(inputDigest({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(inputDigest({ a: 1 })).not.toBe(inputDigest({ a: 2 }));
  });

  it("discards a checkpoint from another job or other inputs, keeps only planned sections", () => {
    const stored = { version: 1, jobId: "job-1", digest: "d", sections: { k1: { tree: { root: {} }, media: {}, at: "" }, gone: { tree: { root: {} }, media: {}, at: "" } }, updatedAt: "" };
    expect(readSectionCheckpoint(stored, { jobId: "job-2", digest: "d", sectionDigests: ["k1"] }).discarded).toBe(true);
    expect(readSectionCheckpoint(stored, { jobId: "job-1", digest: "other", sectionDigests: ["k1"] }).discarded).toBe(true);
    const kept = readSectionCheckpoint(stored, { jobId: "job-1", digest: "d", sectionDigests: ["k1"] });
    expect(kept.discarded).toBe(false);
    expect([...kept.entries.keys()]).toEqual(["k1"]);
    expect(readSectionCheckpoint(null, { jobId: "job-1", digest: "d", sectionDigests: [] }).discarded).toBe(false);
  });

  it("remaps media refs by stored path and refuses a tree whose picture is gone", () => {
    const tree = { root: { type: "media", mediaRef: "old", children: [{ type: "text", text: "old words stay" }] } };
    expect(remapMediaRefs(tree, { old: "org/a.png" }, new Map([["org/a.png", "new"]]))).toEqual({
      root: { type: "media", mediaRef: "new", children: [{ type: "text", text: "old words stay" }] },
    });
    expect(remapMediaRefs(tree, { old: "org/a.png" }, new Map())).toBeNull();
  });
});

describe("composeFirstBuildSections checkpoints", () => {
  it("checkpoints accepted chunks, and a retry of the same job skips them", async () => {
    const first = memoryStore();
    state.handler = designAll("11111111-1111-4111-8111-111111111111");
    const run1 = await compose("a", first.store);
    expect(run1.result.composed).toBe(3);
    expect(first.saves.length).toBeGreaterThan(0);
    const saved = first.current() as SectionCheckpoint;
    expect(saved.jobId).toBe("job-1");
    expect(Object.keys(saved.sections)).toHaveLength(3);

    // The retry rematerializes the same material under new row ids. Every AI
    // call now fails, so any section it had to design again would be missing.
    state.calls = [];
    state.handler = () => ({ ok: true, model: "sol", costMicrocents: 0, text: "not json" });
    const retry = memoryStore(saved);
    const run2 = await compose("b", retry.store);
    expect(run2.result.resumed).toBe(3);
    expect(run2.result.fallback).toBe(0);
    expect(run2.result.composed).toBe(3);
    expect(state.calls.filter((c) => c.includes("SECTIONS TO DESIGN") || c.includes("SECTION TO DESIGN"))).toHaveLength(0);
    // The restored picture points at the retry's own component id.
    const pictureSave = JSON.stringify(run2.updates.find((u) => JSON.stringify(u).includes("first-build") || JSON.stringify(u).includes("2222")));
    expect(pictureSave).toContain("22222222-2222-4222-8222-222222222222");
    expect(pictureSave).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("composes only the sections missing from the checkpoint", async () => {
    const first = memoryStore();
    state.handler = designAll("11111111-1111-4111-8111-111111111111");
    await compose("a", first.store);
    const saved = first.current() as SectionCheckpoint;
    const keys = Object.keys(saved.sections);
    delete saved.sections[keys[1]!];

    state.calls = [];
    state.handler = designAll("22222222-2222-4222-8222-222222222222");
    const run2 = await compose("b", memoryStore(saved).store);
    expect(run2.result.resumed).toBe(2);
    const design = state.calls.filter((c) => c.includes("SECTIONS TO DESIGN"));
    expect(design).toHaveLength(1);
    expect(design[0]).toContain('"sectionId": "b-s2"');
    expect(design[0]).not.toContain('"sectionId": "b-s1"');
    expect(design[0]).not.toContain('"sectionId": "b-s3"');
  });

  it("discards the checkpoint when the build's inputs changed", async () => {
    const first = memoryStore();
    state.handler = designAll("11111111-1111-4111-8111-111111111111");
    await compose("a", first.store);
    const saved = first.current();

    state.calls = [];
    state.handler = designAll("22222222-2222-4222-8222-222222222222");
    const retry = memoryStore(saved);
    const run2 = await compose("b", retry.store, "{\"concept\":\"a different authored look\"}");
    expect(run2.result.resumed ?? 0).toBe(0);
    expect(retry.saves[0]).toBeNull();
    expect(state.calls.filter((c) => c.includes("SECTIONS TO DESIGN"))).toHaveLength(3);
    expect((retry.current() as SectionCheckpoint).digest).not.toBe((saved as SectionCheckpoint).digest);
  });
});

describe("composeFirstBuildSections repair and rescue bounds", () => {
  it("repairs an unreadable answer once with the exact parse error and the bad output", async () => {
    let n = 0;
    const good = designAll("11111111-1111-4111-8111-111111111111");
    state.handler = (req) => {
      n += 1;
      return n === 1 ? { ok: true, model: "sol", costMicrocents: 0, text: "{\"sections\": {\"a-s1\": {\"version\": 1,, }" } : good(req);
    };
    const { result } = await compose("a", memoryStore().store);
    expect(result.composed).toBe(3);
    expect(result.outputRepairs).toBe(1);
    const repair = state.calls.find((c) => c.includes("EXACT VALIDATOR ERRORS"));
    expect(repair).toContain("EXACT VALIDATOR ERRORS");
    expect(repair).toContain("invalid JSON");
    expect(repair).toContain('{"sections": {"a-s1": {"version": 1,, }');
    expect(state.calls.filter((c) => c.includes("SECTIONS TO DESIGN"))).toHaveLength(3);
  });

  it("bounds rescue to four rounds with at most two calls in flight, and repairs each section once", async () => {
    let inFlight = 0;
    let peak = 0;
    state.handler = async (req) => {
      const rescue = req.user.includes("SECTION TO DESIGN (material only)");
      if (rescue) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      }
      return { ok: true, model: "sol", costMicrocents: 0, text: JSON.stringify({ sections: { x: { version: 1, root: { type: "banana" } } } }) };
    };
    const { result } = await compose("a", memoryStore().store);
    expect(result.fallback).toBe(3);
    const rescueCalls = state.calls.filter((c) => c.includes("SECTION TO DESIGN (material only)"));
    expect(rescueCalls).toHaveLength(3 * 4);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2);
    // One targeted repair for the first failed batch covers all three sections.
    expect(state.calls.filter((c) => c.includes("EXACT VALIDATOR ERRORS"))).toHaveLength(3);
    expect(result.outputRepairs).toBe(3);
  });
});
