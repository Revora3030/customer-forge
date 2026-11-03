/**
 * BUILDER REQUEST HEALTH
 * ======================
 *
 * Pure summary of the owner's builder chat requests, worked out from rows the
 * platform already saves: the chat messages (by request id) and the live
 * progress steps (by run id). No extra writes; counts, timings and short
 * failure reasons only, never customer wording beyond the first error line.
 */

export interface RequestMessageRow {
  request_id: string | null;
  role: string;
  kind: string | null;
  content: string | null;
  plan: unknown;
  created_at: string;
}

export interface RequestProgressRow {
  run_id: string;
  stage: string;
  created_at: string;
}

export type RequestOutcome = "changed" | "answered" | "failed" | "no_reply";

export interface RequestTimeline {
  requestId: string;
  startedAt: string;
  totalSeconds: number | null;
  outcome: RequestOutcome;
  reason: string | null;
  stages: { stage: string; seconds: number }[];
}

export interface RequestHealthSummary {
  total: number;
  changed: number;
  answered: number;
  failed: number;
  noReply: number;
  successRate: number | null;
  medianSeconds: number | null;
  slowestSeconds: number | null;
  topReasons: { reason: string; count: number }[];
  recent: RequestTimeline[];
}

/** Progress run ids use "~" where chat request ids use "_" for retries. */
export function normaliseRequestId(id: string): string {
  return id.trim().replace(/~/g, "_");
}

const secondsBetween = (a: string, b: string) =>
  Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));

/** First line of an error, trimmed and capped, so similar failures group. */
export function reasonFrom(content: string | null): string {
  const line = String(content ?? "").split(/\n/)[0]!.replace(/\s+/g, " ").trim();
  return (line || "No reason given").slice(0, 90);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export function buildTimelines(
  messages: RequestMessageRow[],
  progress: RequestProgressRow[],
): RequestTimeline[] {
  const byRequest = new Map<string, RequestMessageRow[]>();
  for (const m of messages) {
    if (!m.request_id) continue;
    const id = normaliseRequestId(m.request_id);
    const list = byRequest.get(id) ?? [];
    list.push(m);
    byRequest.set(id, list);
  }
  const stagesBy = new Map<string, RequestProgressRow[]>();
  for (const p of progress) {
    const id = normaliseRequestId(p.run_id);
    const list = stagesBy.get(id) ?? [];
    list.push(p);
    stagesBy.set(id, list);
  }

  const out: RequestTimeline[] = [];
  for (const [requestId, rows] of byRequest) {
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const user = sorted.find((r) => r.role === "user");
    if (!user) continue;
    const replies = sorted.filter((r) => r.role === "assistant");
    const last = replies[replies.length - 1];
    const error = replies.find((r) => r.kind === "error");
    let outcome: RequestOutcome;
    if (!last) outcome = "no_reply";
    else if (error) outcome = "failed";
    else if (replies.some((r) => r.plan != null)) outcome = "changed";
    else outcome = "answered";

    const steps = [...(stagesBy.get(requestId) ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const end = last?.created_at ?? steps[steps.length - 1]?.created_at;
    const stages = steps.map((s, i) => ({
      stage: s.stage,
      seconds: secondsBetween(s.created_at, steps[i + 1]?.created_at ?? end ?? s.created_at),
    }));
    out.push({
      requestId,
      startedAt: user.created_at,
      totalSeconds: end ? secondsBetween(user.created_at, end) : null,
      outcome,
      reason: outcome === "failed" ? reasonFrom(error!.content) : null,
      stages,
    });
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function summariseRequests(timelines: RequestTimeline[], recent = 8): RequestHealthSummary {
  const count = (o: RequestOutcome) => timelines.filter((t) => t.outcome === o).length;
  const changed = count("changed");
  const answered = count("answered");
  const failed = count("failed");
  const noReply = count("no_reply");
  const finished = changed + answered + failed + noReply;
  const times = timelines.map((t) => t.totalSeconds).filter((v): v is number => v != null);
  const reasons = new Map<string, number>();
  for (const t of timelines) if (t.reason) reasons.set(t.reason, (reasons.get(t.reason) ?? 0) + 1);
  return {
    total: timelines.length,
    changed,
    answered,
    failed,
    noReply,
    successRate: finished ? Math.round(((changed + answered) / finished) * 100) : null,
    medianSeconds: median(times),
    slowestSeconds: times.length ? Math.max(...times) : null,
    topReasons: [...reasons]
      .map(([reason, n]) => ({ reason, count: n }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    recent: timelines.slice(0, recent),
  };
}
