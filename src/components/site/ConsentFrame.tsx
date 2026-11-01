/**
 * Click-to-load wrapper for third-party frames on client websites (the Google
 * Map in the contact section and allowlisted embeds such as YouTube or
 * Calendly). A frame sends the visitor's IP address to its provider and may set
 * that provider's cookies, so:
 *
 * - The server render and the first client paint always show a placeholder of
 *   the same size (no layout shift, no third-party request before we know).
 * - Outside consent regions (same list as the platform banner, src/lib/consent.ts)
 *   and with no Global Privacy Control signal, the frame then loads on its own,
 *   as before.
 * - In consent regions (or an unknown region, or under GPC) the placeholder
 *   stays, with a "Show …" button and a plain link that opens the provider in a
 *   new tab, plus any text fallback (e.g. the street address).
 * - A click is the visitor's own choice to load that provider. It is
 *   remembered in this browser (localStorage, so every tab of the visit shares
 *   it) for 24 hours, per provider, and then the button comes back. The entry
 *   holds only the provider name and the time of the click: no identifier.
 *   Nothing is written before that click. If localStorage is blocked, the
 *   choice falls back to this tab only (sessionStorage).
 */
import { useEffect, useState, type ReactNode } from "react";
import { hasGlobalPrivacyControl, isConsentRequiredRegion } from "@/lib/consent";

export const FRAME_CONSENT_KEY = "revora.frames.allowed";
/** How long a click to show a provider is remembered in this browser. */
export const FRAME_CHOICE_TTL_MS = 24 * 60 * 60 * 1000;

/** localStorage entries: provider name -> time of the click (ms). */
function readRemembered(now: number): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(FRAME_CONSENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const fresh: Record<string, number> = {};
    for (const [provider, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "number" && at <= now && now - at < FRAME_CHOICE_TTL_MS) {
        fresh[provider] = at;
      }
    }
    // Expired choices are removed, not just ignored.
    if (Object.keys(fresh).length === 0) window.localStorage.removeItem(FRAME_CONSENT_KEY);
    else if (Object.keys(fresh).length !== Object.keys(parsed).length) {
      window.localStorage.setItem(FRAME_CONSENT_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return {};
  }
}

/** Tab-only fallback (and the format used before choices were shared across tabs). */
function readTabOnly(): string[] {
  try {
    const raw = window.sessionStorage.getItem(FRAME_CONSENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function allowedProviders(): string[] {
  return Array.from(new Set([...Object.keys(readRemembered(Date.now())), ...readTabOnly()]));
}

function rememberProvider(provider: string) {
  const now = Date.now();
  try {
    const next = { ...readRemembered(now), [provider]: now };
    window.localStorage.setItem(FRAME_CONSENT_KEY, JSON.stringify(next));
    return;
  } catch {
    // localStorage blocked: fall back to this tab.
  }
  try {
    const next = Array.from(new Set([...readTabOnly(), provider]));
    window.sessionStorage.setItem(FRAME_CONSENT_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the click still loads this frame.
  }
}

/** True when the frame may load without asking: a remembered click, or a non-consent region without GPC. */
export async function frameMayAutoLoad(provider: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (allowedProviders().includes(provider)) return true;
  if (hasGlobalPrivacyControl()) return false;
  return !(await isConsentRequiredRegion());
}

export function ConsentFrame({
  provider,
  openHref,
  openLabel,
  fallback,
  children,
}: {
  /** Plain-language provider name, e.g. "Google Maps" or "YouTube". */
  provider: string;
  /** Plain link to the same thing on the provider's site (new tab). */
  openHref: string | null;
  openLabel: string;
  /** Extra text shown in the placeholder, e.g. the street address. */
  fallback?: ReactNode;
  /** The iframe itself; rendered only once loading is allowed. */
  children: ReactNode;
}) {
  const [state, setState] = useState<"checking" | "ask" | "load">("checking");

  useEffect(() => {
    let live = true;
    void frameMayAutoLoad(provider)
      .catch(() => false)
      .then((ok) => {
        if (live) setState(ok ? "load" : "ask");
      });
    return () => {
      live = false;
    };
  }, [provider]);

  if (state === "load") return <>{children}</>;

  return (
    <div
      className="rv-frame-placeholder flex size-full flex-col overflow-auto items-center justify-center gap-3 bg-muted/40 p-4 text-center text-[14px] text-foreground"
      data-testid="consent-frame"
      data-state={state}
    >
      {fallback ? <div className="max-w-md">{fallback}</div> : null}
      {state === "ask" ? (
        <>
          <button
            type="button"
            onClick={() => {
              rememberProvider(provider);
              setState("load");
            }}
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-background px-4 font-medium hover:border-primary"
          >
            Show {provider}
          </button>
          <p className="max-w-md text-[13px] text-muted-foreground">
            This loads content from {provider}, which receives your IP address and may set its own
            cookies.
          </p>
        </>
      ) : null}
      {openHref ? (
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 py-3 underline underline-offset-4"
        >
          {openLabel}
        </a>
      ) : null}
    </div>
  );
}
