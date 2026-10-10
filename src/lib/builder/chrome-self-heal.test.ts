import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeSiteChrome } from "./first-build-chrome.server";
import { readSiteChrome } from "./site-chrome";
import { callBestThinker } from "@/lib/ai/hall-of-fame.server";

vi.mock("@/lib/ai/hall-of-fame.server", () => ({ callBestThinker: vi.fn() }));
const header = { version: 1, root: { type: "row", children: [
  { type: "link", text: "Home", href: "/" }, { type: "button", text: "Contact", href: "/contact" },
] } };
const footer = { version: 1, root: { type: "stack", children: [
  { type: "link", text: "Home", href: "/" }, { type: "link", text: "Contact", href: "/contact" },
] } };

function store(generation: Record<string, unknown>, options: { conflict?: boolean; readError?: boolean } = {}) {
  let current = generation;
  let writes = 0;
  let raced = false;
  const db = {
    from(table: string) {
      let patch: { generation: Record<string, unknown> } | undefined;
      let expected: string | null | undefined;
      const chain = {
        select: () => patch ? Promise.resolve(save()) : chain,
        eq: (key: string, value: string) => { if (key === "generation") expected = value; return chain; },
        is: (_key: string, value: null) => { expected = value; return chain; },
        order: async () => ({ error: null, data: [
          { slug: "home", title: "Home", kind: "home" },
          { slug: "contact", title: "Contact", kind: "contact" },
          { slug: "hidden", title: "Private draft", kind: "page", is_visible: false },
        ] }),
        maybeSingle: async () => ({ data: { generation: current }, error: options.readError ? { message: "offline" } : null }),
        update: (value: typeof patch) => { patch = value; return chain; },
        upsert: () => { throw new Error("A repair must not blindly upsert settings"); },
      };
      function save() {
        expect(table).toBe("website_settings");
        if (options.conflict && !raced) {
          raced = true;
          current = { ...current, ownerEdit: "keep concurrent change" };
        }
        if (expected !== JSON.stringify(current)) return { data: [], error: null };
        current = patch!.generation;
        writes += 1;
        return { data: [{ organization_id: "org" }], error: null };
      }
      return chain;
    },
  };
  return { db: db as never, current: () => current, writes: () => writes };
}

const input = { organizationId: "org", businessName: "Acme", facts: {} as never, lookSummary: "Clean", primaryCta: "Contact", repairMissingOnly: true };
beforeEach(() => {
  vi.mocked(callBestThinker).mockReset();
  vi.mocked(callBestThinker).mockResolvedValue({ ok: true, text: JSON.stringify({ header, footer }), model: "test", costMicrocents: 0 } as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("missing-only navigation repair", () => {
  it("preserves the existing header and unrelated settings, even after a concurrent edit", async () => {
    const oldHeader = { ...header, root: { ...header.root, children: [{ type: "text", text: "Owner's design" }, ...header.root.children] } };
    const state = store({ chrome: { header: oldHeader }, brief: { approved: true } }, { conflict: true });
    await composeSiteChrome({ ...input, db: state.db });
    expect(readSiteChrome(state.current()).header?.root.children?.[0]?.text).toBe("Owner's design");
    expect(state.current()["brief"]).toEqual({ approved: true });
    expect(state.current()["ownerEdit"]).toBe("keep concurrent change");
    expect(readSiteChrome(state.current()).footer).toBeTruthy();
    expect(state.writes()).toBe(1);
    expect(vi.mocked(callBestThinker).mock.calls[0]?.[0].user).not.toContain("Private draft");
  });

  it("avoids paid work and all writes when both parts already exist", async () => {
    const state = store({ chrome: { header, footer } });
    expect(await composeSiteChrome({ ...input, db: state.db })).toEqual({ models: [], costMicrocents: 0 });
    expect(callBestThinker).not.toHaveBeenCalled();
    expect(state.writes()).toBe(0);
  });

  it("leaves prior settings untouched on provider failure", async () => {
    vi.stubEnv("CHROME_RETRY_PAUSE_MS", "0");
    vi.mocked(callBestThinker).mockResolvedValue({ ok: false, reason: "unavailable" } as never);
    const prior = { chrome: { header }, brief: { approved: true } };
    const state = store(prior);
    await expect(composeSiteChrome({ ...input, db: state.db })).rejects.toThrow();
    expect(state.current()).toEqual(prior);
    expect(state.writes()).toBe(0);
  });

  it("propagates cancellation into the provider and never saves afterward", async () => {
    const abort = new AbortController();
    const state = store({ chrome: { header } });
    vi.mocked(callBestThinker).mockImplementation(async request => {
      abort.abort();
      expect(request.signal?.aborted).toBe(true);
      return { ok: true, text: JSON.stringify({ header, footer }), model: "test", costMicrocents: 0 } as never;
    });
    await expect(composeSiteChrome({ ...input, db: state.db, signal: abort.signal })).rejects.toThrow();
    expect(state.writes()).toBe(0);
  });

  it("does not invent empty settings when the database cannot be read", async () => {
    const state = store({}, { readError: true });
    await expect(composeSiteChrome({ ...input, db: state.db })).rejects.toThrow("Couldn't read");
    expect(callBestThinker).not.toHaveBeenCalled();
    expect(state.writes()).toBe(0);
  });
});
