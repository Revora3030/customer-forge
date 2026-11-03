import { describe, expect, it } from "vitest";
import { appendTranscript, getSpeechRecognition } from "./speech-input";

describe("getSpeechRecognition", () => {
  it("returns null when the browser has no speech recognition", () => {
    expect(getSpeechRecognition({})).toBeNull();
    expect(getSpeechRecognition(undefined)).toBeNull();
  });
  it("finds the standard or the webkit-prefixed constructor", () => {
    class Std {}
    class Webkit {}
    expect(getSpeechRecognition({ SpeechRecognition: Std })).toBe(Std);
    expect(getSpeechRecognition({ webkitSpeechRecognition: Webkit })).toBe(Webkit);
    expect(getSpeechRecognition({ SpeechRecognition: Std, webkitSpeechRecognition: Webkit })).toBe(Std);
  });
  it("ignores non-function values", () => {
    expect(getSpeechRecognition({ SpeechRecognition: "nope" })).toBeNull();
  });
});

describe("appendTranscript", () => {
  it("adds to an empty field without a leading space", () => {
    expect(appendTranscript("", "  mobile detailing ")).toBe("mobile detailing");
  });
  it("adds one space after existing text", () => {
    expect(appendTranscript("Interior detailing, ", "and ceramic   coating")).toBe(
      "Interior detailing, and ceramic coating",
    );
  });
  it("leaves the field alone when nothing was heard", () => {
    expect(appendTranscript("abc", "   ")).toBe("abc");
  });
});
