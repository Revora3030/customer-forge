/**
 * Browser side of prospect preview telemetry. Sends tiny anonymous events with
 * navigator.sendBeacon (falling back to a keepalive fetch). Nothing is sent
 * until PreviewBeacon has decided this viewer is not the operator, and no
 * cookie or storage is used: the session id lives in this tab's memory only.
 */
import type { PreviewEventKind } from "@/lib/preview-telemetry";

export const PREVIEW_BEACON_PATH = "/api/public/preview-beacon";

let enabledToken: string | null = null;
let sessionId: string | null = null;
const sentOnce = new Set<string>();

function newSessionId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/** Turns sending on for this token (after the self-view check passed), or off with null. */
export function enablePreviewTelemetry(token: string | null) {
  enabledToken = token;
  if (token && !sessionId) sessionId = newSessionId();
}

export function previewTelemetryEnabled(token: string): boolean {
  return enabledToken === token;
}

/** Sends one event. No-op when telemetry is off for this token or the browser can't send. */
export function sendPreviewEvent(token: string, event: PreviewEventKind, page: string, ms = 0): void {
  if (typeof window === "undefined" || enabledToken !== token) return;
  const slug = page.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80) || "home";
  const body = JSON.stringify({ token, event, page: slug, ms: Math.max(0, Math.round(ms)), sid: sessionId });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // text/plain keeps the beacon a "simple" request (no preflight).
      if (navigator.sendBeacon(PREVIEW_BEACON_PATH, new Blob([body], { type: "text/plain" }))) return;
    }
    void fetch(PREVIEW_BEACON_PATH, { method: "POST", body, keepalive: true, credentials: "omit", headers: { "content-type": "text/plain" } }).catch(() => undefined);
  } catch {
    /* telemetry is best-effort */
  }
}

/** Sends an event at most once per page load (claim hover). */
export function sendPreviewEventOnce(token: string, event: PreviewEventKind, page: string): void {
  const key = `${token}|${event}|${page}`;
  if (sentOnce.has(key) || !previewTelemetryEnabled(token)) return;
  sentOnce.add(key);
  sendPreviewEvent(token, event, page);
}
