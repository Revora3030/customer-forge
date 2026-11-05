import { describe, expect, it } from "vitest";
import { deleteMemory, listMemory, recordMemory, restoreMemory, RESTORE_WINDOW_MS, type MemoryContext } from "@/lib/business-memory.server";
import { fakeDb, type Row } from "@/lib/test-support/fake-memory-db";

const owner = (organizationId = "org-a"): MemoryContext => ({ organizationId, actor: { kind: "owner", userId: "user-1" } });
const agent: MemoryContext = { organizationId: "org-a", actor: { kind: "agent", userId: "user-1" } };
const row = (over: Row = {}): Row => ({
  id: "m1", organization_id: "org-a", kind: "fact", key: "Phone", value: "555 0100", status: "confirmed", source_type: "owner_entered", source_id: null,
  deleted_at: null, superseded_by: null, created_at: "2026-11-05T00:00:00Z", ...over,
});

describe("restoreMemory (undo for delete)", () => {
  it("brings back a note deleted a moment ago, lists it again and logs a restored event", async () => {
    const { db, tables } = fakeDb({ business_memory: [row()] });
    expect((await deleteMemory(db, owner(), "m1")).ok).toBe(true);
    expect(await listMemory(db, owner())).toEqual([]);
    const back = await restoreMemory(db, owner(), "m1");
    expect(back.ok).toBe(true);
    expect(tables.business_memory[0]!.deleted_at).toBeNull();
    expect((await listMemory(db, owner())).map((note) => note.id)).toEqual(["m1"]);
    expect(tables.business_memory_events.map((event) => event.action)).toEqual(["deleted", "restored"]);
  });

  it("restores nothing once the undo window has passed", async () => {
    const deletedAt = new Date(Date.now() - RESTORE_WINDOW_MS - 5_000).toISOString();
    const { db, tables } = fakeDb({ business_memory: [row({ deleted_at: deletedAt })] });
    const result = await restoreMemory(db, owner(), "m1");
    expect(result.ok).toBe(false);
    expect(tables.business_memory[0]!.deleted_at).toBe(deletedAt);
  });

  it("refuses a note that was never deleted, an unknown id and the assistant", async () => {
    const { db } = fakeDb({ business_memory: [row()] });
    expect((await restoreMemory(db, owner(), "m1")).ok).toBe(false);
    expect((await restoreMemory(db, owner(), "nope")).ok).toBe(false);
    await deleteMemory(db, owner(), "m1");
    expect((await restoreMemory(db, agent, "m1")).ok).toBe(false);
  });

  it("cannot restore another workspace's deleted note", async () => {
    const { db, tables } = fakeDb({ business_memory: [row({ organization_id: "org-b", deleted_at: new Date().toISOString() })] });
    const result = await restoreMemory(db, owner("org-a"), "m1");
    expect(result.ok).toBe(false);
    expect(tables.business_memory[0]!.deleted_at).not.toBeNull();
  });

  it("does not restore over a newer confirmed note that took the same label", async () => {
    const { db, tables } = fakeDb({ business_memory: [row()] });
    await deleteMemory(db, owner(), "m1");
    const newer = await recordMemory(db, owner(), { kind: "fact", key: "phone", value: "555 0199", sourceType: "owner_entered" });
    expect(newer.ok).toBe(true);
    const result = await restoreMemory(db, owner(), "m1");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problem).toMatch(/newer note/);
    expect(tables.business_memory.find((note) => note.id === "m1")!.deleted_at).not.toBeNull();
  });
});
