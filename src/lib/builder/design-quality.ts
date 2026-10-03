/**
 * DESIGN QUALITY BAR — measurable craft checks for an AI-authored section.
 *
 * The composition validator only proves a tree is SAFE to render. This module
 * measures whether it is GOOD: the things a senior designer (or Lovable/Framer)
 * would never ship — a lead section with no real headline, unreadably small
 * body text, a hero with no action, no phone layout for a multi-column grid,
 * a section that is a single bare line, heading sizes that don't step down,
 * 12-column grids crammed with copy, or text with no line-height.
 *
 * It is a quality gate, not a style: it never prescribes a font, colour or
 * layout. Each finding is written as a concrete repair note the AI art
 * director acts on, and the build sends those notes back to Sol for a revision
 * before anything is saved.
 */
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { detectGenericPhrases } from "@/lib/builder/genericity";

export type DesignFinding = {
  /** Stable code, for logs and tests. */
  code:
    | "lead_missing_h1"
    | "lead_heading_too_small"
    | "lead_missing_action"
    | "body_text_too_small"
    | "heading_scale_flat"
    | "grid_missing_mobile"
    | "too_many_columns"
    | "section_too_thin"
    | "tight_line_height"
    | "low_padding"
    | "long_line_length"
    | "wall_of_text"
    | "stock_phrasing";
  severity: "critical" | "major";
  path: string;
  /** Plain repair instruction for the art director. */
  fix: string;
};

const TEXTUAL = new Set(["text", "list", "quote"]);
const CONTAINERS = new Set(["stack", "grid", "row", "card"]);

type Visit = { node: CompositionNode; path: string; depth: number };

function walk(root: CompositionNode): Visit[] {
  const out: Visit[] = [];
  const go = (node: CompositionNode, path: string, depth: number) => {
    out.push({ node, path, depth });
    (node.children ?? []).forEach((child, index) =>
      go(child, `${path}.children[${index}]`, depth + 1),
    );
    (node.tabs ?? []).forEach((tab, t) =>
      (tab.children ?? []).forEach((child, index) =>
        go(child, `${path}.tabs[${t}].children[${index}]`, depth + 1),
      ),
    );
  };
  go(root, "root", 0);
  return out;
}

const textLength = (node: CompositionNode) =>
  (node.text ?? "").length + (node.items ?? []).join(" ").length;

/**
 * Measures one section tree. `lead` is true for the first content section of a
 * page (the hero / opening), which carries the strictest bar.
 */
export function auditSectionDesign(
  tree: CompositionTree,
  options: { lead: boolean; role?: string | null },
): DesignFinding[] {
  const findings: DesignFinding[] = [];
  const nodes = walk(tree.root);
  const headings = nodes.filter((v) => v.node.type === "heading");
  const texts = nodes.filter((v) => TEXTUAL.has(v.node.type));
  const actions = nodes.filter(
    (v) => (v.node.type === "button" || v.node.type === "link") && Boolean(v.node.href),
  );
  const media = nodes.filter((v) => v.node.type === "media" || v.node.type === "gallery");
  const widgets = nodes.filter((v) => v.node.type === "widget");
  const functional = widgets.length > 0;

  // 1. Opening sections lead with a real, large headline and an action.
  if (options.lead) {
    const h1 = headings.find((v) => v.node.level === 1) ?? headings[0];
    if (!h1)
      findings.push({
        code: "lead_missing_h1",
        severity: "critical",
        path: "root",
        fix: "This is the page's opening section: lead with one level-1 heading that states what the business does, set large (at least 40px on desktop, 30px+ on mobile).",
      });
    else {
      const size = h1.node.style?.size;
      if (typeof size === "number" && size < 36)
        findings.push({
          code: "lead_heading_too_small",
          severity: "major",
          path: h1.path,
          fix: `The opening headline is only ${size}px. Make it the dominant element (40–72px desktop) with a responsive.mobile size of 30–40px.`,
        });
    }
    if (!actions.length && !functional && options.role !== "story")
      findings.push({
        code: "lead_missing_action",
        severity: "critical",
        path: "root",
        fix: "The opening section has no button. Add one clear primary action button (using a supplied href) visible without scrolling, styled as the strongest element after the headline.",
      });
  }

  // 2. Readable body copy.
  for (const v of texts) {
    const size = v.node.style?.size;
    if (typeof size === "number" && size < 14 && textLength(v.node) > 40)
      findings.push({
        code: "body_text_too_small",
        severity: "major",
        path: v.path,
        fix: `Body copy is ${size}px — too small to read on a phone. Use 16–18px for paragraphs (never below 15px).`,
      });
    const lineHeight = v.node.style?.lineHeight;
    if (typeof lineHeight === "number" && lineHeight < 1.3 && textLength(v.node) > 120)
      findings.push({
        code: "tight_line_height",
        severity: "major",
        path: v.path,
        fix: `Paragraph line-height ${lineHeight} is cramped. Use 1.5–1.7 for body copy.`,
      });
    if (textLength(v.node) > 900)
      findings.push({
        code: "wall_of_text",
        severity: "major",
        path: v.path,
        fix: "This is a single wall of text. Break it into short paragraphs, a list or a two-column layout with a pull-quote so it scans.",
      });
  }

  // 3. A heading scale that actually steps down.
  const sized = headings
    .filter((v) => typeof v.node.style?.size === "number")
    .map((v) => ({ level: v.node.level ?? 2, size: v.node.style!.size as number, path: v.path }));
  for (const a of sized)
    for (const b of sized)
      if (a.level < b.level && a.size <= b.size) {
        findings.push({
          code: "heading_scale_flat",
          severity: "major",
          path: b.path,
          fix: `A level-${b.level} heading (${b.size}px) is as large as a level-${a.level} heading (${a.size}px). Give the hierarchy a clear step (roughly 1.25–1.5× per level).`,
        });
        break;
      }

  // 4. Multi-column grids must be designed for phones.
  for (const v of nodes) {
    const columns = v.node.style?.columns;
    if (typeof columns !== "number" || columns <= 1) continue;
    const mobileColumns = v.node.responsive?.mobile?.columns;
    if (columns >= 3 && mobileColumns === undefined)
      findings.push({
        code: "grid_missing_mobile",
        severity: "major",
        path: v.path,
        fix: `This ${columns}-column grid has no phone layout. Add responsive.mobile with columns 1 (or 2 for small tiles) and a tighter gap.`,
      });
    const copyHeavy = (v.node.children ?? []).some((child) => textLength(child) > 160);
    if (columns > 4 && copyHeavy)
      findings.push({
        code: "too_many_columns",
        severity: "major",
        path: v.path,
        fix: `${columns} columns of paragraph copy is cramped on any laptop. Use 2–4 columns, or a bento layout with one large feature cell.`,
      });
  }

  // 5. Long lines are hard to read.
  for (const v of texts) {
    if (textLength(v.node) < 300) continue;
    const width = v.node.style?.maxWidth;
    const parentWidths = nodes
      .filter((p) => v.path.startsWith(`${p.path}.`) && typeof p.node.style?.maxWidth === "number")
      .map((p) => p.node.style!.maxWidth as number);
    const effective =
      typeof width === "number" ? width : parentWidths.length ? Math.min(...parentWidths) : null;
    if (effective === null || effective > 820)
      findings.push({
        code: "long_line_length",
        severity: "major",
        path: v.path,
        fix: "Long paragraphs run edge to edge. Constrain the text column to about 60–75 characters (maxWidth 640–760px).",
      });
  }

  // 6. A section is more than one bare line.
  const contentNodes = nodes.filter(
    (v) => !CONTAINERS.has(v.node.type) && v.node.type !== "spacer" && v.node.type !== "divider",
  );
  if (!functional && contentNodes.length < 2 && media.length === 0)
    findings.push({
      code: "section_too_thin",
      severity: "major",
      path: "root",
      fix: "This section is a single bare element. Give it real structure from the supplied material — heading plus supporting copy, an image, a list or an action.",
    });

  // 7. No stock AI phrasing in anything the visitor reads.
  const visible = nodes.flatMap((v) => [v.node.text, ...(v.node.items ?? [])]).filter(Boolean);
  const stock = detectGenericPhrases(visible);
  if (stock.length)
    findings.push({
      code: "stock_phrasing",
      severity: "major",
      path: "root",
      fix: `Replace stock AI phrasing (${stock.map((hit) => `"${hit.phrase}"`).join(", ")}) with plain, specific wording from the supplied material.`,
    });

  // 8. Breathing room.
  const rootStyle = tree.root.style ?? {};
  const vertical = rootStyle.paddingY ?? rootStyle.padding;
  if (typeof vertical === "number" && vertical < 24 && !functional)
    findings.push({
      code: "low_padding",
      severity: "major",
      path: "root",
      fix: `Section padding of ${vertical}px feels cramped. Use generous vertical space (64–128px desktop, 48–72px mobile) so sections breathe.`,
    });

  return findings;
}

/** Findings for every section of one page, keyed by section id. */
export function auditPageDesign(
  sections: { id: string; role: string; tree: CompositionTree }[],
): Record<string, DesignFinding[]> {
  const out: Record<string, DesignFinding[]> = {};
  sections.forEach((section, index) => {
    const findings = auditSectionDesign(section.tree, { lead: index === 0, role: section.role });
    if (findings.length) out[section.id] = findings;
  });

  // Page rhythm: the same section structure repeated back to back reads as a template.
  const signature = (tree: CompositionTree) =>
    walk(tree.root)
      .filter((v) => v.depth <= 2)
      .map((v) => `${v.node.type}:${v.node.style?.columns ?? ""}`)
      .join("|");
  for (let i = 1; i < sections.length; i += 1) {
    const prev = sections[i - 1]!;
    const cur = sections[i]!;
    if (signature(prev.tree) === signature(cur.tree) && signature(cur.tree).split("|").length > 2) {
      (out[cur.id] ??= []).push({
        code: "section_too_thin",
        severity: "major",
        path: "root",
        fix: "This section repeats the exact structure of the section above it. Vary the composition (split, bento, full-bleed image, offset cards) so the page has rhythm.",
      });
    }
  }
  return out;
}

/** True when any finding must be fixed before the section ships. */
export function needsDesignRepair(findings: DesignFinding[]): boolean {
  return findings.some((finding) => finding.severity === "critical") || findings.length >= 3;
}
