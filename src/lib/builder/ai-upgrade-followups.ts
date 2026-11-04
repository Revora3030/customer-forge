/**
 * Reads the AI upgrades a build left waiting for the owner's OK.
 *
 * When the AI design or writing team is at capacity, the first build ships a
 * facts-only layout or wording and records a pending follow-up
 * (`generation.report.followUps`, kind `layout_upgrade` / `copy_upgrade`).
 * Running the upgrade spends AI credits, so nothing here runs it: the builder
 * shows a banner, and only the owner's press queues the request.
 */

export type AiUpgradeKind = "layout_upgrade" | "copy_upgrade";

export type AiUpgradeFollowUp = {
  kind: AiUpgradeKind;
  /** Plain-language reason recorded by the build, safe to show the owner. */
  reason: string;
  /** Section ids (layout) or wording fields (copy) the upgrade covers. */
  slots: string[];
  recordedAt: string;
};

const KINDS: readonly AiUpgradeKind[] = ["layout_upgrade", "copy_upgrade"];
const MAX_SLOTS = 40;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Pending owner-approval upgrades from a stored `website_settings.generation`, oldest first, one per kind. */
export function readAiUpgradeFollowUps(generation: unknown): AiUpgradeFollowUp[] {
  const report = record(record(generation)?.["report"]);
  const list = report?.["followUps"];
  if (!Array.isArray(list)) return [];
  const byKind = new Map<AiUpgradeKind, AiUpgradeFollowUp>();
  for (const raw of list) {
    const item = record(raw);
    if (!item || item["status"] !== "pending") continue;
    const kind = item["kind"];
    if (!KINDS.includes(kind as AiUpgradeKind)) continue;
    const slots = Array.isArray(item["slots"])
      ? [...new Set(item["slots"].map((slot) => text(slot, 80)).filter(Boolean))].slice(0, MAX_SLOTS)
      : [];
    // The newest entry of a kind replaces an older one.
    byKind.set(kind as AiUpgradeKind, {
      kind: kind as AiUpgradeKind,
      reason: text(item["reason"], 400),
      slots,
      recordedAt: text(item["recordedAt"], 40),
    });
  }
  return KINDS.flatMap((kind) => {
    const found = byKind.get(kind);
    return found ? [found] : [];
  });
}

/** A stable key for one set of pending upgrades, so an approval is remembered per build. */
export function aiUpgradeKey(followUps: readonly AiUpgradeFollowUp[]): string {
  return followUps.map((f) => `${f.kind}@${f.recordedAt}`).join("|");
}

/**
 * The builder request the owner approves. It names exactly what to upgrade
 * and fences the facts: every business fact, price, review and contact detail
 * stays as saved, and nothing may be invented.
 */
export function aiUpgradeInstruction(followUps: readonly AiUpgradeFollowUp[]): string {
  const parts: string[] = [];
  const layout = followUps.find((f) => f.kind === "layout_upgrade");
  const copy = followUps.find((f) => f.kind === "copy_upgrade");
  if (layout) {
    const where = layout.slots.length ? ` (sections: ${layout.slots.join(", ")})` : "";
    parts.push(`Redesign the sections that use the basic facts-only layout${where} with a polished, premium layout that looks great on phones.`);
  }
  if (copy) {
    const where = copy.slots.length ? ` (${copy.slots.join(", ")})` : "";
    parts.push(`Rewrite the basic placeholder wording${where} in a natural, confident voice for this business.`);
  }
  if (!parts.length) return "";
  parts.push(
    "Keep every business fact, service, price, review, phone number, address and opening hour exactly as saved. Do not invent reviews, prices, awards, years in business or any other facts; if something is missing, leave it out.",
  );
  return parts.join(" ");
}

export function aiUpgradeSummary(followUps: readonly AiUpgradeFollowUp[]): string {
  const layout = followUps.some((f) => f.kind === "layout_upgrade");
  const copy = followUps.some((f) => f.kind === "copy_upgrade");
  if (layout && copy) return "Parts of your draft use a basic layout and basic wording built only from your saved details.";
  if (layout) return "Parts of your draft use a basic layout built only from your saved details.";
  if (copy) return "Some headlines and search wording were filled in from your saved details.";
  return "";
}
