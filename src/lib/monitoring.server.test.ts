import { describe, expect, it } from "vitest";
import { sanitizeContext, stacktraceFrames } from "./monitoring.server";

describe("Sentry stack frames", () => {
  it("parses real V8/Node frames in Sentry's oldest-first order", () => {
    const frames = stacktraceFrames(`TypeError: broken
    at render (https://example.com/assets/index.js?token=secret:22:17)
    at https://example.com/assets/app.js:100:4
    at async runJob (/app/worker.js:12:9)`);
    expect(frames).toEqual([
      { function: "async runJob", filename: "/app/worker.js", lineno: 12, colno: 9, in_app: true },
      { function: "<anonymous>", filename: "https://example.com/assets/app.js", lineno: 100, colno: 4, in_app: true },
      { function: "render", filename: "https://example.com/assets/index.js", lineno: 22, colno: 17, in_app: true },
    ]);
  });

  it("parses Firefox and Safari frames and strips preview tokens", () => {
    expect(stacktraceFrames("render@https://example.com/p/abcdefghijklmnop/page:4:5\n@https://example.com/main.js#secret:2:3"))
      .toEqual([
        { function: "<anonymous>", filename: "https://example.com/main.js", lineno: 2, colno: 3, in_app: true },
        { function: "render", filename: "https://example.com/p/[token]/page", lineno: 4, colno: 5, in_app: true },
      ]);
  });

  it("ignores malformed/non-frame text and caps the most relevant frames", () => {
    expect(stacktraceFrames(null)).toEqual([]);
    expect(stacktraceFrames("Error: no stack\nat (native)")).toEqual([]);
    const frames = stacktraceFrames(Array.from({ length: 80 }, (_, i) => `at f (/app.js:${i + 1}:1)`).join("\n"));
    expect(frames).toHaveLength(50);
    expect(frames.at(-1)?.lineno).toBe(1);
    expect(frames[0]?.lineno).toBe(50);
  });

  it("redacts secrets in nested context and arbitrary string fields", () => {
    const context = sanitizeContext({
      request: { headers: { authorization: "bearer-private", cookie: "session-private" }, code: 400 },
      note: "Failed at https://example.com?token=private and user@example.com",
    });
    expect(String(context["request"])).toContain("[redacted]");
    expect(JSON.stringify(context)).not.toContain("private");
    expect(JSON.stringify(context)).not.toContain("user@example.com");
  });
});
