/**
 * FIRST-BUILD SECTION CHECKPOINTS.
 *
 * A first build designs every content section with the AI team. When one free
 * provider times out or answers with broken JSON late in the layout stage, the
 * attempt fails and the job is retried. Without a checkpoint the retry had to
 * ask the AI team for every section again, so a site that was 90% designed
 * started from zero and often hit the same wall.
 *
 * Accepted section designs are stored on the job row
 * (generation_jobs.section_checkpoints) as soon as each chunk passes the
 * composition safety validator and widget checks. A retry, lease recovery or
 * capacity deferral of the SAME job reloads them and only asks the AI team for
 * the sections that are still missing.
 *
 * Nothing here makes a creative choice: every stored tree was authored by the
 * AI team and accepted by the validator, and a restored tree is validated
 * again before it is used. A checkpoint is only reused when its digest of the
 * build's inputs (the authored look, the fact sheet, and each section's own
 * material) matches exactly; anything else is discarded.
 *
 * The digest is a content hash for cache matching only. It carries no design
 * meaning and is never used to pick or seed a look.
 */

import { noteProgress } from "./no-progress";
export const SECTION_CHECKPOINT_VERSION = 1;

export type SectionCheckpointEntry = {
  /** The AI-authored, validator-accepted composition tree. */
  tree: unknown;
  /** mediaRef (component id at the time) -> stored media path, for remapping. */
  media: Record<string, string>;
  at: string;
};

export type SectionCheckpoint = {
  version: typeof SECTION_CHECKPOINT_VERSION;
  jobId: string;
  /** Digest of the run-level inputs (look summary, facts, depth direction). */
  digest: string;
  /** Keyed by the digest of each section's own material. */
  sections: Record<string, SectionCheckpointEntry>;
  updatedAt: string;
};

/** Where a job's checkpoint lives. Every call is best-effort and never throws. */
export type SectionCheckpointStore = {
  load: () => Promise<unknown>;
  save: (value: SectionCheckpoint | null) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** JSON with object keys sorted at every level, so equal inputs hash equally. */
export function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

/** 53-bit string hash (cyrb53); runtime-neutral, no node:crypto needed. */
function cyrb53(text: string, salt: number): number {
  let h1 = 0xdeadbeef ^ salt;
  let h2 = 0x41c6ce57 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Content digest of any JSON-like input (two independent 53-bit hashes). */
export function inputDigest(value: unknown): string {
  const text = stableJson(value);
  return `${cyrb53(text, 1).toString(16).padStart(14, "0")}${cyrb53(text, 7).toString(16).padStart(14, "0")}`;
}

/**
 * Reads a stored checkpoint for this job and run digest. Returns the usable
 * entries (only those whose section digest is in the current plan) and
 * whether a stored value had to be discarded because it no longer matches.
 */
export function readSectionCheckpoint(
  raw: unknown,
  expected: { jobId: string; digest: string; sectionDigests: Iterable<string> },
): { entries: Map<string, SectionCheckpointEntry>; discarded: boolean } {
  const entries = new Map<string, SectionCheckpointEntry>();
  if (raw === null || raw === undefined) return { entries, discarded: false };
  if (
    !isRecord(raw) ||
    raw["version"] !== SECTION_CHECKPOINT_VERSION ||
    raw["jobId"] !== expected.jobId ||
    raw["digest"] !== expected.digest ||
    !isRecord(raw["sections"])
  ) {
    return { entries, discarded: true };
  }
  const wanted = new Set(expected.sectionDigests);
  const sections = raw["sections"] as Record<string, unknown>;
  for (const [key, value] of Object.entries(sections)) {
    if (!wanted.has(key) || !isRecord(value) || !isRecord(value["tree"])) continue;
    const media: Record<string, string> = {};
    if (isRecord(value["media"])) {
      for (const [ref, url] of Object.entries(value["media"])) if (typeof url === "string") media[ref] = url;
    }
    entries.set(key, { tree: value["tree"], media, at: typeof value["at"] === "string" ? value["at"] : "" });
  }
  return { entries, discarded: false };
}

/**
 * Rewrites a stored tree's media references to the current component ids,
 * matched by the stored media path. Returns null when a stored picture has no
 * current counterpart (the entry is then not reusable).
 */
export function remapMediaRefs(
  tree: unknown,
  storedMedia: Record<string, string>,
  currentRefByUrl: Map<string, string>,
): unknown | null {
  const replace = new Map<string, string>();
  for (const [oldRef, url] of Object.entries(storedMedia)) {
    const next = currentRefByUrl.get(url);
    if (!next) return null;
    replace.set(oldRef, next);
  }
  if (!replace.size) return tree;
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return replace.get(value) ?? value;
    if (Array.isArray(value)) return value.map(walk);
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, walk(inner)]));
    return value;
  };
  return walk(tree);
}

/**
 * Keeps the in-memory checkpoint and writes it after each accepted chunk.
 * Writes are serialized, so parallel pages never interleave partial saves.
 */
export function createCheckpointRecorder(input: {
  store: SectionCheckpointStore;
  jobId: string;
  digest: string;
  initial: Map<string, SectionCheckpointEntry>;
}) {
  const sections: Record<string, SectionCheckpointEntry> = Object.fromEntries(input.initial);
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (value: SectionCheckpoint | null) => {
    chain = chain.then(() => input.store.save(value)).catch(() => undefined);
    return chain;
  };
  return {
    get: (sectionDigest: string): SectionCheckpointEntry | undefined => sections[sectionDigest],
    /** Records accepted sections and persists the checkpoint once for the chunk. */
    record: (accepted: { digest: string; tree: unknown; media: Record<string, string> }[]) => {
      if (!accepted.length) return chain;
      const at = new Date().toISOString();
      for (const entry of accepted) sections[entry.digest] = { tree: entry.tree, media: entry.media, at };
      return enqueue({
        version: SECTION_CHECKPOINT_VERSION,
        jobId: input.jobId,
        digest: input.digest,
        sections: { ...sections },
        updatedAt: at,
      });
    },
    flush: () => chain,
  };
}

type CheckpointDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The job row's checkpoint column. Writes are fenced on the attempt and on the
 * job still processing, so a superseded attempt never overwrites a newer one.
 * Without the column (migration not applied yet) loading returns nothing and
 * saves are skipped: the build then simply runs without checkpoints.
 */
export function jobSectionCheckpointStore(
  db: CheckpointDb,
  job: { jobId: string; organizationId: string; attempts: number },
): SectionCheckpointStore & { clear: () => Promise<void> } {
  let disabled = false;
  const warn = (what: string, message: string) => {
    disabled = true;
    console.warn(`[section-checkpoints] job ${job.jobId}: ${what} skipped (${message}); continuing without checkpoints.`);
  };
  return {
    load: async () => {
      try {
        const { data, error } = await db
          .from("generation_jobs")
          .select("section_checkpoints")
          .eq("id", job.jobId)
          .eq("organization_id", job.organizationId)
          .maybeSingle();
        if (error) {
          warn("checkpoint load", String(error.message ?? error));
          return null;
        }
        return (data as { section_checkpoints?: unknown } | null)?.section_checkpoints ?? null;
      } catch (error) {
        warn("checkpoint load", error instanceof Error ? error.message : "unknown error");
        return null;
      }
    },
    save: async (value) => {
      if (disabled) return;
      try {
        const { error } = await db
          .from("generation_jobs")
          .update({ section_checkpoints: value } as never)
          .eq("id", job.jobId)
          .eq("organization_id", job.organizationId)
          .eq("attempts", job.attempts)
          .eq("status", "processing");
        if (error) warn("checkpoint save", String(error.message ?? error));
        else noteProgress(job.jobId);
      } catch (error) {
        warn("checkpoint save", error instanceof Error ? error.message : "unknown error");
      }
    },
    /** Clears the checkpoint once the job has completed (not fenced on status). */
    clear: async () => {
      try {
        const { error } = await db
          .from("generation_jobs")
          .update({ section_checkpoints: null } as never)
          .eq("id", job.jobId)
          .eq("organization_id", job.organizationId);
        if (error) console.warn(`[section-checkpoints] job ${job.jobId}: clear skipped (${error.message})`);
      } catch (error) {
        console.warn(`[section-checkpoints] job ${job.jobId}: clear skipped`, error);
      }
    },
  };
}
