import { describe, expect, it } from "vitest";
import {
  classifyClientError,
  describeClientError,
  errorFromWindowEvent,
  safeJsonParse,
} from "./client-error-classify";
import { safeJsonLd } from "./json-ld";

describe("describeClientError", () => {
  it("never reports the bare string 'undefined' for empty rejections", () => {
    expect(describeClientError(undefined).message).toBe("Non-Error value thrown or rejected: undefined");
    expect(describeClientError(null).message).toBe("Non-Error value thrown or rejected: null");
  });

  it("keeps Error message and stack", () => {
    const err = new Error("boom");
    const out = describeClientError(err);
    expect(out.message).toBe("boom");
    expect(out.stack).toContain("boom");
    expect(out.kind).toBe("Error");
  });

  it("reads message-like fields from plain objects (e.g. Supabase errors)", () => {
    expect(describeClientError({ message: "JWT expired", code: "PGRST301" }).message).toBe(
      "JWT expired (code PGRST301)",
    );
    expect(describeClientError({ foo: 1 }).message).toBe('Non-Error object thrown: {"foo":1}');
  });
});

describe("classifyClientError", () => {
  it("ignores router control flow", () => {
    expect(classifyClientError({ isNotFound: true })).toBe("ignore");
    expect(classifyClientError({ isRedirect: true })).toBe("ignore");
  });

  it("ignores opaque cross-origin script errors", () => {
    expect(classifyClientError("Script error.")).toBe("ignore");
    expect(classifyClientError("Script error")).toBe("ignore");
  });

  it("downgrades React recoverable hydration errors to warnings", () => {
    expect(
      classifyClientError(
        new Error("Hydration failed because the server rendered HTML didn't match the client."),
      ),
    ).toBe("warn");
    expect(
      classifyClientError(
        new Error("There was an error during concurrent rendering but React was able to recover by instead synchronously rendering the entire root."),
      ),
    ).toBe("warn");
  });

  it("reports real application errors", () => {
    expect(classifyClientError(new TypeError("Cannot read properties of undefined (reading 'days')"))).toBe(
      "report",
    );
    expect(classifyClientError(undefined)).toBe("report");
  });
});

describe("errorFromWindowEvent", () => {
  it("prefers the real error", () => {
    const err = new Error("x");
    expect(errorFromWindowEvent({ error: err, message: "y" })).toBe(err);
  });

  it("builds a located Error when only message/filename exist", () => {
    const out = errorFromWindowEvent({ message: "Unexpected token '{'", filename: "https://a/b.js", lineno: 3, colno: 9 });
    expect(out).toBeInstanceOf(Error);
    expect((out as Error).stack).toContain("https://a/b.js:3:9");
  });

  it("keeps opaque script errors as strings so they can be ignored", () => {
    expect(errorFromWindowEvent({ message: "Script error.", filename: "" })).toBe("Script error.");
  });
});

describe("safeJsonParse", () => {
  it("returns the fallback for invalid or empty input", () => {
    expect(safeJsonParse("{bad", { ok: false })).toEqual({ ok: false });
    expect(safeJsonParse(null, 1)).toBe(1);
    expect(safeJsonParse("", [])).toEqual([]);
    expect(safeJsonParse("null", "fallback")).toBe("fallback");
  });

  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });
});

describe("safeJsonLd", () => {
  it("escapes characters that could end a script tag", () => {
    const out = safeJsonLd({ name: "</script><!-- &" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out)).toEqual({ name: "</script><!-- &" });
  });

  it("never returns undefined for unserializable input", () => {
    expect(safeJsonLd(undefined)).toBe("{}");
  });
});
