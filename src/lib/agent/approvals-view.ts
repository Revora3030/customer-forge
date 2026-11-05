/**
 * What the owner reads on an agent approval (PAI-4 approve UI). Browser-safe:
 * pure functions, no database. Wording is plain; nothing here invents a figure.
 */
import type { ApprovalRow } from "./approvals.server";

export type ApprovalView = {
  id: string;
  /** The tool id, which the safety summary is computed from. */
  tool: string;
  title: string;
  /** The agent's own one-line summary of the exact action. */
  summary: string;
  /** Up to eight key/value lines of the exact arguments the owner is approving. */
  details: { label: string; value: string }[];
  hiddenDetailCount: number;
  expiresLabel: string;
  waiting: boolean;
  statusLabel: string;
};

const TOOL_LABELS: Record<string, string> = {
  send_sms: "Send a text message",
  send_email: "Send an email",
  send_quote: "Send a quote",
  send_review_request: "Ask for a review",
  post_campaign: "Send a campaign",
  create_campaign: "Send a campaign",
  reply_to_review: "Reply to a review",
};

const SENSITIVE_KEY = /token|secret|password|passwd|authorization|api[_-]?key|cookie|session/i;
const MAX_VALUE = 240;
const MAX_LINES = 8;

export function toolLabel(tool: string): string {
  const known = TOOL_LABELS[tool];
  if (known) return known;
  const words = tool.replace(/[_.-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Action";
}

function humanKey(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text =
    typeof value === "string"
      ? value
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_VALUE ? `${flat.slice(0, MAX_VALUE - 1)}…` : flat || "—";
}

/** The exact arguments, readable. Secret-looking keys show as hidden, never their value. */
export function argumentLines(args: Record<string, unknown>): {
  lines: { label: string; value: string }[];
  hidden: number;
} {
  const entries = Object.entries(args ?? {}).filter(([, value]) => value !== undefined);
  const lines = entries.slice(0, MAX_LINES).map(([key, value]) => ({
    label: humanKey(key),
    value: SENSITIVE_KEY.test(key) ? "(hidden)" : show(value),
  }));
  return { lines, hidden: Math.max(0, entries.length - MAX_LINES) };
}

export function expiresLabel(expiresAt: string, now = Date.now()): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours} h left` : `${Math.max(1, Math.round(ms / 60_000))} min left`;
}

const STATUS: Record<string, string> = {
  pending: "Waiting for you",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  consumed: "Done",
  cancelled: "Cancelled",
};

export function viewApproval(row: ApprovalRow, now = Date.now()): ApprovalView {
  const { lines, hidden } = argumentLines(row.args);
  const expired = row.status === "pending" && Date.parse(row.expires_at) <= now;
  return {
    id: row.id,
    tool: row.tool,
    title: toolLabel(row.tool),
    summary: row.summary,
    details: lines,
    hiddenDetailCount: hidden,
    expiresLabel: expiresLabel(row.expires_at, now),
    waiting: row.status === "pending" && !expired,
    statusLabel: expired ? STATUS["expired"]! : (STATUS[row.status] ?? row.status),
  };
}

/** Waiting items first, newest first; anything already decided or expired is left out. */
export function pendingApprovals(rows: ApprovalRow[], now = Date.now()): ApprovalView[] {
  return rows
    .filter((row) => row.status === "pending" && Date.parse(row.expires_at) > now)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((row) => viewApproval(row, now));
}
