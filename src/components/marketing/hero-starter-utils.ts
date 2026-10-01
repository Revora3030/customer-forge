export const STARTER_KEY = "revora:starter";

export type Starter = { businessName: string; about: string; industry: string };

export function readStarter(): Starter | null {
  try {
    const raw = window.localStorage.getItem(STARTER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Starter>;
    const businessName = typeof v.businessName === "string" ? v.businessName.slice(0, 120) : "";
    const about = typeof v.about === "string" ? v.about.slice(0, 1000) : "";
    const industry = typeof v.industry === "string" ? v.industry.slice(0, 60) : "";
    return businessName || about ? { businessName, about, industry } : null;
  } catch {
    return null;
  }
}

export function clearStarter() {
  try {
    window.localStorage.removeItem(STARTER_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
