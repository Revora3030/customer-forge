/** Client-facing error text: preserve actionable access blocks without leaking internals. */
import { builderAccessBlock } from "@/lib/builder-access-error";

const TECHNICAL = [
  "row-level security", "rls", "violates", "constraint", "duplicate key", "postgrest", "pgrst",
  "relation ", "column ", "syntax error", "jwt", "supabase", "fetch failed", "failed to fetch",
  "networkerror", "internal server error", "500", "502", "503", "504", "unexpected token",
  "typeerror", "undefined is not", "null value in", "permission denied", "stack", "econn",
  "timeout of", "server function",
];

function raw(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message ?? "";
  if (typeof err === "object") {
    const e = err as { message?: unknown };
    if (typeof e.message === "string") return e.message;
  }
  return "";
}

export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again.") {
  const message = raw(err).trim();
  if (!message) return fallback;
  // Known access blocks use fixed safe copy, even when the server explanation is long.
  const block = builderAccessBlock(message);
  if (block) return block.message;
  const lower = message.toLowerCase();
  if (TECHNICAL.some((marker) => lower.includes(marker))) return fallback;
  if (message.length > 180 || message.includes(" — at ") || message.includes("{")) return fallback;
  return message;
}
