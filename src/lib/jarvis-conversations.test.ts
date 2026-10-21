import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { conversationTitle, parseConversationId, parseRenameTitle, parseSearchTerm } from "./jarvis-conversations";

describe("jarvis conversations", () => {
  it("accepts only uuid conversation ids", () => {
    expect(parseConversationId(undefined)).toBeNull();
    expect(parseConversationId("0F8FAD5B-D9CB-469F-A165-70867728950E")).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(() => parseConversationId("1 or 1=1")).toThrow();
  });
  it("titles from the first message, capped at 60 characters", () => {
    expect(conversationTitle("  check   leads ")).toBe("check leads");
    expect(conversationTitle("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });
  it("rejects empty and overlong names", () => {
    expect(() => parseRenameTitle("   ")).toThrow();
    expect(() => parseRenameTitle("a".repeat(121))).toThrow();
  });
  it("strips filter syntax from search terms", () => {
    expect(parseSearchTerm("a")).toBeNull();
    expect(parseSearchTerm("leads%),id.in.(x")).toBe("leads id.in. x");
  });
  it("migration keeps conversations owner-only and blocks foreign conversation ids", () => {
    const sql = readFileSync("drizzle/migrations/0017_jarvis_conversations.sql", "utf8");
    expect(sql).toMatch(/USING \(auth\.uid\(\) = user_id\)/);
    expect(sql).not.toMatch(/TO anon/);
    expect(sql).toMatch(/CONVERSATION_NOT_OWNED/);
  });
});
