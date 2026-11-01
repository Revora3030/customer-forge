/**
 * The mocked thinker. Kept free of builder imports on purpose: the test files
 * load it from inside `vi.mock`, and importing the harness there would be a
 * circular import that hangs the run.
 */
import type { PromptContractRule } from "./checks";
import type { PromptFixture } from "./fixtures";

/** What the builder hands the thinker. Mirrors callBestThinker's request. */
export type ThinkerRequest = {
  purpose: string;
  system: string;
  user: string;
  json?: boolean;
  maxOutputTokens?: number;
  organizationId?: string | null;
};

export type ThinkerAnswer =
  | { ok: true; lane: "paid"; tier: null; wanted: "hall_of_fame"; downgraded: false; text: string; model: string; costMicrocents: number; attempts: []; handoverReason: null }
  | { ok: false; lane: "paid"; tier: null; wanted: "hall_of_fame"; reason: "provider_unavailable"; detail: string | null; attempts: []; handoverReason: null };

export type ModelFn = (request: ThinkerRequest, fixture: PromptFixture) => Promise<string>;

export type RecordedCall = { kind: PromptContractRule["call"]; purpose: string; system: string; user: string };

export function callKind(purpose: string): PromptContractRule["call"] | null {
  if (purpose === "information_architecture") return "architect";
  if (purpose === "plan_review") return "architectReview";
  if (purpose === "content_strategy" || purpose === "content_strategy_repair" || purpose === "content_strategy_targeted_revision") return "copy";
  if (purpose === "specialist_review") return "copyReview";
  return null;
}

export type ActiveRun = { fixture: PromptFixture; model: ModelFn; calls: RecordedCall[] };
/** The run in progress. Runs are sequential, so one slot is enough. */
let active: ActiveRun | null = null;

export function setActiveRun(run: ActiveRun | null) {
  active = run;
}

/**
 * Stand-in for `callBestThinker`. The test file mocks the thinker module with
 * this, so the real prompt-building code runs and only the model is swapped.
 */
export async function routeThinker(request: ThinkerRequest): Promise<ThinkerAnswer> {
  if (!active) throw new Error("routeThinker called outside runFixture");
  const kind = callKind(request.purpose);
  if (kind) active.calls.push({ kind, purpose: request.purpose, system: request.system, user: request.user });
  try {
    const text = await active.model(request, active.fixture);
    return { ok: true, lane: "paid", tier: null, wanted: "hall_of_fame", downgraded: false, text, model: "prompt-regression-model", costMicrocents: 0, attempts: [], handoverReason: null };
  } catch (error) {
    return { ok: false, lane: "paid", tier: null, wanted: "hall_of_fame", reason: "provider_unavailable", detail: error instanceof Error ? error.message : "model unavailable", attempts: [], handoverReason: null };
  }
}

