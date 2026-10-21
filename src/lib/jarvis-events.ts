/**
 * Jarvis run events: one row per model round, tool call, proposal, approval
 * or error. Browser-safe helpers; the writer lives in jarvis-events.server.ts.
 */
import { redactSensitiveText } from "./production-control-plane";

export type RunEventKind = "model_call" | "tool" | "proposal" | "approval" | "error" | "cancelled";
export type RunEventStatus = "running" | "ok" | "failed" | "rejected" | "cancelled";

export type RunEvent = {
  id: string;
  run_id: string;
  step: number;
  kind: RunEventKind;
  tool_id: string | null;
  label: string | null;
  status: RunEventStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  input_summary: string | null;
  output_summary: string | null;
  error: string | null;
  artifact_url: string | null;
  provider: string | null;
  model: string | null;
};

const EXTRA_SECRETS: [RegExp, string][] = [
  [/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_KEY]"],
  [/pplx-[A-Za-z0-9]{16,}/g, "[REDACTED_KEY]"],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED_JWT]"],
  [/((?:api[-_]?key|token|secret|password)["']?\s*[:=]\s*["']?)[^\s"',;]+/gi, "$1[REDACTED]"],
];

/** Redacts secrets, collapses whitespace and bounds length. Null for empty input. */
export function summarize(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  let text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return null;
  text = redactSensitiveText(text);
  for (const [re, rep] of EXTRA_SECRETS) text = text.replace(re, rep);
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Only same-site paths or https links are kept as artifact links. */
export function safeArtifactUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/^\/(?!\/)[^\s\\]*$/.test(value)) return value.slice(0, 500);
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}
