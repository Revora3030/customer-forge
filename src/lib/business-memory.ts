/**
 * Business memory rules (PAI-6): what the platform AI may remember about one
 * business, and how sure we are of it. Pure functions, shared by the server API
 * and by the agent loop (PAI-10). The database repeats the hard rules as CHECK
 * constraints (20261105070000_business_memory.sql); these give the plain-words
 * refusal before a write is attempted.
 *
 *  - a fact needs a source (an owner-entered fact is its own source);
 *  - a model-inferred fact is only ever proposed until the owner confirms it;
 *  - tone rules and style preferences are the owner's words, never inferred;
 *  - the workspace is never an input the model supplies.
 */

export const MEMORY_KINDS = ["fact", "tone_rule", "style_preference"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_STATUSES = ["proposed", "confirmed", "superseded"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_SOURCE_TYPES = ["owner_entered", "owner_message", "url", "website_memory", "agent_inference", "system"] as const;
export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];

/** Sources that are the owner's own words. */
const OWNER_SOURCES: ReadonlySet<MemorySourceType> = new Set(["owner_entered", "owner_message"]);

export const MAX_KEY = 120;
export const MAX_VALUE = 1000;
export const MAX_QUOTE = 500;
export const MAX_SOURCE_ID = 500;

export type BusinessMemoryRow = {
  id: string;
  organization_id: string;
  kind: MemoryKind;
  key: string;
  value: string;
  status: MemoryStatus;
  source_type: MemorySourceType;
  source_id: string | null;
  source_quote: string | null;
  fetched_at: string | null;
  superseded_by: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NewMemoryInput = {
  kind: MemoryKind;
  key: string;
  value: string;
  sourceType: MemorySourceType;
  sourceId?: string | null | undefined;
  sourceQuote?: string | null | undefined;
  fetchedAt?: string | null | undefined;
};

export type CleanMemory = {
  kind: MemoryKind;
  key: string;
  value: string;
  sourceType: MemorySourceType;
  sourceId: string | null;
  sourceQuote: string | null;
  fetchedAt: string | null;
};

/** Who is writing. `owner` is a signed-in person; `agent` is the assistant acting for them. */
export type MemoryActor = { kind: "owner" | "agent" | "system"; userId: string | null };

export type MemoryCheck = { ok: true; memory: CleanMemory } | { ok: false; problem: string };

const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const optional = (value: unknown, max: number): string | null => {
  const text = clean(value);
  return text ? text.slice(0, max) : null;
};

export function isOwnerSource(sourceType: MemorySourceType): boolean {
  return OWNER_SOURCES.has(sourceType);
}

/** Checks one memory before it is stored. Never throws; says what to fix. */
export function checkNewMemory(input: NewMemoryInput): MemoryCheck {
  if (!MEMORY_KINDS.includes(input.kind)) return { ok: false, problem: "Choose what kind of note this is: fact, tone rule or style preference." };
  if (!MEMORY_SOURCE_TYPES.includes(input.sourceType)) return { ok: false, problem: "Say where this came from." };
  const key = clean(input.key);
  const value = clean(input.value);
  if (!key) return { ok: false, problem: "Give the note a short label." };
  if (key.length > MAX_KEY) return { ok: false, problem: `Keep the label under ${MAX_KEY} characters.` };
  if (!value) return { ok: false, problem: "Write what should be remembered." };
  if (value.length > MAX_VALUE) return { ok: false, problem: `Keep the note under ${MAX_VALUE} characters.` };
  const sourceId = optional(input.sourceId, MAX_SOURCE_ID);
  if (input.kind === "fact" && input.sourceType !== "owner_entered" && !sourceId) {
    return { ok: false, problem: "A fact needs a source: a message, a page address or the owner typing it in." };
  }
  if (input.kind !== "fact" && !isOwnerSource(input.sourceType)) {
    return { ok: false, problem: "Tone rules and style preferences come from the owner, not from the assistant or a web page." };
  }
  return {
    ok: true,
    memory: {
      kind: input.kind,
      key,
      value,
      sourceType: input.sourceType,
      sourceId,
      sourceQuote: optional(input.sourceQuote, MAX_QUOTE),
      fetchedAt: input.fetchedAt ?? null,
    },
  };
}

/**
 * The status a new memory is saved with. Only a signed-in owner writing their
 * own words is saved as confirmed; everything else (the assistant, a web page,
 * an import) waits as proposed for the owner to confirm.
 */
export function initialStatus(actor: MemoryActor, sourceType: MemorySourceType): "proposed" | "confirmed" {
  return actor.kind === "owner" && actor.userId != null && isOwnerSource(sourceType) ? "confirmed" : "proposed";
}

/** Plain-words source line shown next to a recalled or listed fact. */
export function describeSource(row: Pick<BusinessMemoryRow, "source_type" | "source_id" | "status">): string {
  const unconfirmed = row.status === "proposed" ? " (not confirmed yet)" : "";
  switch (row.source_type) {
    case "owner_entered":
      return "You told us this" + unconfirmed;
    case "owner_message":
      return "From your message" + unconfirmed;
    case "url":
      return (row.source_id ? `From ${row.source_id}` : "From a web page") + unconfirmed;
    case "website_memory":
      return "From your website notes" + unconfirmed;
    case "agent_inference":
      return "Worked out by the assistant" + unconfirmed;
    case "system":
      return "From your account" + unconfirmed;
  }
}

/** The text that is embedded and matched. */
export function memoryEmbeddingText(row: Pick<BusinessMemoryRow, "key" | "value">): string {
  return `${row.key}: ${row.value}`;
}

/** Row fields in the shape the model sees (never ids of other workspaces, never raw columns). */
export type RecalledMemory = {
  id: string;
  kind: MemoryKind;
  key: string;
  value: string;
  status: "proposed" | "confirmed";
  source: string;
  similarity: number | null;
};

export function toRecalled(row: BusinessMemoryRow, similarity: number | null): RecalledMemory {
  return {
    id: row.id,
    kind: row.kind,
    key: row.key,
    value: row.value,
    status: row.status === "confirmed" ? "confirmed" : "proposed",
    source: describeSource(row),
    similarity,
  };
}
