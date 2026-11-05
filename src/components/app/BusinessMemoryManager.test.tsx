import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BusinessMemoryRow } from "@/lib/business-memory";
import { MemoryManagerView, type MemoryManagerViewProps } from "@/components/app/BusinessMemoryManager";

const row = (over: Partial<BusinessMemoryRow> = {}): BusinessMemoryRow => ({
  id: "n1", organization_id: "o", kind: "fact", key: "Opening hours", value: "Monday to Friday", status: "confirmed", source_type: "owner_entered",
  source_id: null, source_quote: null, fetched_at: null, superseded_by: null, created_by: "u", confirmed_by: "u", confirmed_at: "2026-11-02T12:00:00Z",
  deleted_at: null, created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-02T12:00:00Z", ...over,
});
const guess = row({ id: "n2", key: "Service area", value: "Leeds", status: "proposed", source_type: "agent_inference", source_id: "run-9", confirmed_at: null, confirmed_by: null });

const props = (over: Partial<MemoryManagerViewProps> = {}): MemoryManagerViewProps => {
  const notes = over.notes ?? [row(), guess];
  return {
    notes, total: notes.length, counts: { all: notes.length, needs_confirm: 1, confirmed: 1 }, query: "", filter: "all", canManage: true, pinned: new Set(),
    editing: null, expandedId: null, history: null, busy: false, message: null, undo: null, adding: null,
    onQuery: vi.fn(), onFilter: vi.fn(), onConfirm: vi.fn(), onEditStart: vi.fn(), onEditChange: vi.fn(), onEditSave: vi.fn(), onEditCancel: vi.fn(),
    onDelete: vi.fn(), onUndo: vi.fn(), onPin: vi.fn(), onWhy: vi.fn(), onAddStart: vi.fn(), onAddChange: vi.fn(), onAddSave: vi.fn(), onAddCancel: vi.fn(),
    ...over,
  };
};
const html = (over?: Partial<MemoryManagerViewProps>) => renderToStaticMarkup(<MemoryManagerView {...props(over)} />);

describe("MemoryManagerView", () => {
  it("lists each note with its kind, status and plain-words source", () => {
    const out = html();
    expect(out).toContain("Opening hours");
    expect(out).toContain("You told us this");
    expect(out).toContain("Worked out by the assistant (not confirmed yet)");
    expect(out).toContain("Needs your OK");
    expect(out).toContain("2 notes");
  });

  it("offers Confirm only on notes the assistant guessed", () => {
    expect(html({ notes: [row()] })).not.toContain(">Confirm<");
    expect(html({ notes: [guess] })).toContain(">Confirm<");
  });

  it("owners get Edit, Delete and Add; read-only members get none of them", () => {
    const owner = html();
    expect(owner).toContain(">Edit<");
    expect(owner).toContain(">Delete<");
    expect(owner).toContain("Add a note");
    const member = html({ canManage: false });
    expect(member).not.toContain(">Edit<");
    expect(member).not.toContain(">Delete<");
    expect(member).not.toContain("Add a note");
    expect(member).not.toContain(">Confirm<");
    expect(member).toContain("Only a workspace owner or admin can change these notes.");
  });

  it("shows an Undo with the seconds left right after a delete", () => {
    const out = html({ undo: { key: "Opening hours", secondsLeft: 27 } });
    expect(out).toContain("Deleted “Opening hours”.");
    expect(out).toContain("Undo (27s)");
    expect(html()).not.toContain("Undo (");
  });

  it("shows the why-saved detail: source, quote, and honest history", () => {
    const quoted = row({ id: "n2", source_type: "owner_message", source_id: "msg-4", source_quote: "we open at nine" });
    const out = html({ notes: [quoted], expandedId: "n2", history: [{ id: 1, action: "edited", actor_kind: "owner", created_at: "2026-11-03T10:00:00Z" }] });
    expect(out).toContain("we open at nine");
    expect(out).toContain("Source reference: msg-4");
    expect(out).toContain("Edited by you");
    expect(html({ notes: [quoted], expandedId: "n2", history: [] })).toContain("No changes recorded.");
    expect(html({ notes: [quoted], expandedId: "n2", history: null })).toContain("Loading history…");
    expect(html({ notes: [guess], expandedId: "n2", history: [] })).toContain("treats it as a guess");
  });

  it("is honest when nothing is saved and when a search finds nothing", () => {
    expect(html({ notes: [], total: 0 })).toContain("Nothing saved yet");
    const none = html({ notes: [], total: 2, query: "zzz" });
    expect(none).toContain("No notes match.");
    expect(none).toContain("Showing 0 of 2");
    expect(none).not.toContain("Nothing saved yet");
  });

  it("says pinning is only a local view preference", () => {
    const out = html({ pinned: new Set(["n1"]) });
    expect(out).toContain("Pinned on this device");
    expect(out).toContain("does not change what the assistant uses");
  });

  it("shows server problems as an alert and edit form fields with labels", () => {
    expect(html({ message: { kind: "error", text: "A newer note already uses that label" } })).toContain('role="alert"');
    const editing = html({ editing: { id: "n1", key: "Opening hours", value: "Mon-Fri" } });
    expect(editing).toContain('for="memory-key-n1"');
    expect(editing).toContain("Mon-Fri");
  });

  it("uses no tiny type", () => {
    expect(html({ adding: { kind: "fact", key: "", value: "" }, undo: { key: "k", secondsLeft: 3 } })).not.toMatch(/text-\[(8|9|10|11)px\]/);
  });
});
