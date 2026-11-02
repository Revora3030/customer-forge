/**
 * Lightweight A/B testing for the public marketing pages.
 *
 * Assignment is sticky per browser (localStorage), so a visitor always sees the
 * same variant across pages and sessions. Exposure is recorded once per session
 * as a marketing conversion event, and every later funnel event carries the
 * visitor's variants — so sign-up rate can be compared per variant without any
 * third-party script.
 *
 * Because the assignment persists in browser storage and is attached to
 * analytics events, it follows the same analytics choice as the visitor id
 * (`canTrackAds`): in consent regions it is only made after Accept, and never
 * under Global Privacy Control or after a Reject. Until then the visitor sees
 * the control (the first variant), nothing is stored and no exposure is
 * recorded. A stored assignment is deleted when the choice no longer allows it.
 */

import { trackConversion } from "@/lib/conversion";
import { canTrackAds, EXPERIMENTS_STORAGE_KEY } from "@/lib/consent";
import { GROWTH_SYSTEM } from "@/lib/offer";

export const EXPERIMENTS = {
  pricing_layout: ["stacked", "split"],
  start_free_copy: ["trial_days", "no_card", "start_free"],
} as const;

export type ExperimentKey = keyof typeof EXPERIMENTS;
export type Variant<K extends ExperimentKey> = (typeof EXPERIMENTS)[K][number];

const STORE_KEY = EXPERIMENTS_STORAGE_KEY;
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

/** The variant every visitor sees until their analytics choice allows a test. */
export function controlOf<K extends ExperimentKey>(key: K): Variant<K> {
  return EXPERIMENTS[key][0] as Variant<K>;
}

/** Removes any stored assignment and the session's exposure record. */
export function clearExperiments() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORE_KEY);
    window.sessionStorage.removeItem(EXPOSED_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * The variant to show, once the visitor's analytics choice is known. Without
 * permission it returns the control and clears any earlier assignment.
 */
export async function consentedVariantOf<K extends ExperimentKey>(
  key: K,
): Promise<{ variant: Variant<K>; assigned: boolean }> {
  const allowed = await canTrackAds().catch(() => false);
  if (!allowed) {
    clearExperiments();
    return { variant: controlOf(key), assigned: false };
  }
  return { variant: variantOf(key), assigned: true };
}

/**
 * Sticky variant for this visitor; assigns and stores one if needed. Callers
 * must check consent first (use `consentedVariantOf`). Control during SSR.
 */
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

/** Every stored variant for this visitor. Read-only: never assigns. */
export function activeVariants(): Record<string, string> {
  return readStore();
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
  trial_days: `TRY ${GROWTH_SYSTEM.fullAccessWindowUpper} FREE — FULL ACCESS`,
  no_card: "START FREE — NO CARD REQUIRED",
  start_free: "START FREE ACCESS NOW",
};
