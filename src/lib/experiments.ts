/**
 * Lightweight A/B testing for the public marketing pages.
 *
 * Assignment is sticky per browser (localStorage), so a visitor always sees the
 * same variant across pages and sessions. Exposure is recorded once per session
 * as a marketing conversion event, and every later funnel event carries the
 * visitor's variants — so sign-up rate can be compared per variant without any
 * third-party script.
 */

import { trackConversion } from "@/lib/conversion";

export const EXPERIMENTS = {
  pricing_layout: ["stacked", "split"],
  start_free_copy: ["trial_days", "no_card", "start_free"],
} as const;

export type ExperimentKey = keyof typeof EXPERIMENTS;
export type Variant<K extends ExperimentKey> = (typeof EXPERIMENTS)[K][number];

const STORE_KEY = "revora.experiments.v1";
const EXPOSED_KEY = "revora.experiments.exposed.v1";

const isBrowser = () => typeof window !== "undefined";

function readStore(): Record<string, string> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* private mode: the visitor simply gets a fresh assignment next time */
  }
}

function pick<K extends ExperimentKey>(key: K): Variant<K> {
  const options = EXPERIMENTS[key] as readonly string[];
  const index = Math.floor(Math.random() * options.length);
  return (options[index] ?? options[0]) as Variant<K>;
}

/** Sticky variant for this visitor. Falls back to the control during SSR. */
export function variantOf<K extends ExperimentKey>(key: K): Variant<K> {
  const control = EXPERIMENTS[key][0] as Variant<K>;
  if (!isBrowser()) return control;
  const store = readStore();
  const existing = store[key];
  if (existing && (EXPERIMENTS[key] as readonly string[]).includes(existing)) {
    return existing as Variant<K>;
  }
  const assigned = pick(key);
  writeStore({ ...store, [key]: assigned });
  return assigned;
}

/** Every variant this visitor is in — attached to funnel events for analysis. */
export function activeVariants(): Record<string, string> {
  if (!isBrowser()) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(EXPERIMENTS) as ExperimentKey[]) out[key] = variantOf(key);
  return out;
}

/** Records that the visitor actually saw a variant. Once per session per test. */
export function trackExposure<K extends ExperimentKey>(key: K, variant: Variant<K>) {
  if (!isBrowser()) return;
  try {
    const raw = window.sessionStorage.getItem(EXPOSED_KEY);
    const seen: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const tag = `${key}:${variant}`;
    if (seen.includes(tag)) return;
    window.sessionStorage.setItem(EXPOSED_KEY, JSON.stringify([...seen, tag]));
  } catch {
    /* fall through and still record the exposure */
  }
  trackConversion("experiment_exposure", { metadata: { experiment: key, variant } });
}

export const START_FREE_COPY: Record<string, string> = {
  trial_days: "TRY 3 DAYS FREE — FULL ACCESS",
  no_card: "START FREE — NO CARD REQUIRED",
  start_free: "START FREE ACCESS NOW",
};
