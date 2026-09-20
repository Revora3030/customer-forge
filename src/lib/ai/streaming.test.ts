import { describe, expect, it } from "vitest";

import {
  consumeVerifiedStream,
  jsonObjectValidator,
  textValidator,
} from "@/lib/ai/streaming.server";

function streamOf(pieces: string[], options: { fail?: string; hang?: boolean } = {}) {
  return new ReadableStream<string>({
    async start(controller) {
      for (const piece of pieces) {
        controller.enqueue(piece);
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      if (options.fail) {
        controller.error(new Error(options.fail));
        return;
      }
      if (options.hang) return; // never closes
      controller.close();
    },
  });
}

describe("verified streaming", () => {
  it("accepts a stream that completed with valid JSON", async () => {
    const result = await consumeVerifiedStream(streamOf(['{"a"', ":1}"]), {
      validate: jsonObjectValidator,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ a: 1 });
      expect(result.chunks).toBe(2);
    }
  });

  it("rejects a malformed final answer instead of reporting success", async () => {
    const result = await consumeVerifiedStream(streamOf(['{"a":']), {
      validate: jsonObjectValidator,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  it("rejects an empty completed stream", async () => {
    const result = await consumeVerifiedStream(streamOf([]), { validate: textValidator() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("reports a transport failure mid-stream as a failure, keeping partial text", async () => {
    const result = await consumeVerifiedStream(streamOf(["hello "], { fail: "socket closed" }), {
      validate: textValidator(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("transport");
      expect(result.text).toContain("hello");
    }
  });

  it("fails a stream that never terminates", async () => {
    const result = await consumeVerifiedStream(streamOf(["partial"], { hang: true }), {
      validate: textValidator(),
      timeoutMs: 60,
      idleMs: 30,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("honours caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await consumeVerifiedStream(streamOf(["x"], { hang: true }), {
      validate: textValidator(),
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("aborted");
  });

  it("decodes byte streams", async () => {
    const bytes = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("done"));
        controller.close();
      },
    });
    const result = await consumeVerifiedStream(bytes, { validate: textValidator(3) });
    expect(result.ok).toBe(true);
  });

  it("rejects a validator that throws", async () => {
    const result = await consumeVerifiedStream(streamOf(["x"]), {
      validate: () => {
        throw new Error("schema mismatch");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
      expect(result.detail).toContain("schema mismatch");
    }
  });
});
