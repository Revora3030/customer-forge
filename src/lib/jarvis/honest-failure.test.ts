import { describe, expect, it } from "vitest";
import {
  BANNED_GENERIC_FAILURE,
  classifyJarvisError,
  describeJarvisFailure,
  jarvisFailureSentence,
  jarvisFailureToast,
  type JarvisFailureKind,
} from "./honest-failure";

/** Top Jarvis failure paths audited for JC-48 — one assertion per message. */
const TOP_KINDS: JarvisFailureKind[] = [
  "send",
  "save_message",
  "save_reply",
  "history_load",
  "history_after_send",
  "regenerate",
  "clear",
  "timeout",
  "network",
  "rate_limited",
  "quota",
  "stall",
];

describe("honest Jarvis failure copy (JC-48)", () => {
  it.each(TOP_KINDS)("%s says what failed, what was kept, and the next step — never 'something went wrong'", (kind) => {
    const copy = describeJarvisFailure(kind);
    expect(copy.whatFailed.length).toBeGreaterThan(8);
    expect(copy.whatKept.length).toBeGreaterThan(8);
    expect(copy.nextStep.length).toBeGreaterThan(8);
    const sentence = jarvisFailureSentence(kind);
    expect(sentence).toContain(copy.whatFailed);
    expect(sentence).toContain(copy.whatKept);
    expect(sentence).toContain(copy.nextStep);
    expect(sentence).not.toMatch(BANNED_GENERIC_FAILURE);
    expect(copy.whatFailed).not.toMatch(BANNED_GENERIC_FAILURE);
  });

  it("classifies known server throws onto the matching kind", () => {
    expect(classifyJarvisError(new Error("Couldn't save your message."))).toBe("save_message");
    expect(classifyJarvisError(new Error("Jarvis answered, but the reply could not be saved. Refresh before retrying."))).toBe("save_reply");
    expect(classifyJarvisError(new Error("Your message was saved, but chat history could not be loaded."))).toBe("history_after_send");
    expect(classifyJarvisError(new Error("Couldn't load your Jarvis chat."))).toBe("history_load");
    expect(classifyJarvisError(new Error("Couldn't replace the last reply."))).toBe("regenerate");
    expect(classifyJarvisError(new Error("Revora AI took too long to answer this turn, so Jarvis stopped."))).toBe("timeout");
    expect(classifyJarvisError({ message: "x", category: "quota" })).toBe("quota");
    expect(classifyJarvisError({ message: "x", category: "rate_limited" })).toBe("rate_limited");
    expect(classifyJarvisError(new Error("Something went wrong. Try again."))).toBe("generic");
  });

  it("toast helper never returns banned generic copy", () => {
    expect(jarvisFailureToast(new Error("Something went wrong"))).not.toMatch(BANNED_GENERIC_FAILURE);
    expect(jarvisFailureToast(null)).not.toMatch(BANNED_GENERIC_FAILURE);
    expect(jarvisFailureToast(new Error("Couldn't save your message."))).toContain("could not be saved");
  });
});
