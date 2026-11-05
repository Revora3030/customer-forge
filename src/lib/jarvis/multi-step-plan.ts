/**
 * JC-33 / JC-34: multi-step plan metadata for Jarvis chat.
 *
 * Planning only — nothing here mutates a site, sends mail, or opens a PR.
 * Write/send steps still go through PAI-4 approval cards after the owner
 * approves the plan. City/business facts are never invented: titles come from
 * recorded tool ids and labels the server already produced.
 *
 * Persistence:
 * - Plan definition rides in the saved message as <jarvis-plan>…</jarvis-plan>
 *   (same pattern as <jarvis-meta>), so it survives reload on every device.
 * - Decision + per-step progress live in localStorage keyed by message id,
 *   with honest "saved on this device" copy in the UI (no new table).
 */
import { JARVIS_ACTION_CLASSES, type WriteProposal } from "@/lib/jarvis-actions";

export type PlanStepEffect = "read" | "write" | "destructive" | "memory";
export type PlanStepStatus = "pending" | "doing" | "done" | "failed" | "skipped" | "cancelled";
export type PlanDecision = "awaiting" | "approved" | "cancelled" | "editing";

export type PlanStep = {
  id: string;
  /** 1-based number shown in the card. */
  index: number;
  title: string;
  toolId: string | null;
  effect: PlanStepEffect;
  /** True when the step writes/sends and still needs its own PAI-4 approval. */
  requiresApproval: boolean;
  status: PlanStepStatus;
};

export type MultiStepPlan = {
  version: 1;
  steps: PlanStep[];
};

export type PlanProgress = {
  decision: PlanDecision;
  stepStatus: Record<string, PlanStepStatus>;
  /** 0-based index to resume from after a failure; null when none. */
  resumeFrom: number | null;
  updatedAt: string;
};

export type PlanStepInput = {
  toolId: string | null;
  title: string;
  /** Recorded outcome when known (reads that already ran). */
  status?: PlanStepStatus;
};

export const PLAN_PROGRESS_KEY = "jarvis:plan-progress";
export const MAX_PLAN_PROGRESS = 100;
/** A plan card is only shown when there are at least this many steps. */
export const MIN_PLAN_STEPS = 2;

const PLAN_PATTERN = /<jarvis-plan>([\s\S]*?)<\/jarvis-plan>/i;
const WRITE_TITLES: Record<string, string> = {
  "research.ask": "Paid web research",
  "demo.build": "Build a demo site",
  "demo.send": "Send the demo",
  "code.pr": "Open a pull request",
  "claude.code": "Hand off to Claude Code",
  "claude.fix": "Ask Claude Code to fix a PR",
  "builds.recover": "Restart stalled builds",
  "autopilot.configure": "Update prospect autopilot",
  "autopilot.run": "Run prospect autopilot",
  "memory.forget": "Forget a saved memory",
  "routine.create": "Create a scheduled routine",
  "routine.update": "Update a scheduled routine",
  "routine.delete": "Delete a scheduled routine",
  "instagram.post": "Save an Instagram draft",
  "image.create": "Create an AI picture",
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function effectOf(toolId: string | null): PlanStepEffect {
  if (!toolId) return "read";
  const cls = (JARVIS_ACTION_CLASSES as Record<string, { effect: PlanStepEffect } | undefined>)[toolId];
  return cls?.effect ?? "read";
}

function titleForWrite(proposal: WriteProposal): string {
  return WRITE_TITLES[proposal.id] ?? proposal.id.replace(/[._]/g, " ");
}

/** Builds a numbered plan from recorded reads + write proposals. No invented facts. */
export function buildMultiStepPlan(input: {
  reads?: PlanStepInput[];
  proposals?: WriteProposal[];
}): MultiStepPlan | null {
  const steps: PlanStep[] = [];
  for (const read of input.reads ?? []) {
    const title = read.title.trim().slice(0, 160);
    if (!title) continue;
    const effect = effectOf(read.toolId);
    steps.push({
      id: `r${steps.length + 1}-${read.toolId ?? "read"}`,
      index: steps.length + 1,
      title,
      toolId: read.toolId,
      effect,
      requiresApproval: effect === "write" || effect === "destructive",
      status: read.status ?? "done",
    });
  }
  for (const proposal of input.proposals ?? []) {
    const effect = effectOf(proposal.id);
    steps.push({
      id: `w${steps.length + 1}-${proposal.id}`,
      index: steps.length + 1,
      title: titleForWrite(proposal),
      toolId: proposal.id,
      effect,
      requiresApproval: true,
      status: "pending",
    });
  }
  if (steps.length < MIN_PLAN_STEPS) return null;
  return { version: 1, steps: steps.slice(0, 12) };
}

export function appendJarvisPlan(reply: string, plan: MultiStepPlan | null): string {
  if (!plan || plan.steps.length < MIN_PLAN_STEPS) return reply;
  const payload = JSON.stringify({
    version: 1 as const,
    steps: plan.steps.map((step) => ({
      id: step.id,
      index: step.index,
      title: step.title.slice(0, 160),
      toolId: step.toolId,
      effect: step.effect,
      requiresApproval: step.requiresApproval,
      status: step.status,
    })),
  });
  return `${reply}\n<jarvis-plan>${payload}</jarvis-plan>`;
}

export function splitJarvisPlan(content: string): { body: string; plan: MultiStepPlan | null } {
  const match = content.match(PLAN_PATTERN);
  const body = content.replace(/<jarvis-plan>[\s\S]*?<\/jarvis-plan>/gi, "").trim();
  if (!match) return { body, plan: null };
  try {
    const parsed = JSON.parse(match[1] ?? "") as Partial<MultiStepPlan>;
    if (parsed.version !== 1 || !Array.isArray(parsed.steps)) return { body, plan: null };
    const steps: PlanStep[] = [];
    for (const raw of parsed.steps.slice(0, 12)) {
      if (!raw || typeof raw !== "object") continue;
      const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 160) : "";
      if (!title) continue;
      const effect: PlanStepEffect =
        raw.effect === "write" || raw.effect === "destructive" || raw.effect === "memory" || raw.effect === "read"
          ? raw.effect
          : "read";
      const status: PlanStepStatus =
        raw.status === "doing" || raw.status === "done" || raw.status === "failed" || raw.status === "skipped" || raw.status === "cancelled" || raw.status === "pending"
          ? raw.status
          : "pending";
      const toolId = typeof raw.toolId === "string" && raw.toolId.length <= 80 ? raw.toolId : null;
      steps.push({
        id: typeof raw.id === "string" && raw.id.length <= 80 ? raw.id : `s${steps.length + 1}`,
        index: steps.length + 1,
        title,
        toolId,
        effect,
        requiresApproval: Boolean(raw.requiresApproval) || effect === "write" || effect === "destructive",
        status,
      });
    }
    if (steps.length < MIN_PLAN_STEPS) return { body, plan: null };
    return { body, plan: { version: 1, steps } };
  } catch {
    return { body, plan: null };
  }
}

/** Merges saved progress onto the plan's recorded step statuses. */
export function derivePlanSteps(plan: MultiStepPlan, progress: PlanProgress | null): PlanStep[] {
  return plan.steps.map((step) => {
    const override = progress?.stepStatus[step.id];
    return override ? { ...step, status: override } : step;
  });
}

export function progressSummary(steps: PlanStep[]): {
  doneCount: number;
  total: number;
  doing: PlanStep | null;
  next: PlanStep | null;
  failed: PlanStep | null;
} {
  const doneCount = steps.filter((step) => step.status === "done" || step.status === "skipped").length;
  const failed = steps.find((step) => step.status === "failed") ?? null;
  const doing = steps.find((step) => step.status === "doing") ?? null;
  const next = steps.find((step) => step.status === "pending") ?? null;
  return { doneCount, total: steps.length, doing, next, failed };
}

/**
 * Resume is allowed only from a failed step when no later write has already
 * finished (never duplicate a completed write). Reads and failed writes that
 * never reached "done" are retryable.
 */
export function resumeEligibility(steps: PlanStep[]): {
  canResume: boolean;
  fromIndex: number | null;
  reason: string;
} {
  const failedIndex = steps.findIndex((step) => step.status === "failed");
  if (failedIndex < 0) {
    return { canResume: false, fromIndex: null, reason: "Nothing failed — nothing to resume." };
  }
  const laterWriteDone = steps
    .slice(failedIndex + 1)
    .some((step) => step.requiresApproval && step.status === "done");
  if (laterWriteDone) {
    return {
      canResume: false,
      fromIndex: null,
      reason: "A later write already finished. Resume is blocked so that write is not duplicated.",
    };
  }
  const failed = steps[failedIndex]!;
  if (failed.status === "done") {
    return { canResume: false, fromIndex: null, reason: "That step already finished." };
  }
  return {
    canResume: true,
    fromIndex: failedIndex,
    reason: `Queued, will apply next from step ${failedIndex + 1}: ${failed.title}`,
  };
}

/** Marks steps before resumeFrom as done/skipped, failed as pending, later pending stay. */
export function applyResume(steps: PlanStep[], fromIndex: number): PlanStep[] {
  return steps.map((step, index) => {
    if (index < fromIndex) {
      if (step.status === "failed") return { ...step, status: "skipped" };
      return step.status === "pending" || step.status === "doing" ? { ...step, status: "done" } : step;
    }
    if (index === fromIndex) return { ...step, status: "pending" };
    if (step.status === "doing") return { ...step, status: "pending" };
    return step;
  });
}

type ProgressStore = Record<string, PlanProgress>;

function cleanStore(value: unknown): ProgressStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ProgressStore = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<PlanProgress>;
    const decision: PlanDecision =
      raw.decision === "approved" || raw.decision === "cancelled" || raw.decision === "editing" || raw.decision === "awaiting"
        ? raw.decision
        : "awaiting";
    const stepStatus: Record<string, PlanStepStatus> = {};
    if (raw.stepStatus && typeof raw.stepStatus === "object") {
      for (const [id, status] of Object.entries(raw.stepStatus as Record<string, unknown>)) {
        if (
          status === "pending" ||
          status === "doing" ||
          status === "done" ||
          status === "failed" ||
          status === "skipped" ||
          status === "cancelled"
        ) {
          stepStatus[id] = status;
        }
      }
    }
    out[key] = {
      decision,
      stepStatus,
      resumeFrom: typeof raw.resumeFrom === "number" && raw.resumeFrom >= 0 ? Math.floor(raw.resumeFrom) : null,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    };
  }
  const entries = Object.entries(out);
  if (entries.length <= MAX_PLAN_PROGRESS) return out;
  return Object.fromEntries(entries.slice(entries.length - MAX_PLAN_PROGRESS));
}

export function readPlanProgress(messageId: string, storage: StorageLike | null = defaultStorage()): PlanProgress | null {
  if (!storage || !messageId) return null;
  try {
    const raw = storage.getItem(PLAN_PROGRESS_KEY);
    if (!raw) return null;
    return cleanStore(JSON.parse(raw))[messageId] ?? null;
  } catch {
    return null;
  }
}

export function writePlanProgress(
  messageId: string,
  progress: PlanProgress,
  storage: StorageLike | null = defaultStorage(),
): PlanProgress {
  const next = { ...progress, updatedAt: progress.updatedAt || new Date().toISOString() };
  if (!storage || !messageId) return next;
  try {
    const current = cleanStore(JSON.parse(storage.getItem(PLAN_PROGRESS_KEY) ?? "{}"));
    delete current[messageId];
    const store = cleanStore({ ...current, [messageId]: next });
    storage.setItem(PLAN_PROGRESS_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable or full */
  }
  return next;
}

export function effectLabel(effect: PlanStepEffect): string {
  switch (effect) {
    case "read":
      return "Read";
    case "memory":
      return "Remember";
    case "write":
      return "Write";
    case "destructive":
      return "Destructive";
  }
}
