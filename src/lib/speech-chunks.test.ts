import { describe, expect, it } from "vitest";
import { MAX_SPOKEN_CHARS, splitSpeech } from "./speech-chunks";

describe("splitSpeech", () => {
  it("starts with a short chunk and keeps sentences whole", () => {
    const text = "Your builds are healthy. Two sites published today. One demo is waiting for approval, and the trial funnel converted one account this week.";
    const chunks = splitSpeech(text, 40, 200);
    expect(chunks[0]).toBe("Your builds are healthy.");
    expect(chunks.join(" ")).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= 200)).toBe(true);
  });

  it("splits a very long sentence without losing words", () => {
    const text = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const chunks = splitSpeech(text, 60, 120);
    expect(chunks.join(" ")).toBe(text);
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
  });

  it("caps the total spoken length and ignores empty text", () => {
    expect(splitSpeech("a. ".repeat(2000)).join(" ").length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
    expect(splitSpeech("   ")).toEqual([]);
  });
});
