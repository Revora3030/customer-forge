/**
 * JC-58: prospect pipeline board. Pure. Each prospect sits in the furthest
 * stage its saved records prove: Found → Demo built → Approved by Adam → Sent → Replied.
 * Nothing here moves a card; cards move only when the existing actions write records.
 */
export const BOARD_STAGES = [
  ["found", "Found"],
  ["demo_built", "Demo built"],
  ["approved", "Approved by Adam"],
  ["sent", "Sent"],
  ["replied", "Replied"],
] as const;
export type BoardStage = (typeof BOARD_STAGES)[number][0];

export type BoardCard = {
  key: string;
  name: string;
  stage: BoardStage;
  /** Set only for a pending imported lead: the existing review action can approve it. */
  leadId: string | null;
  organizationId: string | null;
};

export type BoardInput = {
  demos: Array<{ organizationId: string; name: string }>;
  leads: Array<{ id: string; name: string; status: string; organizationId: string | null }>;
  builtOrgIds: Iterable<string>;
  sentOrgIds: Iterable<string>;
  repliedOrgIds: Iterable<string>;
};

export function buildBoard(input: BoardInput): Record<BoardStage, BoardCard[]> {
  const built = new Set(input.builtOrgIds);
  const sent = new Set(input.sentOrgIds);
  const replied = new Set(input.repliedOrgIds);
  const approved = new Set(input.leads.filter((l) => l.status === "approved" && l.organizationId).map((l) => l.organizationId as string));
  const board: Record<BoardStage, BoardCard[]> = { found: [], demo_built: [], approved: [], sent: [], replied: [] };
  for (const d of input.demos) {
    const id = d.organizationId;
    const stage: BoardStage = replied.has(id) ? "replied" : sent.has(id) ? "sent" : approved.has(id) ? "approved" : built.has(id) ? "demo_built" : "found";
    board[stage].push({ key: `org:${id}`, name: d.name || "unknown", stage, leadId: null, organizationId: id });
  }
  for (const l of input.leads) {
    if (l.status !== "pending") continue;
    board.found.push({ key: `lead:${l.id}`, name: l.name || "unknown", stage: "found", leadId: l.id, organizationId: null });
  }
  return board;
}
