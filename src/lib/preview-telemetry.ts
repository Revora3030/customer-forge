/**
 * Prospect demo preview telemetry — the pure, browser-safe rules.
 *
 * A prospect's private /p/<token> preview reports a few anonymous events so
 * the operator can see whether the business actually looked at its demo:
 * a view per page load, a heartbeat with visible time, and the claim button
 * being hovered or clicked. No cookies are set and no personal data is sent:
 * the session id is a random per-tab value held in memory, and the server
 * stores only a keyed hash of the IP (for rate limiting), kept 90 days.
 *
 * The operator's own looks (signed in, inside the Jarvis preview frame, or a
 * link carrying `?preview`) are never counted.
 */

export const PREVIEW_EVENTS = ["view", "heartbeat", "claim_hover", "claim_click"] as const;
export type PreviewEventKind = (typeof PREVIEW_EVENTS)[number];

/** How often a visible preview reports time on page. */
export const HEARTBEAT_MS = 15_000;
/** Longest visible time one heartbeat may claim (a sleeping tab can't inflate time). */
export const MAX_HEARTBEAT_MS = 60_000;
/** Largest beacon body accepted, in bytes. */
export const MAX_BEACON_BYTES = 2_048;
/** Per token + IP hash: at most this many events in the window. */
export const BEACON_RATE_LIMIT = 120;
export const BEACON_RATE_WINDOW_MS = 10 * 60_000;
/** Raw events are deleted after this many days (see the migration's prune job). */
export const PREVIEW_EVENT_RETENTION_DAYS = 90;

export type PreviewBeacon = {
  token: string;
  event: PreviewEventKind;
  page: string;
  ms: number;
  sessionId: string | null;
};

const TOKEN = /^[A-Za-z0-9_-]{16,80}$/;
const PAGE = /^[a-z0-9-]{1,80}$/;
const SESSION = /^[A-Za-z0-9]{8,40}$/;

/** Validates one beacon body. Null for anything malformed (the endpoint answers 400). */
export function parsePreviewBeacon(raw: unknown): PreviewBeacon | null {
  let value = raw;
  if (typeof value === "string") {
    if (value.length > MAX_BEACON_BYTES) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const token = typeof row["token"] === "string" ? row["token"] : "";
  if (!TOKEN.test(token)) return null;
  const event = typeof row["event"] === "string" ? row["event"] : "";
  if (!(PREVIEW_EVENTS as readonly string[]).includes(event)) return null;
  const rawPage = typeof row["page"] === "string" && row["page"].trim() ? row["page"].trim().toLowerCase() : "home";
  if (!PAGE.test(rawPage)) return null;
  const ms = Number(row["ms"] ?? 0);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const sid = typeof row["sid"] === "string" ? row["sid"] : null;
  if (sid !== null && !SESSION.test(sid)) return null;
  return {
    token,
    event: event as PreviewEventKind,
    page: rawPage,
    // Only heartbeats carry time; it is clamped so one beat can't claim hours.
    ms: event === "heartbeat" ? Math.min(MAX_HEARTBEAT_MS, Math.round(ms)) : 0,
    sessionId: sid,
  };
}

/**
 * Whether this page view must not be counted: the operator signed in, the page
 * inside a frame (Jarvis's preview card, the phone view), or a link marked as
 * the operator's own (`?preview`, `?operator`, `?notrack`).
 */
export function skipPreviewTelemetry(input: { search: string; embedded: boolean; signedIn: boolean }): boolean {
  if (input.signedIn || input.embedded) return true;
  const params = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
  return ["preview", "operator", "notrack"].some((key) => params.has(key));
}

export type PreviewEventRow = {
  event: string;
  session_id: string | null;
  ip_hash: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type PreviewEngagement = {
  views: number;
  uniqueSessions: number;
  totalMs: number;
  claimHovers: number;
  claimClicks: number;
  lastSeenAt: string | null;
  /** True when more rows existed than were read, so the counts are lower bounds. */
  truncated: boolean;
};

export const EMPTY_ENGAGEMENT: PreviewEngagement = Object.freeze({
  views: 0,
  uniqueSessions: 0,
  totalMs: 0,
  claimHovers: 0,
  claimClicks: 0,
  lastSeenAt: null,
  truncated: false,
});

/** Folds stored events into the operator-facing numbers. */
export function aggregateEngagement(rows: PreviewEventRow[], truncated = false): PreviewEngagement {
  const sessions = new Set<string>();
  let views = 0;
  let totalMs = 0;
  let claimHovers = 0;
  let claimClicks = 0;
  let last = 0;
  let lastSeenAt: string | null = null;
  for (const row of rows) {
    const key = row.session_id ? `s:${row.session_id}` : row.ip_hash ? `i:${row.ip_hash}` : null;
    if (key) sessions.add(key);
    if (row.event === "view") views += 1;
    else if (row.event === "heartbeat") totalMs += Math.max(0, Math.min(MAX_HEARTBEAT_MS, Number(row.duration_ms) || 0));
    else if (row.event === "claim_hover") claimHovers += 1;
    else if (row.event === "claim_click") claimClicks += 1;
    const at = Date.parse(row.created_at);
    if (Number.isFinite(at) && at > last) {
      last = at;
      lastSeenAt = new Date(at).toISOString();
    }
  }
  return { views, uniqueSessions: sessions.size, totalMs, claimHovers, claimClicks, lastSeenAt, truncated };
}

/** Visible time in plain words: "45s", "4 min", "1 h 5 min". */
export function formatDuration(ms: number): string {
  const seconds = Math.round(Math.max(0, ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
