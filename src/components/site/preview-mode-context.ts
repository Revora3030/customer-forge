import { createContext, useContext } from "react";

/**
 * True only while a customer site renders inside the owner's draft preview
 * (`/draft/...`). Public visitors and share links (`/p/<token>`) never see it.
 *
 * In preview mode:
 *  - composition nodes expose their tree path, so the builder can pick and
 *    edit one exact element;
 *  - lead forms are SIMULATED: they validate and show their real success
 *    screen, but nothing is sent to the CRM, the calendar or email.
 */
export const PreviewModeContext = createContext(false);

export function usePreviewMode(): boolean {
  return useContext(PreviewModeContext);
}
