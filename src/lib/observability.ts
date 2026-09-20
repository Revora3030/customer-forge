/**
 * REVORA OBSERVABILITY — plain-language translation of real system activity.
 *
 * Pure functions only: they take rows that were actually read from the database
 * and turn them into something a business owner understands. Nothing here
 * invents an event, and an empty input always produces an empty timeline —
 * never a reassuring fake "all systems normal" entry.
 */

export type ActivityKind = "build" | "automation" | "system";
export type ActivityLevel = "ok" | "working" | "problem";

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  level: ActivityLevel;
  /** What happened, in the owner's language. */
  title: string;
  /** The real detail behind it, when there is one. */
  detail?: string;
  at: string;
  /** Where the owner goes to act on it. */
  to?: string;
};

export type GenerationJobRow = {
  id: string;
  status: string;
  progress: number;
  current_step: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AutomationRunRow = {
  id: string;
  action_type: string;
  status: string;
  trigger_event: string;
  recipient: string | null;
  scheduled_for: string;
  sent_at: string | null;
};

export type AuditRow = {
  id: string;
  action: string;
  entity: string | null;
  created_at: string;
};

const jobLevel = (status: string): ActivityLevel =>
  status === "failed" ? "problem" : status === "completed" ? "ok" : "working";

const jobTitle = (job: GenerationJobRow): string => {
  if (job.status === "completed") return "Revora finished building your website";
  if (job.status === "failed") return "A website build did not finish";
  if (job.status === "running") return `Revora is building your website (${job.progress}%)`;
  if (job.status === "queued") return "A website build is waiting to start";
  return `Website build: ${job.status}`;
};

/** Human label for an automation action, without pretending it was delivered. */
const automationTitle = (run: AutomationRunRow): string => {
  const what =
    run.action_type === "email"
      ? "Email"
      : run.action_type === "sms"
        ? "Text message"
        : run.action_type === "task"
          ? "Follow-up task"
          : run.action_type;
  if (run.status === "sent") return `${what} sent`;
  if (run.status === "failed") return `${what} could not be sent`;
  if (run.status === "cancelled") return `${what} cancelled`;
  return `${what} scheduled`;
};

const automationLevel = (status: string): ActivityLevel =>
  status === "failed" ? "problem" : status === "sent" ? "ok" : "working";

const AUDIT_LABELS: Record<string, string> = {
  "billing.lifecycle": "Billing update processed",
  "website.published": "Website published",
  "publish.blocked": "A publish was stopped before it went live",
  publish_blocked: "A publish was stopped before it went live",
  "domain.verified": "Domain verified",
  "selfheal.applied": "Revora repaired part of your site",
  "selfheal.rolled_back": "A repair was undone and your site restored",
};

/**
 * Audit actions are recorded in whatever case the writing code used, so every
 * lookup and every level check normalises first. A blocked action must never be
 * presented as a success.
 */
const auditKey = (action: string): string => action.trim().toLowerCase();

const auditTitle = (row: AuditRow): string => {
  const key = auditKey(row.action);
  return (
    AUDIT_LABELS[key] ??
    key.replace(/[._]/g, " ").replace(/^\w/, (c: string) => c.toUpperCase())
  );
};

const auditLevel = (action: string): ActivityLevel =>
  /fail|error|rolled_back|declin|past_due|block|denied|reject|refus|unauthori/.test(auditKey(action))
    ? "problem"
    : "ok";

/**
 * Merges the three real activity sources into one newest-first timeline.
 * Sources that could not be read should be passed as empty arrays — the
 * timeline then simply shows less, rather than anything untrue.
 */
export function buildTimeline(input: {
  jobs: GenerationJobRow[];
  runs: AutomationRunRow[];
  audits: AuditRow[];
  limit?: number;
}): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const job of input.jobs) {
    events.push({
      id: `job:${job.id}`,
      kind: "build",
      level: jobLevel(job.status),
      title: jobTitle(job),
      ...(job.error_message
        ? { detail: job.error_message }
        : job.current_step && job.status === "running"
          ? { detail: job.current_step }
          : {}),
      at: job.completed_at ?? job.created_at,
      to: "/app/website",
    });
  }

  for (const run of input.runs) {
    events.push({
      id: `run:${run.id}`,
      kind: "automation",
      level: automationLevel(run.status),
      title: automationTitle(run),
      ...(run.recipient ? { detail: `To ${run.recipient} — ${run.trigger_event}` } : {}),
      at: run.sent_at ?? run.scheduled_for,
      to: "/app/automations",
    });
  }

  for (const row of input.audits) {
    events.push({
      id: `audit:${row.id}`,
      kind: "system",
      level: auditLevel(row.action),
      title: auditTitle(row),
      at: row.created_at,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return typeof input.limit === "number" ? events.slice(0, input.limit) : events;
}

export type SystemHealth = {
  /** Real counts behind the headline. */
  problems: number;
  working: number;
  /** One honest sentence for the owner. */
  summary: string;
};

/** Summarises a timeline without ever claiming health it can't see. */
export function systemHealth(events: ActivityEvent[]): SystemHealth {
  if (events.length === 0) {
    return {
      problems: 0,
      working: 0,
      summary: "No activity recorded yet, so there is nothing to report.",
    };
  }
  const problems = events.filter((e) => e.level === "problem").length;
  const working = events.filter((e) => e.level === "working").length;
  const summary =
    problems > 0
      ? `${problems} recent ${problems === 1 ? "item needs" : "items need"} attention.`
      : working > 0
        ? `${working} ${working === 1 ? "job is" : "jobs are"} still in progress. Nothing has failed.`
        : "Everything recorded recently completed successfully.";
  return { problems, working, summary };
}
