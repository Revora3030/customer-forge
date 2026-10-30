import type {} from "altcha/types/react";
import { useEffect, useState } from "react";
import { usePreviewMode } from "@/components/site/preview-mode-context";

/** Same-origin challenge endpoint (src/routes/api/public/altcha.ts). */
export const ALTCHA_CHALLENGE_URL = "/api/public/altcha";
/** The hidden field the widget writes its payload into. */
export const ALTCHA_FIELD = "altcha";

/**
 * Invisible ALTCHA proof-of-work check (MIT, https://altcha.org). The widget
 * script (~35 KB gz) is only loaded in the browser once a form is on screen,
 * starts solving when the visitor first focuses the form, and writes its
 * payload into a hidden `altcha` input inside the form. Nothing is shown, no
 * third party is contacted, and in the owner's preview it is skipped entirely.
 * If it hasn't finished (or failed to load) the form still submits; the server
 * accepts a missing payload and drops only a forged one.
 */
export function AltchaField() {
  const preview = usePreviewMode();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (preview) return;
    let live = true;
    import("altcha")
      .then(() => {
        if (live) setReady(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [preview]);
  if (preview || !ready) return null;
  return (
    <altcha-widget
      challenge={ALTCHA_CHALLENGE_URL}
      name={ALTCHA_FIELD}
      auto="onfocus"
      display="invisible"
      aria-hidden="true"
    />
  );
}

/** The payload from a submitted form, or "" when the check didn't run. */
export function altchaPayload(form: FormData): string {
  const value = form.get(ALTCHA_FIELD);
  return typeof value === "string" ? value : "";
}
