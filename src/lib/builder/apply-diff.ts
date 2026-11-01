/**
 * Before/after rows for the "Inspect changes" drawer on an applied request.
 *
 * Pure and read-only. "Before" is the restore point the apply saved first;
 * "after" is the website as it is now (pages, sections, components) plus the
 * look settings (theme, tokens, custom CSS) stored beside it. Customer sites
 * are database content, so rows are content and JSON/CSS values, not source
 * files. A row only exists where the two sides really differ.
 */
import { readFullSnapshot, type FullComponent, FullPage, FullSection, FullSnapshot } from "@/lib/site-restore";

export type ApplyDiffRow = {
  /** Where: page, then section or component. */
  where: string;
  /** What field changed (plain words, or a JSON path for settings). */
  field: string;
  before: string;
  after: string;
  change: "added" | "removed" | "changed";
  /** json = a settings value (monospace); text = visible copy. */
  format: "text" | "json";
};

const MAX_SETTINGS_ROWS_PER_OWNER = 40;
const MAX_VALUE_CHARS = 4000;

const str = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const clip = (value: string) =>
  value.length > MAX_VALUE_CHARS ? `${value.slice(0, MAX_VALUE_CHARS)}… (cut)` : value;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Flattens a JSON value to path -> leaf string. Arrays index by position. */
export function flattenJson(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: unknown, path: string) => {
    if (isObject(node)) {
      const keys = Object.keys(node).sort();
      if (!keys.length && path) out.set(path, "{}");
      for (const key of keys) walk(node[key], path ? `${path}.${key}` : key);
    } else if (Array.isArray(node)) {
      if (!node.length && path) out.set(path, "[]");
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (path) {
      out.set(path, str(node));
    }
  };
  walk(value, prefix);
  return out;
}

/** One row per changed leaf between two JSON-like values. */
export function diffJson(
  where: string,
  before: unknown,
  after: unknown,
  pathPrefix = "",
): ApplyDiffRow[] {
  const a = flattenJson(before, pathPrefix);
  const b = flattenJson(after, pathPrefix);
  const rows: ApplyDiffRow[] = [];
  for (const [path, next] of b) {
    const prev = a.get(path);
    if (prev === undefined) {
      rows.push({ where, field: path, before: "", after: clip(next), change: "added", format: "json" });
    } else if (prev !== next) {
      rows.push({ where, field: path, before: clip(prev), after: clip(next), change: "changed", format: "json" });
    }
  }
  for (const [path, prev] of a) {
    if (!b.has(path)) {
      rows.push({ where, field: path, before: clip(prev), after: "", change: "removed", format: "json" });
    }
  }
  return rows.slice(0, MAX_SETTINGS_ROWS_PER_OWNER);
}

const textRow = (
  where: string,
  field: string,
  before: unknown,
  after: unknown,
): ApplyDiffRow | null => {
  const a = str(before);
  const b = str(after);
  if (a === b) return null;
  return {
    where,
    field,
    before: clip(a),
    after: clip(b),
    change: !a ? "added" : !b ? "removed" : "changed",
    format: "text",
  };
};

const push = (rows: ApplyDiffRow[], row: ApplyDiffRow | null) => {
  if (row) rows.push(row);
};

const pageName = (page: FullPage) => page.title || page.slug || "Page";
const sectionName = (section: FullSection) =>
  section.heading?.trim() ? `${section.kind} · ${section.heading.trim()}` : section.kind;

function diffComponent(
  rows: ApplyDiffRow[],
  where: string,
  before: FullComponent | undefined,
  after: FullComponent | undefined,
) {
  const name = (c: FullComponent) => `${where} › ${c.kind}${c.label ? ` · ${c.label}` : ""}`;
  if (!before && after) {
    rows.push({ where: name(after), field: "item", before: "", after: after.label || after.body || after.kind, change: "added", format: "text" });
    return;
  }
  if (before && !after) {
    rows.push({ where: name(before), field: "item", before: before.label || before.body || before.kind, after: "", change: "removed", format: "text" });
    return;
  }
  if (!before || !after) return;
  const at = name(after);
  push(rows, textRow(at, "label", before.label, after.label));
  push(rows, textRow(at, "text", before.body, after.body));
  push(rows, textRow(at, "link text", before.link_label, after.link_label));
  push(rows, textRow(at, "link address", before.link_url, after.link_url));
  push(rows, textRow(at, "image", before.media_url, after.media_url));
  push(rows, textRow(at, "order", before.sort_order, after.sort_order));
  if (before.is_visible !== after.is_visible)
    push(rows, textRow(at, "visibility", before.is_visible ? "shown" : "hidden", after.is_visible ? "shown" : "hidden"));
  rows.push(...diffJson(at, before.settings, after.settings, "settings"));
}

function diffSection(
  rows: ApplyDiffRow[],
  page: string,
  before: FullSection | undefined,
  after: FullSection | undefined,
) {
  if (!before && after) {
    rows.push({ where: `${page} › ${sectionName(after)}`, field: "section", before: "", after: sectionName(after), change: "added", format: "text" });
    return;
  }
  if (before && !after) {
    rows.push({ where: `${page} › ${sectionName(before)}`, field: "section", before: sectionName(before), after: "", change: "removed", format: "text" });
    return;
  }
  if (!before || !after) return;
  const where = `${page} › ${sectionName(after)}`;
  push(rows, textRow(where, "heading", before.heading, after.heading));
  push(rows, textRow(where, "subheading", before.subheading, after.subheading));
  push(rows, textRow(where, "text", before.body, after.body));
  push(rows, textRow(where, "layout", before.variant, after.variant));
  push(rows, textRow(where, "order", before.sort_order, after.sort_order));
  if (before.is_visible !== after.is_visible)
    push(rows, textRow(where, "visibility", before.is_visible ? "shown" : "hidden", after.is_visible ? "shown" : "hidden"));
  rows.push(...diffJson(where, before.settings, after.settings, "settings"));

  const beforeIds = new Map((before.components ?? []).map((c) => [c.id, c]));
  const afterIds = new Map((after.components ?? []).map((c) => [c.id, c]));
  for (const [id, component] of afterIds) diffComponent(rows, where, beforeIds.get(id), component);
  for (const [id, component] of beforeIds) if (!afterIds.has(id)) diffComponent(rows, where, component, undefined);
}

/** Content diff between the restore point and the website as it is now. */
export function diffApplied(before: FullSnapshot | null, after: FullSnapshot | null): ApplyDiffRow[] {
  const rows: ApplyDiffRow[] = [];
  if (!before || !after) return rows;
  const beforePages = new Map(before.pages.map((p) => [p.id, p]));
  const afterPages = new Map(after.pages.map((p) => [p.id, p]));

  for (const [id, page] of afterPages) {
    const prev = beforePages.get(id);
    const name = pageName(page);
    if (!prev) {
      rows.push({ where: name, field: "page", before: "", after: name, change: "added", format: "text" });
      continue;
    }
    push(rows, textRow(name, "page name", prev.title, page.title));
    push(rows, textRow(name, "search title", prev.seo_title, page.seo_title));
    push(rows, textRow(name, "search description", prev.seo_description, page.seo_description));
    push(rows, textRow(name, "hidden from search", prev.noindex, page.noindex));
    const bs = new Map((prev.sections ?? []).map((s) => [s.id, s]));
    const as = new Map((page.sections ?? []).map((s) => [s.id, s]));
    for (const [sid, section] of as) diffSection(rows, name, bs.get(sid), section);
    for (const [sid, section] of bs) if (!as.has(sid)) diffSection(rows, name, section, undefined);
  }
  for (const [id, page] of beforePages) {
    if (!afterPages.has(id)) {
      const name = pageName(page);
      rows.push({ where: name, field: "page", before: name, after: "", change: "removed", format: "text" });
    }
  }
  return rows;
}

/** Look settings (theme, tokens, custom CSS) stored beside the pages. */
export function diffLook(before: unknown, after: unknown): ApplyDiffRow[] {
  return diffJson("Site look", before, after);
}

export type ApplyDiffGroup = { where: string; rows: ApplyDiffRow[] };

export function groupRows(rows: ApplyDiffRow[]): ApplyDiffGroup[] {
  const groups = new Map<string, ApplyDiffRow[]>();
  for (const row of rows) {
    const list = groups.get(row.where) ?? [];
    list.push(row);
    groups.set(row.where, list);
  }
  return [...groups].map(([where, list]) => ({ where, rows: list }));
}

/** Plain-text copy of the diff: "- before / + after" per row. */
export function diffToText(rows: ApplyDiffRow[]): string {
  return groupRows(rows)
    .map((group) =>
      [
        group.where,
        ...group.rows.flatMap((row) => [
          `  ${row.field} (${row.change})`,
          ...(row.before ? row.before.split("\n").map((line) => `  - ${line}`) : []),
          ...(row.after ? row.after.split("\n").map((line) => `  + ${line}`) : []),
        ]),
      ].join("\n"),
    )
    .join("\n\n");
}

/** Restore-point row -> exact page snapshot (two stored shapes exist). */
export function snapshotFromVersionPages(pages: unknown): FullSnapshot | null {
  if (!pages || typeof pages !== "object") return null;
  const record = pages as Record<string, unknown>;
  return readFullSnapshot(record) ?? readFullSnapshot(record["full"]);
}
