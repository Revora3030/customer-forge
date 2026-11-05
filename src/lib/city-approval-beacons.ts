import type { WriteProposal } from "@/lib/jarvis-actions";
import type { DistrictId } from "@/lib/ai-city";

/**
 * JC-14: which AI City district owns each waiting Jarvis approval.
 *
 * The district comes from the action id (never from model text). The table is typed to every
 * write proposal, so a new action id won't compile until it has a district;
 * an id from elsewhere sits with Jarvis Tower rather than being dropped.
 */
export const APPROVAL_DISTRICT: Record<WriteProposal["id"], DistrictId> = {
  "research.ask": "executive",
  "routine.create": "executive",
  "routine.update": "executive",
  "routine.delete": "executive",
  "demo.build": "factory",
  "builds.recover": "factory",
  "image.create": "creative",
  "demo.send": "growth",
  "instagram.post": "growth",
  "autopilot.configure": "growth",
  "autopilot.run": "growth",
  "code.pr": "security",
  "claude.code": "security",
  "claude.fix": "security",
  "memory.forget": "knowledge",
};

export function districtForApproval(actionId: string): DistrictId {
  return Object.prototype.hasOwnProperty.call(APPROVAL_DISTRICT, actionId)
    ? APPROVAL_DISTRICT[actionId as WriteProposal["id"]]
    : "executive";
}

/** Set by a beacon tap; the Jarvis approvals inbox (#816) opens itself once and clears it. */
export const OPEN_APPROVALS_FLAG = "revora:open-approvals";

export type ApprovalBeaconItem = { action_id: string; state: string };
export type ApprovalBeaconState =
  | { status: "unavailable" }
  | { status: "ok"; total: number; byDistrict: Partial<Record<DistrictId, number>> };

/**
 * Beacon data from the approvals list. `null` (the read failed or hasn't
 * finished) is "unavailable", never zero: no beacon is drawn and the status
 * line says so. A read that worked and found nothing waiting is `total: 0`.
 */
export function approvalBeacons(
  items: readonly ApprovalBeaconItem[] | null | undefined,
): ApprovalBeaconState {
  if (!items) return { status: "unavailable" };
  const byDistrict: Partial<Record<DistrictId, number>> = {};
  let total = 0;
  for (const item of items) {
    if (item.state !== "pending" && item.state !== "failed") continue;
    const id = districtForApproval(item.action_id);
    byDistrict[id] = (byDistrict[id] ?? 0) + 1;
    total += 1;
  }
  return { status: "ok", total, byDistrict };
}

/** The one line the status chip shows. */
export function approvalBeaconLabel(state: ApprovalBeaconState): string {
  if (state.status === "unavailable") return "Approvals unavailable";
  if (state.total === 0) return "No approvals waiting";
  return `${state.total} approval${state.total === 1 ? "" : "s"} waiting`;
}

/** Districts to light, in a stable order, with counts. Empty when unavailable. */
export function beaconDistricts(
  state: ApprovalBeaconState,
  order: readonly DistrictId[],
): { id: DistrictId; count: number }[] {
  if (state.status !== "ok") return [];
  return order.flatMap((id) => {
    const count = state.byDistrict[id] ?? 0;
    return count > 0 ? [{ id, count }] : [];
  });
}
