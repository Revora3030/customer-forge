/**
 * Microsoft Clarity (free heatmaps and session replay) for Revora's OWN public
 * marketing pages only.
 *
 * Hard rules, enforced here and in `ClarityLoader`:
 *  - Only on the live revoragrowthsystems.com hosts.
 *  - Only on an allow-listed marketing path. Client sites (/s, /p), the app,
 *    admin, login/signup, billing and checkout are never on the list.
 *  - Only when the visitor's cookie consent allows it (`canTrackAds`, the same
 *    gate Google Analytics uses: explicit choice, or no banner needed outside
 *    consent regions). Revora staff browsers are skipped.
 *  - After the tag loads, `clarity('consent')` is called, as Clarity requires.
 *
 * The project ID is public (it ships in the page source), so a default here is
 * fine. Override with VITE_CLARITY_ID. Masking (Strict) is set in the Clarity
 * project itself.
 */
import { canTrackAds } from "./consent";
import { isGa4ProductionHost } from "./ga4";
import { isStaffBrowser } from "./staff-browser";

export const DEFAULT_CLARITY_ID = "z6io1xv7sb";
const CLARITY_ID_PATTERN = /^[a-z0-9]{8,16}$/;

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

export function clarityProjectId(): string {
  const fromEnv = (import.meta.env?.["VITE_CLARITY_ID"] as string | undefined)?.trim().toLowerCase();
  return fromEnv && CLARITY_ID_PATTERN.test(fromEnv) ? fromEnv : DEFAULT_CLARITY_ID;
}

/** Public marketing pages where Clarity may run. Anything not listed is off. */
const MARKETING_PATHS = [
  /^\/$/,
  /^\/(?:pricing|get-started|about|contact|privacy|terms|tools|growth-assessment|website-audit)\/?$/,
  /^\/(?:compare|crm|guides|industries|locations|local|states|demo)(?:\/|$)/,
  /^\/crm-for-contractors\/?$/,
];

export function isClarityPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const clean = pathname.trim().toLowerCase().split(/[?#]/)[0] ?? "";
  // /demo/dashboard is a mock workspace, not a marketing page.
  if (/^\/demo\/dashboard(?:\/|$)/.test(clean)) return false;
  return MARKETING_PATHS.some((pattern) => pattern.test(clean));
}

let loaded = false;

export function clarityIsLoaded() {
  return loaded;
}

/** True when Clarity is allowed to run for this visitor on this page, right now. */
export async function clarityAllowed(): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!isGa4ProductionHost(window.location.hostname)) return false;
  if (!isClarityPath(window.location.pathname)) return false;
  if (isStaffBrowser()) return false;
  return canTrackAds();
}

/** Loads the Clarity tag once, if (and only if) it is allowed. */
export async function loadClarity(): Promise<boolean> {
  if (loaded) return true;
  if (!(await clarityAllowed())) return false;
  if (loaded) return true;
  loaded = true;
  const id = clarityProjectId();
  // Same queue stub Clarity's own snippet installs, so calls made before the
  // script arrives are replayed.
  window.clarity =
    window.clarity ??
    Object.assign(
      (...args: unknown[]) => {
        (window.clarity!.q ??= []).push(args);
      },
      { q: [] as unknown[] },
    );
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${id}`;
  document.head.appendChild(script);
  window.clarity("consent");
  return true;
}
