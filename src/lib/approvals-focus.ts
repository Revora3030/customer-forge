// /admin/approvals?request=<id> deep links (from bot messages and emails) must
// land on the right card. Decided requests live in the collapsed History
// section, so it has to start open when the linked request is in there,
// otherwise the scroll target is hidden and the link appears to do nothing.
export type ApprovalsFocus = { section: "waiting" | "history" | "none" };

export function approvalsFocus(requests: ReadonlyArray<{ id: string; state: string }>, focusId: string | undefined): ApprovalsFocus {
  if (!focusId) return { section: "none" };
  const hit = requests.find((item) => item.id === focusId);
  if (!hit) return { section: "none" };
  return { section: hit.state === "pending" ? "waiting" : "history" };
}
