/**
 * Per-request "which model just answered" reporter.
 * Rides on AsyncLocalStorage so one builder request's reports never reach
 * another workspace. The router calls `reportModelAnswered` after every
 * successful model call; the builder turns that into a visible progress line.
 * Reporting is cosmetic and must never throw into the router.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type Reporter = (provider: string, model: string) => void;

const scopes = new AsyncLocalStorage<Reporter>();

export function withModelActivity<T>(reporter: Reporter, work: () => T): T {
  let last = "";
  return scopes.run((provider, model) => {
    const key = `${provider}·${model}`;
    if (key === last) return; // same model answering again adds no new information
    last = key;
    reporter(provider, model);
  }, work);
}

export function reportModelAnswered(provider: string, model: string): void {
  try {
    scopes.getStore()?.(provider, model);
  } catch {
    // cosmetic only
  }
}
