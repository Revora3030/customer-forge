/**
 * The build's work log, shown in the chat the way a coding agent shows its
 * work: every step, how long it took, which models answered, and the pictures
 * as they land. Pure and browser-safe. Every row comes from something the
 * server recorded (generation_jobs, builder_progress, ai_generations,
 * image_records); nothing here is guessed, and a stage with no recorded detail
 * shows no detail.
 */
import { GENERATION_STEPS } from "@/lib/site-engine";
import { teamModelName } from "@/lib/ai-team-public";
import { MAX_BUILD_ATTEMPTS, isRetryWait } from "@/lib/builder/job-liveness";

export type FeedJob = {
  id?: string | null;
  status?: string | null;
  current_step?: string | null;
  progress?: number | null;
  steps?: unknown;
  stage_timings?: unknown;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  section_checkpoints?: unknown;
  /** The brand identity the AI team authored, once that stage has finished (stage_checkpoints.stages.identity.value). */
  look?: unknown;
  /** Attempts the worker has made so far; a retry's row keeps the build's original created_at. */
  attempts?: number | null;
  failure_kind?: string | null;
  lease_expires_at?: string | null;
  updated_at?: string | null;
};
export type FeedProgressRow = { stage: string; detail: string | null; at: string };
export type FeedGeneration = { kind: string; model: string | null; created_at: string; message?: string | null; status?: string | null };
export type FeedImage = { id: string; slot: string | null; status: string; url: string | null; at: string };

export type ModelCount = { name: string; count: number };
export type WorkItem = { kind: string; label: string; models: ModelCount[]; calls: number; note: string | null; offsetMs: number | null };
export type StageState = "done" | "running" | "pending" | "failed" | "cancelled";
export type WorkStage = { key: string; label: string; state: StageState; durationMs: number | null };

export type WorkFeed = {
  state: "none" | "queued" | "running" | "done" | "failed" | "cancelled";
  /** What is happening now, or how it ended. */
  headline: string;
  percent: number | null;
  elapsedMs: number | null;
  stages: WorkStage[];
  /** The AI calls recorded for this build, in the order they happened. */
  ai: WorkItem[];
  aiCalls: number;
  pictures: FeedImage[];
  /** Sections laid out so far while layouts run; null when not recorded. */
  sectionsDone: number | null;
  /** The look the AI team chose, as soon as it exists; null before then. */
  look: FeedLook | null;
  /** Finished section designs so far, in the order they were accepted, with the words they open with. */
  sections: FeedSection[];
  /** Past tense: "Worked for 7m 21s · 14 steps · 9 AI calls". Empty until it has ended. */
  summary: string;
};

const PRESENT: Record<string, string> = {
  business: "Reading your business",
  services: "Reading your services",
  brand: "Designing your brand identity",
  analysis: "Working out your customers and conversion path",
  structure: "Planning the page layout",
  copy: "Writing the pages",
  conversion: "Checking conversion paths",
  pictures: "Making your pictures",
  pages: "Assembling your pages",
  wording: "Reviewing every section's wording",
  layout: "Composing each section's layout",
  checks: "Checking links, mobile and quality",
  leads: "Connecting lead capture",
  ready: "Preparing your preview",
};

/** Only the first-build AI work is shown; other rows (attempt markers, plans) are bookkeeping. */
const KIND_LABELS: Record<string, string> = {
  collective_first_build: "Creative direction",
  ai_page_architecture: "Page architecture",
  first_build_images: "Pictures",
  collective_section_wording: "Section wording",
  first_build_compositions: "Section layouts",
  first_build_chrome: "Header and footer",
};

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return "<1s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** "lovable · openai/gpt-6.1-sol+lovable · anthropic/claude-sonnet-5" -> counted display names, most used first. */
export function parseModels(raw: string | null | undefined): ModelCount[] {
  if (!raw) return [];
  const counts = new Map<string, number>();
  for (const part of raw.split("+")) {
    const id = part.split("·").pop()?.trim() ?? "";
    if (!id || !/^[a-z0-9.-]+\/[\w.-]+$/i.test(id)) continue;
    const name = teamModelName(id);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const timings = (value: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (value && typeof value === "object") for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  return out;
};
const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** The brand identity as the owner can see it: three colours, a typeface and the mood in one line. */
export type FeedLook = { name: string | null; mood: string | null; font: string | null; colors: string[] };
/** One finished section: the heading it opens with and the first line of its copy. */
export type FeedSection = { headline: string; blurb: string | null };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const plain = (value: unknown, max: number): string | null => {
  // eslint-disable-next-line no-control-regex -- strips control characters from stored text
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "";
  return text ? (text.length > max ? `${text.slice(0, max - 1)}…` : text) : null;
};

/**
 * The authored look from the saved brand identity stage. Only colours that are
 * plain hex are kept, so a stored value can never put anything else in a style.
 */
export function readLook(value: unknown): FeedLook | null {
  const raw = isRecord(value) && isRecord(value["direction"]) ? value["direction"] : value;
  if (!isRecord(raw)) return null;
  const colors = [raw["primary"], raw["secondary"], raw["accent"]].filter((c): c is string => typeof c === "string" && HEX.test(c.trim())).map((c) => c.trim());
  const name = plain(raw["name"], 60);
  // A pair is stored as "Heading face|Body face".
  const font = plain(typeof raw["font"] === "string" ? raw["font"].replace(/\s*\|\s*/g, " + ") : null, 80);
  if (!colors.length && !name && !font) return null;
  return { name, mood: plain(raw["mood"], 200), font, colors };
}

/**
 * The first heading in a composition tree (depth-first, bounded) and the first
 * line of body text after it. A small line above the heading (an eyebrow) is
 * only used when the section has no heading.
 */
function firstWords(tree: unknown): { heading: string | null; text: string | null } {
  let heading: string | null = null;
  let after: string | null = null;
  let first: string | null = null;
  let visited = 0;
  const visit = (node: unknown, depth: number) => {
    if (!isRecord(node) || depth > 8 || visited > 300 || (heading && after)) return;
    visited += 1;
    if (!heading && node["type"] === "heading") heading = plain(node["text"], 90);
    else if (node["type"] === "text") {
      const line = plain(node["text"], 140);
      first ??= line;
      if (heading) after ??= line;
    }
    if (Array.isArray(node["children"])) for (const child of node["children"]) visit(child, depth + 1);
  };
  visit(isRecord(tree) ? tree["root"] : null, 0);
  return { heading, text: heading ? after : first };
}

/** Finished section designs from the job's checkpoint, oldest first. A section with no words of its own is left out. */
export function sectionOutline(checkpoint: unknown): FeedSection[] {
  const sections = isRecord(checkpoint) && isRecord(checkpoint["sections"]) ? Object.values(checkpoint["sections"]) : [];
  return sections
    .filter(isRecord)
    .sort((a, b) => (ms(typeof a["at"] === "string" ? a["at"] : null) ?? 0) - (ms(typeof b["at"] === "string" ? b["at"] : null) ?? 0))
    .flatMap((entry) => {
      const { heading, text } = firstWords(entry["tree"]);
      const headline = heading ?? text;
      return headline ? [{ headline, blurb: heading && text ? text : null }] : [];
    })
    .slice(0, 24);
}

function sectionCount(value: unknown): number | null {
  const sections = (value as { sections?: unknown } | null)?.sections;
  return sections && typeof sections === "object" ? Object.keys(sections as object).length : null;
}

const oneLine = (text: string | null | undefined, max: number) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * What a build says while it waits to try again. The saved design work is kept
 * between attempts, so the owner is told that, and why the last attempt
 * stopped in plain words (never the raw error).
 */
export function retryHeadline(job: Pick<FeedJob, "attempts" | "failure_kind" | "error_message">): string {
  const attempts = Math.max(0, Number(job.attempts ?? 0));
  const next = Math.min(MAX_BUILD_ATTEMPTS, attempts + 1);
  const why =
    job.failure_kind === "provider" ? "an AI model was slow to answer" :
    job.failure_kind ? "the last attempt hit a problem" :
    "the build is continuing in its next run";
  return attempts > 0
    ? `Retrying (attempt ${next} of ${MAX_BUILD_ATTEMPTS}) — ${why}. Your saved design work is kept.`
    : `Continuing — ${why}. Your saved design work is kept.`;
}

export function buildWorkFeed(input: {
  job: FeedJob | null | undefined;
  progress: readonly FeedProgressRow[];
  generations: readonly FeedGeneration[];
  images: readonly FeedImage[];
  now: number;
}): WorkFeed {
  const { job } = input;
  if (!job) {
    return { state: "none", headline: "", percent: null, elapsedMs: null, stages: [], ai: [], aiCalls: 0, pictures: [], sectionsDone: null, look: null, sections: [], summary: "" };
  }
  const status = job.status ?? "";
  const active = status === "queued" || status === "processing";
  const state: WorkFeed["state"] = status === "queued" ? "queued" : status === "processing" ? "running" : status === "completed" ? "done" : status === "failed" ? "failed" : status === "cancelled" ? "cancelled" : "none";
  const doneKeys = new Set(stringList(job.steps));
  const spent = timings(job.stage_timings);
  const firstOpen = GENERATION_STEPS.find((s) => !doneKeys.has(s.key))?.key ?? null;

  const stages: WorkStage[] = GENERATION_STEPS.map((step) => {
    if (doneKeys.has(step.key)) return { key: step.key, label: step.label, state: "done", durationMs: spent[step.key] ?? null };
    if (step.key === firstOpen && active) return { key: step.key, label: PRESENT[step.key] ?? step.label, state: "running", durationMs: null };
    if (step.key === firstOpen && state === "failed") return { key: step.key, label: PRESENT[step.key] ?? step.label, state: "failed", durationMs: null };
    if (step.key === firstOpen && state === "cancelled") return { key: step.key, label: PRESENT[step.key] ?? step.label, state: "cancelled", durationMs: null };
    return { key: step.key, label: step.label, state: "pending", durationMs: null };
  });

  // Counted from when the build was asked for: a retry resets started_at, which
  // made the clock fall back to "<1s" halfway through a long build.
  const start = ms(job.created_at) ?? ms(job.started_at);
  const end = ms(job.completed_at);
  const elapsedMs = start == null ? null : Math.max(0, (active ? input.now : (end ?? input.now)) - start);

  const ai: WorkItem[] = [];
  for (const row of input.generations) {
    const label = KIND_LABELS[row.kind];
    if (!label) continue;
    const models = parseModels(row.model);
    const calls = models.reduce((sum, m) => sum + m.count, 0);
    const at = ms(row.created_at);
    // A picture row names the picture models; a failed or skipped one says so in plain words.
    const note = row.kind === "first_build_images" ? oneLine(row.message, 140) || null : null;
    ai.push({ kind: row.kind, label, models, calls, note, offsetMs: at != null && start != null ? Math.max(0, at - start) : null });
  }
  ai.sort((a, b) => (a.offsetMs ?? 0) - (b.offsetMs ?? 0));
  const aiCalls = ai.reduce((sum, item) => sum + item.calls, 0);

  // The newest step; "model at work" rows only say which model just answered.
  const latest = input.progress.find((row) => row.stage !== "model at work");
  const runningStage = stages.find((s) => s.state === "running");
  const live = latest ? oneLine(latest.detail ? `${latest.stage} — ${latest.detail}` : latest.stage, 120) : "";
  const headline =
    state === "running" ? live || (runningStage?.label ?? "Working on your website") :
    state === "queued" ? (isRetryWait(job) ? retryHeadline(job) : "Queued — the builder picks up new jobs within a few seconds") :
    state === "done" ? "Your draft is ready" :
    state === "failed" ? `Stopped at: ${stages.find((s) => s.state === "failed")?.label.toLowerCase() ?? "the build"}` :
    state === "cancelled" ? "The build was stopped before it finished" : "";

  const doneCount = stages.filter((s) => s.state === "done").length;
  const summary =
    state === "done" || state === "failed" || state === "cancelled"
      ? [elapsedMs != null ? `${state === "done" ? "Worked" : "Ran"} for ${formatDuration(elapsedMs)}` : "", `${doneCount} step${doneCount === 1 ? "" : "s"}`, aiCalls ? `${aiCalls} AI call${aiCalls === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")
      : "";

  const pictures = [...input.images].filter((img) => img.url).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    state,
    headline,
    percent: typeof job.progress === "number" ? Math.max(0, Math.min(100, Math.round(job.progress))) : null,
    elapsedMs,
    stages,
    ai,
    aiCalls,
    pictures,
    sectionsDone: runningStage?.key === "layout" ? sectionCount(job.section_checkpoints) : null,
    // Both are cleared by the worker when the build completes, so they only show while there is work in flight.
    look: active || state === "failed" ? readLook(job.look) : null,
    sections: active || state === "failed" ? sectionOutline(job.section_checkpoints) : [],
    summary,
  };
}

export type TimedStep = { stage: string; detail: string | null; at: string; durationMs: number | null };

/**
 * Recorded steps (newest first, as the progress query returns them) as an
 * oldest-first list with how long each took: the gap to the step that followed
 * it. The newest step is still running, so it has no duration. A stage that
 * repeats is listed once, at its first appearance.
 */
export function timedSteps(rows: readonly FeedProgressRow[]): TimedStep[] {
  const chronological = [...rows].reverse();
  const out: TimedStep[] = [];
  chronological.forEach((row, index) => {
    if (out.some((step) => step.stage === row.stage)) return;
    // The next row of a different stage: a repeat of this stage is not the step that followed it.
    const next = chronological.slice(index + 1).find((later) => later.stage !== row.stage);
    const from = Date.parse(row.at);
    const to = next ? Date.parse(next.at) : NaN;
    out.push({ stage: row.stage, detail: row.detail, at: row.at, durationMs: Number.isFinite(from) && Number.isFinite(to) && to >= from ? to - from : null });
  });
  return out;
}

/** The models the planner asked, in order, each once ("openai · gpt-6.1-sol" -> "GPT 6.1 Sol"). */
export function modelsAsked(rows: readonly FeedProgressRow[]): string[] {
  const seen: string[] = [];
  for (const row of [...rows].reverse()) {
    if (row.stage !== "model at work" || !row.detail) continue;
    const name = parseModels(row.detail.includes("/") ? row.detail : "")[0]?.name;
    const label = name ?? row.detail;
    if (!seen.includes(label)) seen.push(label);
  }
  return seen;
}
