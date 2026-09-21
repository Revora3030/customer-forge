/**
 * Draft branches — the pure model.
 *
 * A draft branch lets a workspace try changes on a separate copy of its website
 * and then either keep them or throw them away, without the live tree ever
 * being left in a half-changed state.
 *
 * How it works, deliberately built on the existing exact-snapshot engine rather
 * than a second website tree:
 *
 *  - Starting a draft takes an exact copy of the website as it is right now
 *    (the "base"). Editing then continues on the working tree as usual.
 *  - Keeping the draft simply closes it: the working tree is already the result.
 *  - Throwing the draft away restores the base through the same atomic restore
 *    used by restore points, so the website goes back exactly as it was.
 *
 * Publishing is blocked while a draft is open, because the working tree is
 * experimental until the owner decides. Everything in this module is pure so it
 * can be unit tested; the database work lives in `site-branch.functions.ts`.
 */

import { countSnapshot, type FullPage, type FullSnapshot } from "@/lib/site-restore";

export type BranchStatus = "open" | "kept" | "discarded";

export type DraftBranch = {
  id: string;
  label: string;
  status: BranchStatus;
  createdAt: string;
  closedAt: string | null;
  summary: BranchChange | null;
};

export type BranchChange = {
  pagesAdded: number;
  pagesRemoved: number;
  pagesChanged: number;
  sectionsBefore: number;
  sectionsAfter: number;
  componentsBefore: number;
  componentsAfter: number;
};

export const BRANCH_LABEL_LIMIT = 80;

/** Trims and bounds a user-supplied draft name, falling back to a plain one. */
export function normaliseBranchLabel(value: unknown, fallback = "Draft"): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  return text.slice(0, BRANCH_LABEL_LIMIT);
}

/** Only one draft may be open per workspace, so intent is never ambiguous. */
export function canStartBranch(openBranch: DraftBranch | null | undefined): {
  ok: boolean;
  reason: string;
} {
  if (openBranch)
    return {
      ok: false,
      reason: `“${openBranch.label}” is still open. Keep it or throw it away before starting another draft.`,
    };
  return { ok: true, reason: "" };
}

/** Publishing while a draft is open would put experimental work live. */
export function publishBlockReason(openBranch: DraftBranch | null | undefined): string | null {
  if (!openBranch) return null;
  return `Your draft “${openBranch.label}” is still open. Keep it or throw it away, then publish.`;
}

function pageFingerprint(page: FullPage): string {
  return JSON.stringify([
    page.slug,
    page.title,
    page.kind,
    page.seo_title,
    page.seo_description,
    page.seo_canonical,
    page.og_title,
    page.og_description,
    page.og_image_url,
    page.noindex,
    page.sort_order,
    page.is_visible,
    page.sections.map((section) => [
      section.kind,
      section.variant,
      section.heading,
      section.subheading,
      section.body,
      section.settings,
      section.sort_order,
      section.is_visible,
      section.components.map((component) => [
        component.kind,
        component.label,
        component.body,
        component.link_label,
        component.link_url,
        component.media_url,
        component.settings,
        component.sort_order,
        component.is_visible,
      ]),
    ]),
  ]);
}

/** Compares the copy taken when the draft started against the website now. */
export function branchChange(base: FullSnapshot, current: FullSnapshot): BranchChange {
  const baseById = new Map(base.pages.map((page) => [page.id, page]));
  const currentById = new Map(current.pages.map((page) => [page.id, page]));

  let pagesAdded = 0;
  let pagesChanged = 0;
  for (const [id, page] of currentById) {
    const before = baseById.get(id);
    if (!before) {
      pagesAdded += 1;
      continue;
    }
    if (pageFingerprint(before) !== pageFingerprint(page)) pagesChanged += 1;
  }
  let pagesRemoved = 0;
  for (const id of baseById.keys()) if (!currentById.has(id)) pagesRemoved += 1;

  const beforeCounts = countSnapshot(base);
  const afterCounts = countSnapshot(current);

  return {
    pagesAdded,
    pagesRemoved,
    pagesChanged,
    sectionsBefore: beforeCounts.sections,
    sectionsAfter: afterCounts.sections,
    componentsBefore: beforeCounts.components,
    componentsAfter: afterCounts.components,
  };
}

/** True when the draft has produced no difference at all. */
export function branchIsUnchanged(change: BranchChange): boolean {
  return (
    change.pagesAdded === 0 &&
    change.pagesRemoved === 0 &&
    change.pagesChanged === 0 &&
    change.sectionsBefore === change.sectionsAfter &&
    change.componentsBefore === change.componentsAfter
  );
}

/** Plain-language description of what the draft has done so far. */
export function describeBranchChange(change: BranchChange): string {
  if (branchIsUnchanged(change)) return "Nothing has changed in this draft yet.";
  const parts: string[] = [];
  if (change.pagesAdded) parts.push(`${change.pagesAdded} new page${plural(change.pagesAdded)}`);
  if (change.pagesRemoved)
    parts.push(`${change.pagesRemoved} page${plural(change.pagesRemoved)} removed`);
  if (change.pagesChanged)
    parts.push(`${change.pagesChanged} page${plural(change.pagesChanged)} edited`);
  const sections = change.sectionsAfter - change.sectionsBefore;
  if (sections)
    parts.push(
      `${Math.abs(sections)} section${plural(Math.abs(sections))} ${sections > 0 ? "added" : "removed"}`,
    );
  const components = change.componentsAfter - change.componentsBefore;
  if (components)
    parts.push(
      `${Math.abs(components)} item${plural(Math.abs(components))} ${components > 0 ? "added" : "removed"}`,
    );
  if (!parts.length) return "Some wording or settings changed in this draft.";
  return `${parts.join(", ")}.`;
}

function plural(count: number) {
  return count === 1 ? "" : "s";
}

/** Reads a stored summary back defensively; unknown shapes become null. */
export function readBranchChange(value: unknown): BranchChange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const num = (key: string) => (typeof row[key] === "number" ? (row[key] as number) : null);
  const keys = [
    "pagesAdded",
    "pagesRemoved",
    "pagesChanged",
    "sectionsBefore",
    "sectionsAfter",
    "componentsBefore",
    "componentsAfter",
  ] as const;
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = num(key);
    if (value === null) return null;
    out[key] = value;
  }
  return out as unknown as BranchChange;
}
