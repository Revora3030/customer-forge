export const STARTER_KEY = "revora:starter";

/**
 * What a visitor told the homepage (or the visitor Jarvis) before signing up.
 * `wantsImport` means they asked to upgrade their existing website, so
 * onboarding reads `website` straight away.
 */
export type Starter = { businessName: string; about: string; industry: string; website: string; wantsImport: boolean };

/** Account metadata key the starter is saved under at sign-up. */
export const STARTER_METADATA_KEY = "revora_starter";

export function readStarter(): Starter | null {
  try {
    const raw = window.localStorage.getItem(STARTER_KEY);
    if (!raw) return null;
    return cleanStarter(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * The starter saved on the account at sign-up (user metadata), so what the
 * visitor typed on the homepage survives confirming their email on another
 * device, where localStorage is empty. Cleaned exactly like the local copy.
 */
export function starterFromMetadata(metadata: unknown): Starter | null {
  if (!metadata || typeof metadata !== "object") return null;
  return cleanStarter((metadata as Record<string, unknown>)[STARTER_METADATA_KEY]);
}

function cleanStarter(value: unknown): Starter | null {
  try {
    if (!value || typeof value !== "object") return null;
    const v = value as Partial<Starter>;
    const businessName = typeof v.businessName === "string" ? v.businessName.slice(0, 120) : "";
    const about = typeof v.about === "string" ? v.about.slice(0, 1000) : "";
    const industry = typeof v.industry === "string" ? v.industry.slice(0, 60) : "";
    const website = typeof v.website === "string" ? v.website.trim().slice(0, 200) : "";
    const wantsImport = v.wantsImport === true;
    return businessName || about || website || wantsImport ? { businessName, about, industry, website, wantsImport } : null;
  } catch {
    return null;
  }
}

/** Merges into what's already saved, so the hero and Jarvis don't erase each other. */
export function saveStarter(patch: Partial<Starter>) {
  try {
    const current = readStarter();
    window.localStorage.setItem(
      STARTER_KEY,
      JSON.stringify({ businessName: "", about: "", industry: "", website: "", wantsImport: false, ...current, ...patch }),
    );
  } catch {
    /* storage unavailable — the visitor just types it again */
  }
}

export function clearStarter() {
  try {
    window.localStorage.removeItem(STARTER_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
