import { describe, expect, it } from "vitest";
import {
  WORKSPACE_KEY, arrangeConversations, cleanWorkspace, conversationMarkdown, exportFilename, folderNames, isPinned,
  loadAllPages, parseFolderName, readWorkspace, setFolder, togglePin, writeWorkspace, MAX_PINS,
} from "./jarvis-conversation-workspace";

const A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const C = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const list = [{ id: A, title: "a" }, { id: B, title: "b" }, { id: C, title: "c" }];

function memory() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

describe("JC-43 conversation workspace", () => {
  it("pins float to the top, most recently pinned first, rest keep server order", () => {
    let ws = cleanWorkspace(null);
    ws = togglePin(ws, C);
    ws = togglePin(ws, B);
    expect(arrangeConversations(list, ws).map((c) => c.id)).toEqual([B, C, A]);
    ws = togglePin(ws, B);
    expect(isPinned(ws, B)).toBe(false);
    expect(arrangeConversations(list, ws).map((c) => c.id)).toEqual([C, A, B]);
  });

  it("caps pins", () => {
    const ws = { pins: Array.from({ length: MAX_PINS }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`), folders: {} };
    expect(() => togglePin(ws, A)).toThrow(/up to/);
  });

  it("files conversations into folders, filters by folder, and empty name removes the folder", () => {
    let ws = setFolder(cleanWorkspace(null), A, "  Client   work ");
    ws = setFolder(ws, B, "alpha");
    expect(ws.folders[A]).toBe("Client work");
    expect(folderNames(ws)).toEqual(["alpha", "Client work"]);
    expect(arrangeConversations(list, ws, { kind: "folder", name: "alpha" }).map((c) => c.id)).toEqual([B]);
    expect(arrangeConversations(list, ws, { kind: "none" }).map((c) => c.id)).toEqual([C]);
    expect(arrangeConversations(list, ws, { kind: "all" })).toHaveLength(3);
    ws = setFolder(ws, B, "   ");
    expect(ws.folders[B]).toBeUndefined();
    expect(() => parseFolderName("x".repeat(41))).toThrow();
  });

  it("drops malformed stored data instead of breaking", () => {
    expect(cleanWorkspace({ pins: ["nope", A.toUpperCase(), A], folders: { bad: "x", [B]: 3, [C]: "ok" } })).toEqual({ pins: [A], folders: { [C]: "ok" } });
    const store = memory();
    store.setItem(WORKSPACE_KEY, "{not json");
    expect(readWorkspace(store)).toEqual({ pins: [], folders: {} });
    expect(readWorkspace(null)).toEqual({ pins: [], folders: {} });
  });

  it("round-trips through storage and reports a failed write", () => {
    const store = memory();
    expect(writeWorkspace({ pins: [A], folders: { [B]: "Leads" } }, store)).toBe(true);
    expect(readWorkspace(store)).toEqual({ pins: [A], folders: { [B]: "Leads" } });
    const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(writeWorkspace({ pins: [], folders: {} }, full)).toBe(false);
  });

  it("exports one conversation as markdown with honest counts", () => {
    const md = conversationMarkdown("Leads  check", [
      { role: "user", content: "How many leads?", created_at: "2026-11-05T07:00:00.000Z" },
      { role: "assistant", content: "NOT_VERIFIED", created_at: "2026-11-05T07:00:05.000Z" },
    ], { exportedAt: new Date("2026-11-05T08:00:00.000Z") });
    expect(md).toContain("# Leads check");
    expect(md).toContain("Exported 2026-11-05T08:00:00.000Z · 2 messages");
    expect(md).toContain("### You · 2026-11-05T07:00:00.000Z\n\nHow many leads?");
    expect(md).toContain("### Jarvis · ");
    expect(md).not.toContain("Only the most recent");
    expect(conversationMarkdown("x", [], { truncated: true })).toContain("No messages in this conversation yet.");
    expect(conversationMarkdown("x", [{ role: "user", content: "hi", created_at: "t" }], { truncated: true })).toContain("Only the most recent messages were exported");
  });

  it("makes safe file names", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(exportFilename("Fix / the <script> builder!!", now)).toBe("jarvis-fix-the-script-builder-2026-11-05.md");
    expect(exportFilename("🙂", now)).toBe("jarvis-conversation-2026-11-05.md");
  });

  it("loads every page oldest-first and flags a cut-off", async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ created_at: `2026-11-05T00:00:0${i}Z` }));
    const page = (size: number) => async (before?: string) => {
      const older = before ? all.filter((r) => r.created_at < before) : all;
      return older.slice(-size);
    };
    expect(await loadAllPages(page(2), 2)).toEqual({ rows: all, truncated: false });
    const cut = await loadAllPages(page(2), 2, 2);
    expect(cut.truncated).toBe(true);
    expect(cut.rows).toEqual(all.slice(1));
  });
});
