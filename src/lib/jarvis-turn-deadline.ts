import { RevoraAiError } from "@/lib/ai/errors";

/**
 * Wall-clock limits for one Jarvis turn. A turn is up to MAX_ACTION_STEPS model
 * rounds plus a correction round; without an overall limit a slow failover
 * chain could keep the owner waiting for many minutes.
 */
/** Whole admin turn: every model round, tool round and the correction round. */
export const JARVIS_TURN_DEADLINE_MS = 110_000;
/** One model attempt inside a turn (the router moves to the next model after this). */
export const JARVIS_ATTEMPT_TIMEOUT_MS = 60_000;
/** One model round's whole failover chain. */
export const JARVIS_CHAIN_DEADLINE_MS = 90_000;
/** The public visitor chat is one short answer: fail fast and show the friendly fallback. */
export const VISITOR_JARVIS_ATTEMPT_TIMEOUT_MS = 20_000;
export const VISITOR_JARVIS_CHAIN_DEADLINE_MS = 30_000;
/** Below this, a new model round can't realistically finish, so the turn stops instead. */
export const MIN_ROUND_MS = 5_000;

export const TURN_DEADLINE_MESSAGE = "Revora AI took too long to answer this turn, so Jarvis stopped.";

export function turnDeadlineExceeded(): RevoraAiError {
  return new RevoraAiError(504, TURN_DEADLINE_MESSAGE, { category: "timeout", detail: "jarvis_turn_deadline" });
}

export type RoundBudget = { timeoutMs: number; chainDeadlineMs: number };

export type TurnDeadline = {
  remainingMs(): number;
  /** The model budget for the next round, capped by what is left; throws a timeout error when too little is left. */
  nextRound(): RoundBudget;
  /** Settles with the work, or rejects with a timeout error once the turn's time is up (a late result is dropped). */
  race<T>(work: Promise<T>): Promise<T>;
};

export function createTurnDeadline(totalMs = JARVIS_TURN_DEADLINE_MS, clock: () => number = () => Date.now()): TurnDeadline {
  const endsAt = clock() + totalMs;
  const remainingMs = () => Math.max(0, endsAt - clock());
  return {
    remainingMs,
    nextRound() {
      const left = remainingMs();
      if (left < MIN_ROUND_MS) throw turnDeadlineExceeded();
      return { timeoutMs: Math.min(JARVIS_ATTEMPT_TIMEOUT_MS, left), chainDeadlineMs: Math.min(JARVIS_CHAIN_DEADLINE_MS, left) };
    },
    race<T>(work: Promise<T>): Promise<T> {
      const left = remainingMs();
      if (left <= 0) {
        work.catch(() => undefined);
        return Promise.reject(turnDeadlineExceeded());
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(turnDeadlineExceeded()), left); // DevSkim: ignore DS172411 -- Fixed callback and numeric delay; no untrusted data.
      });
      // A late failure of the abandoned work must not surface as an unhandled rejection.
      work.catch(() => undefined);
      return Promise.race([work, expired]).finally(() => clearTimeout(timer));
    },
  };
}
