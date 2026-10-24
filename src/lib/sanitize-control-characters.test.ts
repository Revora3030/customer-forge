import { describe, expect, it } from "vitest";
import { replaceControlCharacters } from "./sanitize-control-characters";

describe("replaceControlCharacters", () => {
  it("replaces null, ASCII control characters, and DEL without changing normal text", () => {
    expect(replaceControlCharacters("hello\u0000world\u001f\u007f!")).toBe("hello world   !");
  });

  it("uses the caller-provided replacement and preserves newlines only when not in the ASCII control set", () => {
    expect(replaceControlCharacters("a\u0001b", "-")).toBe("a-b");
    expect(replaceControlCharacters("plain query")).toBe("plain query");
  });
});
