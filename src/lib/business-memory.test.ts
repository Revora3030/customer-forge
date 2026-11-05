import { describe, expect, it } from "vitest";
import { checkNewMemory, describeSource, initialStatus, memoryEmbeddingText, toRecalled, type BusinessMemoryRow } from "@/lib/business-memory";

describe("checkNewMemory", () => {
  it("rejects a fact with no source", () => {
    const result = checkNewMemory({ kind: "fact", key: "Opening hours", value: "9 to 5", sourceType: "agent_inference" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toMatch(/needs a source/);
  });
  it("accepts an owner-typed fact without a message id", () => {
    expect(checkNewMemory({ kind: "fact", key: "Opening hours", value: "9 to 5", sourceType: "owner_entered" }).ok).toBe(true);
  });
  it("accepts a fact that names its source", () => {
    const result = checkNewMemory({ kind: "fact", key: "Phone", value: "555 0100", sourceType: "url", sourceId: "https://example.com/contact" });
    expect(result.ok).toBe(true);
  });
  it("keeps tone rules and style preferences owner-only", () => {
    for (const kind of ["tone_rule", "style_preference"] as const) {
      expect(checkNewMemory({ kind, key: "Voice", value: "Warm", sourceType: "agent_inference" }).ok).toBe(false);
      expect(checkNewMemory({ kind, key: "Voice", value: "Warm", sourceType: "url", sourceId: "https://x.test" }).ok).toBe(false);
      expect(checkNewMemory({ kind, key: "Voice", value: "Warm", sourceType: "owner_message", sourceId: "msg-1" }).ok).toBe(true);
    }
  });
  it("trims, collapses spaces and enforces length limits", () => {
    const ok = checkNewMemory({ kind: "fact", key: "  Our   hours ", value: " 9  to 5 ", sourceType: "owner_entered" });
    expect(ok.ok && ok.memory.key).toBe("Our hours");
    expect(ok.ok && ok.memory.value).toBe("9 to 5");
    expect(checkNewMemory({ kind: "fact", key: "k".repeat(121), value: "v", sourceType: "owner_entered" }).ok).toBe(false);
    expect(checkNewMemory({ kind: "fact", key: "k", value: "v".repeat(1001), sourceType: "owner_entered" }).ok).toBe(false);
    expect(checkNewMemory({ kind: "fact", key: " ", value: "v", sourceType: "owner_entered" }).ok).toBe(false);
    expect(checkNewMemory({ kind: "fact", key: "k", value: " ", sourceType: "owner_entered" }).ok).toBe(false);
  });
  it("rejects unknown kinds and sources", () => {
    expect(checkNewMemory({ kind: "secret" as never, key: "k", value: "v", sourceType: "owner_entered" }).ok).toBe(false);
    expect(checkNewMemory({ kind: "fact", key: "k", value: "v", sourceType: "guess" as never }).ok).toBe(false);
  });
});

describe("initialStatus", () => {
  it("confirms only a signed-in owner's own words", () => {
    expect(initialStatus({ kind: "owner", userId: "u1" }, "owner_entered")).toBe("confirmed");
    expect(initialStatus({ kind: "owner", userId: "u1" }, "owner_message")).toBe("confirmed");
  });
  it("proposes everything else", () => {
    expect(initialStatus({ kind: "owner", userId: "u1" }, "agent_inference")).toBe("proposed");
    expect(initialStatus({ kind: "owner", userId: "u1" }, "url")).toBe("proposed");
    expect(initialStatus({ kind: "agent", userId: "u1" }, "owner_message")).toBe("proposed");
    expect(initialStatus({ kind: "system", userId: null }, "owner_entered")).toBe("proposed");
    expect(initialStatus({ kind: "owner", userId: null }, "owner_entered")).toBe("proposed");
  });
});

describe("source lines", () => {
  const row = (over: Partial<BusinessMemoryRow>): BusinessMemoryRow => ({
    id: "m1", organization_id: "o1", kind: "fact", key: "Phone", value: "555", status: "confirmed", source_type: "owner_entered", source_id: null,
    source_quote: null, fetched_at: null, superseded_by: null, created_by: null, confirmed_by: null, confirmed_at: null, deleted_at: null,
    created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T00:00:00Z", ...over,
  });
  it("names each source in plain words", () => {
    expect(describeSource(row({}))).toBe("You told us this");
    expect(describeSource(row({ source_type: "owner_message", source_id: "m9" }))).toBe("From your message");
    expect(describeSource(row({ source_type: "url", source_id: "https://a.test/x" }))).toBe("From https://a.test/x");
  });
  it("says when a note is not confirmed yet", () => {
    expect(describeSource(row({ status: "proposed", source_type: "agent_inference", source_id: "run1" }))).toBe("Worked out by the assistant (not confirmed yet)");
  });
  it("gives the model only safe fields", () => {
    const recalled = toRecalled(row({}), 0.9);
    expect(Object.keys(recalled).sort()).toEqual(["id", "key", "kind", "similarity", "source", "status", "value"].sort());
    expect(memoryEmbeddingText(row({}))).toBe("Phone: 555");
  });
});
