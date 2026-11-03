/**
 * RESULT CARDS — data adapters for the Sol / Terra / Luna cards in the builder chat.
 *
 * Pure functions, no network. Each card shows only what was actually produced:
 *
 * - Sol  : the creative brief the AI already returned (CompositionPreview).
 * - Terra: contrast, tap-target and overflow-at-320 readings taken from stored
 *          browser QA rows (website_visual_reports). A reading with no stored
 *          measurement is "NOT VERIFIED", never a pass and never a number.
 * - Luna : title, meta description and JSON-LD types read from the head the
 *          site really emits (tenantSiteHead), with character counts.
 *
 * No out-of-100 score is made up here.
 */
import type { CompositionPreview } from "@/lib/builder/composition-preview";

export type CheckState = "pass" | "fail" | "not_verified";

export type TerraCheck = {
  id: "contrast" | "tap_targets" | "overflow_320";
  label: string;
  state: CheckState;
  detail: string;
};

export type TerraBadge = {
  /** ISO time of the newest stored measurement used, or null when none. */
  measuredAt: string | null;
  checks: TerraCheck[];
};

export type VisualReportRow = {
  measured_at: string;
  page_slug?: string | null;
  measurements: unknown;
};

const NOT_VERIFIED_DETAIL = "NOT VERIFIED: no browser measurement is stored for this.";

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : [];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Newest measurement per page, so an old run never outvotes a newer one. */
function newestPerPage(rows: VisualReportRow[]): VisualReportRow[] {
  const sorted = [...rows].sort((a, b) => (a.measured_at < b.measured_at ? 1 : a.measured_at > b.measured_at ? -1 : 0));
  const seen = new Set<string>();
  const out: VisualReportRow[] = [];
  sorted.forEach((row, index) => {
    const key = row.page_slug ? `page:${row.page_slug}` : `row:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
}

export function terraBadge(rows: VisualReportRow[] | null | undefined): TerraBadge {
  const latest = newestPerPage(rows ?? []);
  const measurements = latest.flatMap((row) => asRecords(row.measurements));
  const measuredAt = latest.length ? latest.map((r) => r.measured_at).sort().at(-1) ?? null : null;

  // Contrast: only when the accessibility pass ran (it carries a lowContrast list).
  const a11y = measurements.map((m) => m["accessibility"]).filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && Array.isArray((a as Record<string, unknown>)["lowContrast"]));
  let contrast: TerraCheck;
  if (a11y.length === 0) {
    contrast = { id: "contrast", label: "Colour contrast", state: "not_verified", detail: NOT_VERIFIED_DETAIL };
  } else {
    const low = a11y.flatMap((a) => asRecords(a["lowContrast"]));
    const ratios = low.map((entry) => num(entry["ratio"])).filter((r): r is number => r !== null);
    contrast = low.length === 0
      ? { id: "contrast", label: "Colour contrast", state: "pass", detail: "No text below the WCAG AA ratio was measured." }
      : { id: "contrast", label: "Colour contrast", state: "fail", detail: `${low.length} text element${low.length === 1 ? "" : "s"} below the WCAG AA ratio${ratios.length ? `; lowest measured ${Math.min(...ratios).toFixed(2)}:1` : ""}.` };
  }

  // Tap targets: only when a viewport reading carries a smallTargets list.
  const tapRows = measurements.filter((m) => Array.isArray(m["smallTargets"]));
  let tap: TerraCheck;
  if (tapRows.length === 0) {
    tap = { id: "tap_targets", label: "Tap targets", state: "not_verified", detail: NOT_VERIFIED_DETAIL };
  } else {
    const small = tapRows.flatMap((m) => asRecords(m["smallTargets"]));
    const sizes = small.map((s) => Math.min(num(s["width"]) ?? Infinity, num(s["height"]) ?? Infinity)).filter((n) => Number.isFinite(n));
    tap = small.length === 0
      ? { id: "tap_targets", label: "Tap targets", state: "pass", detail: "No undersized tap targets were measured." }
      : { id: "tap_targets", label: "Tap targets", state: "fail", detail: `${small.length} control${small.length === 1 ? "" : "s"} measured too small${sizes.length ? `; smallest ${Math.round(Math.min(...sizes))}px` : ""}.` };
  }

  // Overflow at 320 px: only a reading taken at exactly 320 counts.
  const at320 = measurements.filter((m) => num(m["width"]) === 320 && Array.isArray(m["overflowing"]));
  let overflow: TerraCheck;
  if (at320.length === 0) {
    overflow = { id: "overflow_320", label: "Overflow at 320 px", state: "not_verified", detail: "NOT VERIFIED: the site was not measured at 320 px." };
  } else {
    const count = at320.reduce((sum, m) => sum + asRecords(m["overflowing"]).length, 0);
    overflow = count === 0
      ? { id: "overflow_320", label: "Overflow at 320 px", state: "pass", detail: "Nothing wider than the screen was measured at 320 px." }
      : { id: "overflow_320", label: "Overflow at 320 px", state: "fail", detail: `${count} element${count === 1 ? "" : "s"} wider than the screen at 320 px.` };
  }

  return { measuredAt, checks: [contrast, tap, overflow] };
}

export type LunaCard = {
  title: { present: boolean; length: number; text: string };
  description: { present: boolean; length: number; text: string };
  /** Distinct schema.org @type values found in the emitted JSON-LD, in order. */
  jsonLdTypes: string[];
  jsonLdBlocks: number;
  /** True when the emitted head carries a noindex robots tag. */
  noindex: boolean;
};

type HeadLike = {
  meta?: Array<Record<string, unknown>>;
  scripts?: Array<{ type?: string; children?: unknown }>;
};

function collectTypes(value: unknown, into: string[]): void {
  if (Array.isArray(value)) { value.forEach((v) => collectTypes(v, into)); return; }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  for (const t of Array.isArray(type) ? type : [type]) {
    if (typeof t === "string" && t && !into.includes(t)) into.push(t);
  }
  Object.values(record).forEach((v) => collectTypes(v, into));
}

/** Reads the head a page really emits. Missing pieces are reported as missing, never filled in. */
export function lunaCard(head: HeadLike | null | undefined): LunaCard | null {
  if (!head) return null;
  const meta = head.meta ?? [];
  const title = String(meta.find((m) => typeof m["title"] === "string")?.["title"] ?? "").trim();
  const description = String(meta.find((m) => m["name"] === "description")?.["content"] ?? "").trim();
  const types: string[] = [];
  let blocks = 0;
  for (const script of head.scripts ?? []) {
    if (script.type !== "application/ld+json" || typeof script.children !== "string") continue;
    try {
      collectTypes(JSON.parse(script.children), types);
      blocks += 1;
    } catch {
      // A block that does not parse is not counted as structured data.
    }
  }
  const noindex = meta.some((m) => m["name"] === "robots" && typeof m["content"] === "string" && /noindex/i.test(m["content"] as string));
  return {
    title: { present: title.length > 0, length: title.length, text: title },
    description: { present: description.length > 0, length: description.length, text: description },
    jsonLdTypes: types,
    jsonLdBlocks: blocks,
    noindex,
  };
}

export type SolBrief = {
  styleName: string;
  mood: string;
  tone: "light" | "dark";
  font: string;
  fontNote: string;
  because: string;
  colors: { primary: string; secondary: string; accent: string };
  brandLocked: boolean;
};

export function solBrief(composition: CompositionPreview | null | undefined): SolBrief | null {
  if (!composition) return null;
  const { styleName, mood, tone, font, fontNote, because, colors, brandLocked } = composition;
  return { styleName, mood, tone, font, fontNote, because, colors, brandLocked };
}
