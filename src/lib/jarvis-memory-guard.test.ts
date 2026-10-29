import { beforeEach, describe, expect, it, vi } from "vitest";

const saveJarvisMemory = vi.fn(async () => ({ saved: true }));
vi.mock("./jarvis-memory.server", () => ({
  parseMemoryKind: (kind: unknown) => String(kind),
  parseMemoryContent: (content: unknown) => String(content),
  saveJarvisMemory: (...args: unknown[]) => (saveJarvisMemory as (...a: unknown[]) => unknown)(...args),
}));
vi.mock("./integrations/research.server", () => ({ searchWeb: vi.fn(async () => ({ results: [] })) }));

import { readsUntrustedText, type ReadAction } from "./jarvis-actions";
import { runReadActions } from "./jarvis-agent.server";

const save: ReadAction = { id: "memory.save", kind: "note", content: "Prefers short answers" };
const search: ReadAction = { id: "web.search", query: "mobile detailing raleigh" };
const db = {} as never;

describe("reads that bring in outside text", () => {
  it("flags web, listing, inbox, site-check and demo-name reads, and not the owner's own data or code", () => {
    for (const read of [
      search,
      { id: "prospects.find", niche: "a", city: "b", state: null },
      { id: "prospect.lookup", input: "x" },
      { id: "diagnostic.run", toolId: "website.text.extract" },
      { id: "inbox.list" },
      { id: "demos.list" },
      { id: "demo.status", organizationId: null, name: "x" },
      { id: "artifacts.list" },
    ] satisfies ReadAction[]) {
      expect(readsUntrustedText([read]), read.id).toBe(true);
    }
    for (const read of [
      { id: "memory.list" },
      { id: "routines.list" },
      { id: "code.read", paths: ["src/a.ts"], line: 1 },
      { id: "code.search", query: "x" },
      { id: "engine.today" },
      { id: "autopilot.status" },
      save,
    ] satisfies ReadAction[]) {
      expect(readsUntrustedText([read]), read.id).toBe(false);
    }
  });
});

describe("memory.save after outside text", () => {
  beforeEach(() => saveJarvisMemory.mockClear());

  it("still saves what the owner asked for in a clean turn", async () => {
    const [result] = await runReadActions(db, [save], "owner");
    expect(result).toMatchObject({ ok: true });
    expect(saveJarvisMemory).toHaveBeenCalledTimes(1);
  });

  it("skips it when an earlier round of the turn read outside text, and says how to save it", async () => {
    const [result] = await runReadActions(db, [save], "owner", true);
    expect(result).toMatchObject({ ok: false });
    expect(result!.result).toContain("Not saved");
    expect(result!.result).toContain("plain message");
    expect(saveJarvisMemory).not.toHaveBeenCalled();
  });

  it("skips it when the same round also reads outside text, whichever order they come in", async () => {
    for (const reads of [[search, save], [save, search]]) {
      const results = await runReadActions(db, reads, "owner");
      expect(results.find((r) => r.label.startsWith("Remembered"))).toMatchObject({ ok: false });
    }
    expect(saveJarvisMemory).not.toHaveBeenCalled();
  });

  it("never blocks the outside-text read itself", async () => {
    const [result] = await runReadActions(db, [search], "owner", true);
    expect(result).toMatchObject({ ok: true });
  });
});
