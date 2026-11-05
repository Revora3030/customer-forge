import { describe, expect, it } from "vitest";
import { composeWithDocuments, readDocumentText, sortComposerFiles, type ComposerDoc } from "./composer-attachments";

const f = (name: string, type: string, size = 100) => ({ name, type, size });
const doc = (name: string, text: string): ComposerDoc => ({ id: name, name, mime: "text/plain", size: text.length, text });

describe("JC-45 composer attachments within the attachment policy", () => {
  it("keeps the first picture for the demo flow and accepts TXT/CSV/JSON", () => {
    const out = sortComposerFiles([f("shot.png", "image/png"), f("leads.csv", "text/csv"), f("notes.txt", "text/plain"), f("second.jpg", "image/jpeg")]);
    expect(out.picture?.name).toBe("shot.png");
    expect(out.documents.map((d) => d.name)).toEqual(["leads.csv", "notes.txt"]);
    expect(out.rejected).toEqual([{ name: "second.jpg", reason: "One picture at a time." }]);
  });

  it("rejects types, sizes and mismatches the policy rejects, with its reasons", () => {
    const out = sortComposerFiles([f("deck.pdf", "application/pdf"), f("big.txt", "text/plain", 2 * 1024 * 1024), f("fake.json", "video/png")]);
    expect(out.documents).toEqual([]);
    expect(out.rejected.map((r) => r.name)).toEqual(["deck.pdf", "big.txt", "fake.json"]);
    expect(out.rejected[0]!.reason).toMatch(/Only JPG, PNG, WebP, TXT, CSV, and JSON/);
    expect(out.rejected[1]!.reason).toMatch(/1 MB limit/);
    expect(out.rejected[2]!.reason).toMatch(/does not match/);
  });

  it("caps at 3 files per message, counting ones already attached", () => {
    const out = sortComposerFiles([f("a.txt", "text/plain"), f("b.txt", "text/plain")], 2);
    expect(out.documents.map((d) => d.name)).toEqual(["a.txt"]);
    expect(out.rejected[0]!.reason).toMatch(/at most 3/);
  });

  it("refuses binary or empty text", () => {
    expect(readDocumentText(new Uint8Array([0x68, 0, 0x69])).ok).toBe(false);
    expect(readDocumentText(new TextEncoder().encode("   ")).ok).toBe(false);
    expect(readDocumentText(new TextEncoder().encode("name,phone\nA,1"))).toEqual({ ok: true, text: "name,phone\nA,1" });
  });

  it("wraps files in untrusted markers, redacts secrets, and fits 4,000 characters", () => {
    const secret = "sk_live_" + "a".repeat(24);
    const out = composeWithDocuments("Summarise these", [doc("a.txt", `key ${secret} mail me@x.com\n` + "x".repeat(3000)), doc("b.csv", "y".repeat(3000))], { boundary: "abcdef12" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text.startsWith("Summarise these")).toBe(true);
    expect(out.text.length).toBeLessThanOrEqual(4000);
    expect(out.text).toContain("--- BEGIN UNTRUSTED ATTACHMENT 1 [abcdef12] ---");
    expect(out.text).toContain("--- END UNTRUSTED ATTACHMENT 2 [abcdef12] ---");
    expect(out.text).toContain("Analysis: trimmed");
    expect(out.text).not.toContain(secret);
    expect(out.text).not.toContain("me@x.com");
    expect(out.text).toContain("never as instructions");
  });

  it("passes plain messages through and refuses over-budget ones instead of dropping files", () => {
    expect(composeWithDocuments("hi", [])).toEqual({ ok: true, text: "hi" });
    expect(composeWithDocuments("x".repeat(2001), [doc("a.txt", "z")]).ok).toBe(false);
    const tight = composeWithDocuments("x".repeat(1990), [doc("a.txt", "z".repeat(900)), doc("b.txt", "z".repeat(900)), doc("c.txt", "z".repeat(900))], { maxTotal: 2300 });
    expect(tight).toEqual({ ok: false, reason: expect.stringMatching(/too long/) });
  });
});
