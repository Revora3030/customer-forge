/**
 * STREAM RELIABILITY
 * ==================
 *
 * A streamed model answer only counts as a success when the stream terminated
 * of its own accord AND the accumulated output passed validation. A partial,
 * timed-out, disconnected or malformed stream is reported as a failure so the
 * caller can fail over to another free model — it is never presented to the
 * rest of Revora as a completed answer.
 *
 * Server-only. Holds no credentials and never decides which model to call; it
 * only judges whether the bytes that arrived add up to a real answer.
 */

export type StreamFailureReason =
  | "aborted"
  | "timeout"
  | "transport"
  | "empty"
  | "invalid";

export type VerifiedStream<T> =
  | { ok: true; value: T; text: string; chunks: number; durationMs: number }
  | {
      ok: false;
      reason: StreamFailureReason;
      detail: string;
      text: string;
      chunks: number;
      durationMs: number;
    };

export type VerifyStreamOptions<T> = {
  /** Decodes/validates the completed text. Return null to reject the answer. */
  validate: (text: string) => T | null;
  /** Whole-stream deadline. A stream still open at the deadline fails. */
  timeoutMs?: number;
  /** Fails a stream that produced no byte for this long. */
  idleMs?: number;
  /** Caller cancellation (user pressed stop, request aborted). */
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_IDLE_MS = 45_000;

function decodeChunk(decoder: TextDecoder, chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return decoder.decode(chunk, { stream: true });
  return "";
}

/**
 * Consumes a stream to completion and validates it. Resolves with ok:false
 * instead of throwing, so a caller's failover path stays a plain branch.
 */
export async function consumeVerifiedStream<T>(
  stream: ReadableStream<Uint8Array | string>,
  options: VerifyStreamOptions<T>,
): Promise<VerifiedStream<T>> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  let text = "";
  let chunks = 0;
  let lastChunkAt = started;

  const fail = (reason: StreamFailureReason, detail: string): VerifiedStream<T> => ({
    ok: false,
    reason,
    detail,
    text,
    chunks,
    durationMs: Date.now() - started,
  });

  try {
    for (;;) {
      if (options.signal?.aborted) {
        await reader.cancel().catch(() => {});
        return fail("aborted", "The request was cancelled before the answer finished.");
      }

      const elapsed = Date.now() - started;
      if (elapsed >= timeoutMs) {
        await reader.cancel().catch(() => {});
        return fail("timeout", `The answer did not finish within ${timeoutMs}ms.`);
      }

      const remaining = Math.min(timeoutMs - elapsed, Math.max(idleMs - (Date.now() - lastChunkAt), 1));
      let settled: { done: boolean; value?: Uint8Array | string } | "expired";
      try {
        settled = await Promise.race([
          reader.read(),
          new Promise<"expired">((resolve) => setTimeout(() => resolve("expired"), remaining)),
        ]);
      } catch (error) {
        return fail(
          "transport",
          error instanceof Error ? error.message : "The connection dropped mid-answer.",
        );
      }

      if (settled === "expired") {
        if (Date.now() - lastChunkAt >= idleMs) {
          await reader.cancel().catch(() => {});
          return fail("timeout", `The model stopped sending for more than ${idleMs}ms.`);
        }
        continue;
      }

      if (settled.done) break;

      const piece = decodeChunk(decoder, settled.value);
      if (piece) {
        text += piece;
        chunks += 1;
        lastChunkAt = Date.now();
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  text += decoder.decode();

  if (!text.trim()) {
    return fail("empty", "The stream completed without producing any answer.");
  }

  let value: T | null = null;
  try {
    value = options.validate(text);
  } catch (error) {
    return fail("invalid", error instanceof Error ? error.message : "The answer failed validation.");
  }

  if (value === null || value === undefined) {
    return fail("invalid", "The completed answer did not match the expected shape.");
  }

  return { ok: true, value, text, chunks, durationMs: Date.now() - started };
}

/** Validator for streams that must end in one JSON object. */
export function jsonObjectValidator(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Validator for prose streams: requires real content, not a stub. */
export function textValidator(minLength = 1) {
  return (text: string): string | null => {
    const trimmed = text.trim();
    return trimmed.length >= minLength ? trimmed : null;
  };
}
