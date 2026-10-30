const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shown when the caller may not create links (specific, never a bare failure). */
export const PREVIEW_LINK_DENIED =
  "Couldn't create a preview link: only this business's owners, admins and managers, or Revora support in an open support session, can create one.";

/** The row could not be written (logged server-side with the database code). */
export const PREVIEW_LINK_SAVE_FAILED = "Couldn't create a preview link: saving it failed on our side. Please try again in a moment.";

export function previewLinkInput(input: { organizationId: string; label?: string | null; hours?: number }) {
  const organizationId = String(input?.organizationId ?? "");
  if (!UUID.test(organizationId)) throw new Error("Couldn't create a preview link: no workspace is selected.");
  const label = typeof input?.label === "string" && input.label.trim() ? input.label.trim().slice(0, 120) : null;
  const hours = Math.max(1, Math.min(720, Math.round(Number(input?.hours) || 72)));
  return { organizationId, label, hours };
}
