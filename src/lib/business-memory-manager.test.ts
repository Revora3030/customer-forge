import { describe, expect, it } from "vitest";
import type { BusinessMemoryRow } from "@/lib/business-memory";
import {
  FILTER_LABEL, NOTE_FILTERS, UNDO_SECONDS, countByFilter, filterNotes, historyLine, orderNotes, pinsKey, readPins, togglePin, whySaved, writePins,
} from "@/lib/business-memory-manager";

const note = (over: Partial<BusinessMemoryRow> = {}): BusinessMemoryRow => ({
  id: "n1", organization_id: "o", kind: "fact", key: "Opening hours", value: "Monday to Friday, 9 to 5", status: "confirmed", source_type: "owner_entered",
  source_id: null, source_quote: null, fetched_at: null, superseded_by: null, created_by: "u", confirmed_by: "u", confirmed_at: "2026-11-02T12:00:00Z",
  deleted_at: null, created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-02T12:00:00Z", ...over,
});
const guess = note({ id: "n2", key: "Service area", value: "Leeds and Bradford", status: "proposed", source_type: "agent_inference", source_id: "run-9", confirmed_at: null, confirmed_by: null });
const tone = note({ id: "n3", kind: "tone_rule", key: "Voice", value: "Friendly, never pushy", source_type: "owner_message", source_id: "msg-1" });
const rows = [note(), guess, tone];

describe("filtering and search", () => {
  it("has a label for every filter", () => {
    for (const filter of NOTE_FILTERS) expect(FILTER_LABEL[filter]).toBeTruthy();
  });
  it("filters by status", () => {
    expect(filterNotes(rows, { query: "", filter: "needs_confirm" }).map((r) => r.id)).toEqual(["n2"]);
    expect(filterNotes(rows, { query: "", filter: "confirmed" }).map((r) => r.id)).toEqual(["n1", "n3"]);
    expect(filterNotes(rows, { query: "", filter: "all" })).toHaveLength(3);
  });
  it("search needs every word, ignores case and spacing, and also matches the kind", () => {
    expect(filterNotes(rows, { query: "  HOURS   friday ", filter: "all" }).map((r) => r.id)).toEqual(["n1"]);
    expect(filterNotes(rows, { query: "leeds bradford", filter: "all" }).map((r) => r.id)).toEqual(["n2"]);
    expect(filterNotes(rows, { query: "tone rule", filter: "all" }).map((r) => r.id)).toEqual(["n3"]);
    expect(filterNotes(rows, { query: "leeds friday", filter: "all" })).toEqual([]);
  });
  it("never changes the rows it was given", () => {
    const copy = JSON.stringify(rows);
    filterNotes(rows, { query: "voice", filter: "confirmed" });
    expect(JSON.stringify(rows)).toBe(copy);
  });
  it("counts every filter from the real rows", () => {
    expect(countByFilter(rows)).toEqual({ all: 3, needs_confirm: 1, confirmed: 2 });
    expect(countByFilter([])).toEqual({ all: 0, needs_confirm: 0, confirmed: 0 });
  });
});

describe("pins (this device only)", () => {
  it("puts pinned notes first and keeps the rest in order", () => {
    expect(orderNotes(rows, new Set(["n3"])).map((r) => r.id)).toEqual(["n3", "n1", "n2"]);
    expect(orderNotes(rows, new Set()).map((r) => r.id)).toEqual(["n1", "n2", "n3"]);
  });
  it("toggles without mutating the old set", () => {
    const start = new Set(["a"]);
    expect([...togglePin(start, "b")].sort()).toEqual(["a", "b"]);
    expect([...togglePin(start, "a")]).toEqual([]);
    expect([...start]).toEqual(["a"]);
  });
  it("round-trips through storage per workspace and survives bad data", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    writePins("org-1", new Set(["a", "b"]), storage);
    expect([...readPins("org-1", storage)]).toEqual(["a", "b"]);
    expect(readPins("org-2", storage).size).toBe(0);
    store.set(pinsKey("org-1"), "{not json");
    expect(readPins("org-1", storage).size).toBe(0);
    store.set(pinsKey("org-1"), JSON.stringify(["x", 4, null]));
    expect([...readPins("org-1", storage)]).toEqual(["x"]);
    expect(readPins("org-1", null).size).toBe(0);
    expect(() => writePins("org-1", new Set(["a"]), { getItem: () => null, setItem: () => { throw new Error("full"); } })).not.toThrow();
  });
});

describe("why was this saved", () => {
  it("says where an owner note came from, with dates", () => {
    expect(whySaved(note())).toEqual({ source: "You told us this", quote: null, saved: "Nov 1, 2026", confirmed: "Nov 2, 2026" });
  });
  it("calls an unconfirmed guess a guess and keeps the quote", () => {
    const why = whySaved({ ...guess, source_quote: "  we cover Leeds  " });
    expect(why.source).toBe("Worked out by the assistant (not confirmed yet)");
    expect(why.quote).toBe("we cover Leeds");
    expect(why.confirmed).toBeNull();
  });
  it("shows the page a web note came from", () => {
    expect(whySaved(note({ source_type: "url", source_id: "https://example.com/about" })).source).toBe("From https://example.com/about");
  });
  it("describes history in plain words and never hides an unknown action", () => {
    expect(historyLine({ action: "edited", actor_kind: "owner", created_at: "2026-11-03T10:00:00Z" })).toBe("Edited by you · Nov 3, 2026");
    expect(historyLine({ action: "proposed", actor_kind: "agent", created_at: "2026-11-03T10:00:00Z" })).toBe("Suggested by the assistant · Nov 3, 2026");
    expect(historyLine({ action: "restored", actor_kind: "owner", created_at: "bad" })).toBe("Restored after a delete by you");
    expect(historyLine({ action: "mystery", actor_kind: "system", created_at: "2026-11-03T10:00:00Z" })).toBe("mystery by the system · Nov 3, 2026");
  });
  it("keeps the undo window at 30 seconds", () => {
    expect(UNDO_SECONDS).toBe(30);
  });
});
