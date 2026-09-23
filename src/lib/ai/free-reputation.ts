/**
 * FREE-MODEL FORM — the Hall of Fame learns who actually delivers.
 *
 * A model's published size tells you how strong it *should* be. It does not
 * tell you that a provider is quietly truncating answers, refusing JSON, or
 * timing out today. This module remembers the last handful of real outcomes
 * per free model so the relief squad automatically leads with the models that
 * are genuinely working right now, and stops opening every run with one that
 * has failed the last three times.
 *
 * Deliberately narrow:
 *  - Only outcome, latency and time are remembered. No prompts, no customer
 *    content, no keys, nothing tenant-identifying.
 *  - Recent outcomes count; older ones fade, so a model that recovers is
 *    trusted again without any manual reset.
 *  - Form only reorders models that are ALREADY eligible and capable. It can
 *    never promote an incapable, unhealthy or allowance-spent model.
 *
 * Pure module: no environment, no network, fully unit-testable.
 */

/** How many recent outcomes shape a model's form. */
export const FORM_WINDOW = 10;

/** Outcomes older than this are forgiven entirely. */
export const FORM_MEMORY_MS = 6 * 60 * 60 * 1000;

/** Latency at or above this reads as "slow" for the speed nudge. */
export const SLOW_LATENCY_MS = 20_000;

type Outcome = { ok: boolean; at: number; latencyMs: number };

const HISTORY = new Map<string, Outcome[]>();

function key(provider: string, model: string) {
  return `${provider}:${model}`;
}

/** Records one real free-model attempt. Never throws. */
export function recordFreeModelOutcome(input: {
  provider: string;
  model: string;
  ok: boolean;
  latencyMs?: number;
  at?: number;
}) {
  const id = key(input.provider, input.model);
  const list = HISTORY.get(id) ?? [];
  list.unshift({
    ok: input.ok,
    at: input.at ?? Date.now(),
    latencyMs: Math.max(0, Math.round(input.latencyMs ?? 0)),
  });
  if (list.length > FORM_WINDOW) list.length = FORM_WINDOW;
  HISTORY.set(id, list);
}

export type FreeModelForm = {
  /** Remembered attempts inside the memory window. */
  attempts: number;
  wins: number;
  /** Average latency of remembered attempts, or null when nothing is known. */
  averageLatencyMs: number | null;
  /**
   * -1 (recently, repeatedly unusable) to +1 (recently, reliably useful).
   * Exactly 0 when nothing is known, so an unproven model is neither
   * rewarded nor punished.
   */
  score: number;
};

/** What is known about one free model's recent behaviour. */
export function freeModelForm(provider: string, model: string, now = Date.now()): FreeModelForm {
  const list = (HISTORY.get(key(provider, model)) ?? []).filter(
    (entry) => now - entry.at <= FORM_MEMORY_MS,
  );
  if (list.length === 0)
    return { attempts: 0, wins: 0, averageLatencyMs: null, score: 0 };

  // Newer outcomes weigh more, so today's truth beats this morning's.
  let weighted = 0;
  let weight = 0;
  let wins = 0;
  let latency = 0;
  list.forEach((entry, index) => {
    const w = 1 / (index + 1);
    weighted += (entry.ok ? 1 : -1) * w;
    weight += w;
    if (entry.ok) wins += 1;
    latency += entry.latencyMs;
  });

  const reliability = weight > 0 ? weighted / weight : 0;
  const averageLatencyMs = Math.round(latency / list.length);
  // A working-but-slow model still leads a failing one: speed is a nudge only.
  const speed = averageLatencyMs >= SLOW_LATENCY_MS ? -0.15 : 0;
  // An unproven model is trusted more than a proven failure, so confidence
  // scales the penalty as well as the reward.
  const confidence = Math.min(list.length / 3, 1);
  const score = Math.max(-1, Math.min(1, reliability * confidence + speed));
  return { attempts: list.length, wins, averageLatencyMs, score };
}

/** Everything remembered, strongest form first. For the admin surface only. */
export function freeModelFormSnapshot(now = Date.now()) {
  return [...HISTORY.keys()]
    .map((id) => {
      const [provider = "", ...rest] = id.split(":");
      const model = rest.join(":");
      return { provider, model, ...freeModelForm(provider, model, now) };
    })
    .filter((entry) => entry.attempts > 0)
    .sort((a, b) => b.score - a.score || b.attempts - a.attempts);
}

export function resetFreeModelForm() {
  HISTORY.clear();
}
