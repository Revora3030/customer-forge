import { useEffect, useRef, useState } from "react";
import { usePreviewMode } from "@/components/site/preview-mode-context";
import { TURNSTILE_FIELD, TURNSTILE_SCRIPT_URL, turnstileHostAllowed, turnstileSiteKey } from "@/lib/turnstile";

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
};
type TurnstileWindow = Window & { turnstile?: TurnstileApi };

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  const w = window as TurnstileWindow;
  if (w.turnstile) return Promise.resolve(w.turnstile);
  scriptPromise ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve((window as TurnstileWindow).turnstile ?? null);
    script.onerror = () => {
      scriptPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile for the public lead forms, in "interaction-only" mode:
 * nothing is shown unless Cloudflare needs the visitor to click a checkbox,
 * so the form looks exactly as before for almost everyone. Rendered only
 * when a site key is configured, on Revora-owned hosts, and never in the
 * owner's preview. The widget writes its token into a hidden
 * `cf-turnstile-response` input inside the form. If the script is blocked or
 * slow, the form still submits; the server falls back to ALTCHA.
 */
export function TurnstileField() {
  const preview = usePreviewMode();
  const holder = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Decided after mount so server and client render the same (nothing).
    setEnabled(!preview && !!turnstileSiteKey() && turnstileHostAllowed(window.location.hostname));
  }, [preview]);

  useEffect(() => {
    if (!enabled) return;
    const el = holder.current;
    if (!el) return;
    let live = true;
    let widgetId: string | undefined;
    let api: TurnstileApi | null = null;
    const form = el.closest("form");
    // Tokens are single-use: after each submit attempt fetch a fresh one, so a
    // retry (e.g. after a validation message) isn't sent with a spent token.
    const onSubmit = () => window.setTimeout(() => widgetId && api?.reset(widgetId), 1500);
    void loadTurnstile().then((loaded) => {
      if (!live || !loaded) return;
      api = loaded;
      widgetId = loaded.render(el, {
        sitekey: turnstileSiteKey(),
        theme: "dark",
        size: "flexible",
        appearance: "interaction-only",
        "response-field-name": TURNSTILE_FIELD,
        "refresh-expired": "auto",
      });
      form?.addEventListener("submit", onSubmit);
    });
    return () => {
      live = false;
      form?.removeEventListener("submit", onSubmit);
      if (widgetId) api?.remove(widgetId);
    };
  }, [enabled]);

  if (!enabled) return null;
  return <div ref={holder} className="empty:hidden" data-turnstile="" />;
}
