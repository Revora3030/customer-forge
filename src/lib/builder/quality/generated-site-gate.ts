/**
 * The generator's call into the video-bar gate (`runVideoGate`), run once a site has been generated.
 *
 * Mode comes from `VIDEO_BAR_GATE` (see `video-publish-gate.ts`; the default is `warn`):
 *  - warn / enforce: score the generated site, log the result and store it so the builder and the quality log can read
 *    it. Going live is decided by the publish gate, not here, so this step never blocks or fails a build.
 *  - off: skipped.
 * Repairs only run when the caller hands in a `regenerate` function. Then only the failing sections are rewritten, at
 * most `maxRetries` (default 2) times, and the best scoring version is returned for the caller to save. Without one
 * the gate scores once and changes nothing.
 *
 * Never throws: every failure (loading, scoring, storing) is reported in the outcome and logged.
 */
import type { IntakeFacts } from "@/lib/builder/quality/facts-guard";
import { DEFAULT_MAX_RETRIES, runVideoGate, type GateAttempt, type GateResult, type RegenerateFn } from "@/lib/builder/quality/video-gate";
import { gateMode, type GateMode } from "@/lib/builder/quality/video-publish-gate";
import type { VideoScoreInput } from "@/lib/builder/quality/video-score";
import type { SiteModel } from "@/lib/builder/quality/video-site-model";

/** What is stored at `generation.videoGate` after a build. Small on purpose: ids, scores and owner fixes only. */
export type GeneratedSiteGateSummary = {
  mode: GateMode;
  trigger: string;
  at: string;
  tradeSlug: string;
  score: number;
  bar: number;
  passed: boolean;
  retriesUsed: number;
  attempts: { attempt: number; score: number; passed: boolean; failures: string[]; regenerated: string[]; error?: string }[];
  needsHuman: string[];
  ownerFixes: string[];
};

export type GeneratedSiteGateOutcome =
  | { status: "skipped"; mode: "off"; blocked: false }
  | { status: "scored"; mode: GateMode; blocked: false; summary: GeneratedSiteGateSummary; result: GateResult; stored: boolean }
  | { status: "error"; mode: GateMode; blocked: false; error: string };

export type GeneratedSiteGateDeps = {
  load: () => Promise<{ site: SiteModel; blueprint: VideoScoreInput["blueprint"]; intake: IntakeFacts; tradeSlug: string }>;
  store: (summary: GeneratedSiteGateSummary) => Promise<void>;
  regenerate?: RegenerateFn;
  maxRetries?: number;
  record?: (attempt: GateAttempt) => void | Promise<void>;
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
  trigger?: string;
  now?: () => Date;
};

const noRepair: RegenerateFn = async () => ({});
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export function summarizeGate(result: GateResult, mode: GateMode, tradeSlug: string, trigger: string, at: string): GeneratedSiteGateSummary {
  return {
    mode, trigger, at, tradeSlug,
    score: result.score, bar: result.bar, passed: result.passed, retriesUsed: result.retriesUsed,
    attempts: result.attempts.map((a) => ({
      attempt: a.attempt, score: a.score, passed: a.passed, failures: a.failures.map((f) => f.criterion), regenerated: a.regenerated,
      ...(a.error ? { error: a.error } : {}),
    })),
    needsHuman: result.needsHuman.map((f) => f.criterion),
    ownerFixes: result.ownerFixes.slice(0, 8),
  };
}

export async function gateGeneratedSite(deps: GeneratedSiteGateDeps): Promise<GeneratedSiteGateOutcome> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const trigger = deps.trigger ?? "build";
  const mode = gateMode(env);
  if (mode === "off") return { status: "skipped", mode, blocked: false };
  try {
    const input = await deps.load();
    const result = await runVideoGate({
      site: input.site, blueprint: input.blueprint, intake: input.intake, env,
      regenerate: deps.regenerate ?? noRepair,
      maxRetries: deps.regenerate ? (deps.maxRetries ?? DEFAULT_MAX_RETRIES) : 0,
      ...(deps.record ? { record: deps.record } : {}),
    });
    const summary = summarizeGate(result, mode, input.tradeSlug, trigger, (deps.now?.() ?? new Date()).toISOString());
    log(
      `[video-gate] ${trigger} (${mode}) ${input.tradeSlug}: ${summary.score}/${summary.bar} ${summary.passed ? "meets the bar" : `below the bar, failing ${summary.needsHuman.join(", ") || "none"}`}`,
    );
    let stored = true;
    try {
      await deps.store(summary);
    } catch (e) {
      stored = false;
      log(`[video-gate] ${trigger} result not stored: ${message(e)}`);
    }
    return { status: "scored", mode, blocked: false, summary, result, stored };
  } catch (e) {
    log(`[video-gate] ${trigger} (${mode}) not scored: ${message(e)}`);
    return { status: "error", mode, blocked: false, error: message(e) };
  }
}
