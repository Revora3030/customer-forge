import { readDraftPing } from "./preview-bridge";

/** Notifications may refresh only the website currently being viewed. */
export function shouldRefreshDraft(data: unknown, organizationId: string | null | undefined): boolean {
  if (!organizationId) return false;
  return readDraftPing(data)?.organizationId === organizationId;
}