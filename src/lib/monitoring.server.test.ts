import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./monitoring.server.ts", import.meta.url), "utf8");

describe("Sentry error payload contract", () => {
  it("preserves parsed stack frames instead of sending an empty frame array", () => {
    expect(source).toContain("function stacktraceFrames");
    expect(source).toContain("stacktraceFrames(event.stack)");
    expect(source).not.toContain("stacktrace: event.stack ? { frames: [] } : undefined");
  });

  it("strips query strings and fragments from forwarded stack filenames", () => {
    expect(source).toContain('split(/[?#]/, 1)[0]');
  });
});
