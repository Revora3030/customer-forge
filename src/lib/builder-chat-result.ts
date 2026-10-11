import type { SavedTaskResult } from "@/lib/builder-memory";
import { builderAccessBlock } from "@/lib/builder-access-error";
import { friendlyError } from "@/lib/user-error";

/** Validate saved JSON without coercing counts or trusting arbitrary fields. */
export function normaliseSavedTaskResult(value: unknown, failureText = ""): SavedTaskResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const state = raw["state"];
  if (state !== "complete" && state !== "failed" && state !== "skipped") return null;
  const result: SavedTaskResult = { state };
  for (const field of ["applied", "failedCount", "staleCount", "snapshotVersion"] as const) {
    const number = raw[field];
    if (typeof number === "number" && Number.isSafeInteger(number) && number >= 0)
      result[field] = number;
  }
  if (typeof raw["notice"] === "string") result.notice = raw["notice"].slice(0, 2000);
  if (state === "failed") {
    const text = typeof raw["error"] === "string" ? raw["error"] : failureText;
    if (text.trim()) result.error = friendlyError(text, "The saved request did not finish.");
    if (builderAccessBlock(text)) result.retryable = false;
    else if (typeof raw["retryable"] === "boolean") result.retryable = raw["retryable"];
  }
  return result;
}

/** Known authorization rejection must not be substituted with cached private chat. */
export function isChatAuthorizationError(error: unknown, status?: number): boolean {
  if (status === 401 || status === 403) return true;
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "42501" || code === "PGRST301" || code === "PGRST302";
}
