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
import { INTERACTIVE_PRIMITIVES, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";
import { detectGenericPhrases } from "@/lib/builder/genericity";
import { sceneScrim } from "@/lib/builder/cinematic-primitives";
import { contrastRatio } from "@/lib/readable-color";

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
    | "stock_phrasing"
    | "missing_action"
    | "duplicate_h1"
    | "flat_page"
    | "lead_not_scene"
    | "scene_text_contrast"
    | "page_missing_interactive"
    | "duplicate_text"
    | "empty_column";
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

const TUCKED = new Set(["card", "offer_card", "collection_row", "gallery", "marquee", "compare", "spin_viewer", "tabs", "tab_group", "accordion", "toggle"]);

/** A scene/chapters block, or a media node shown as a hero (not tucked inside a card, gallery or control). */
function hasHeroVisual(root: CompositionNode): boolean {
  const go = (node: CompositionNode, depth: number, tucked: boolean): boolean => {
    if ((node.type === "scene" || node.type === "scroll_chapters") && depth <= 3) return Boolean(node.children?.[0]?.src || node.children?.[0]?.mediaRef || node.type === "scroll_chapters");
    if (node.type === "media" && (node.src || node.mediaRef) && !tucked && depth <= 4) {
      const width = node.style?.maxWidth;
      return typeof width !== "number" || width >= 480;
    }
    const nextTucked = tucked || TUCKED.has(node.type);
    return (node.children ?? []).some((child) => go(child, depth + 1, nextTucked));
  };
  return go(root, 0, false);
}

const TEXT_SLOT = new Set(["heading", "text", "list", "quote"]);

/**
 * Scenes: the renderer computes a scrim that makes its ink pass AA over any
 * photo. These findings report what the AI authored that the renderer would
 * otherwise have to override: an ink/scrim pair that can never be readable,
 * or a slot colour that fails over the computed scrim surfaces.
 */
function sceneContrastFindings(nodes: Visit[]): DesignFinding[] {
  const out: DesignFinding[] = [];
  for (const { node, path } of nodes) {
    if (node.type !== "scene" || !(node.children?.[0]?.src || node.children?.[0]?.mediaRef)) continue;
    const authoredInk = node.style?.color;
    const scrim = sceneScrim({ ink: authoredInk ?? null, scrim: node.scrim?.color ?? null, opacity: node.scrim?.opacity ?? null });
    if (authoredInk && scrim.required === null) {
      out.push({
        code: "scene_text_contrast",
        severity: "critical",
        path,
        fix: `This scene's text colour ${authoredInk} can never be read over its ${scrim.scrim} scrim on a photograph. Use a scrim colour opposite the text (a deep scrim under light text, or a pale one under dark text) so the headline passes 4.5:1.`,
      });
      continue;
    }
    const [light, dark] = scrim.surfaces;
    (node.children ?? []).slice(1).forEach((child, index) => {
      if (!TEXT_SLOT.has(child.type) || !child.style?.color || child.style.background) return;
      const large = child.type === "heading" || (child.style.size ?? 0) >= 24;
      const need = large ? 3 : 4.5;
      const worst = Math.min(contrastRatio(child.style.color, light) ?? 21, contrastRatio(child.style.color, dark) ?? 21);
      if (worst < need)
        out.push({
          code: "scene_text_contrast",
          severity: "major",
          path: `${path}.children[${index + 1}]`,
          fix: `Over this scene's photo the ${child.type} colour ${child.style.color} reaches only ${worst.toFixed(2)}:1 against the computed ${scrim.scrim} scrim (needs ${need}:1). Choose a colour that passes over the scrim, or a stronger scrim opacity.`,
        });
    });
  }
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
  options: {
    lead: boolean;
    role?: string | null;
    /**
     * How many of the section's own pictures were supplied. Only when this is
     * known and above zero can a text-only opening be repaired by the AI;
     * unknown availability is left to the rendered opening-visual check.
     */
    mediaAvailable?: number;
  },
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

  // 1b. The opening is a real photographic scene or media hero, not text-only.
  if (options.lead && (options.mediaAvailable ?? 0) > 0 && !functional && !hasHeroVisual(tree.root))
    findings.push({
      code: "lead_not_scene",
      severity: "critical",
      path: "root",
      fix: "This page's opening section is text-only although its own pictures were supplied. Open with a full-viewport scene (children[0] is the supplied picture as its media backdrop, the headline and primary button in its anchored copy slot) or a full-bleed media hero — not a picture tucked into a card.",
    });

  // 1c. Text over a scene's photo passes AA against the computed scrim.
  for (const finding of sceneContrastFindings(nodes)) findings.push(finding);

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

  // 7. Selling sections end in a working action. A services list, offer, or
  // closing call-to-action with no button is a dead end for the visitor.
  const sellingRole = /^(services?|pricing|packages?|offer|cta|call_to_action|closing|final_cta|benefits|process|how_it_works|service_area|about|story)$/i;
  if (!options.lead && !functional && !actions.length && options.role && sellingRole.test(options.role))
    findings.push({
      code: "missing_action",
      severity: "major",
      path: "root",
      fix: "This section has no button, so the visitor reaches a dead end. Add one clear action button (Book, Get a quote, Call or Contact) linking to a supplied page, tel: or mailto: address.",
    });

  // 8. No stock AI phrasing in anything the visitor reads.
  const visible = nodes.flatMap((v) => [v.node.text, ...(v.node.items ?? [])]).filter(Boolean);
  const stock = detectGenericPhrases(visible);
  if (stock.length)
    findings.push({
      code: "stock_phrasing",
      severity: "major",
      path: "root",
      fix: `Replace stock AI phrasing (${stock.map((hit) => `"${hit.phrase}"`).join(", ")}) with plain, specific wording from the supplied material.`,
    });

  // 9. Breathing room.
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

/**
 * The AI's own motion and depth direction for the site, read from its brief.
 * Only used to hold the composed pages to what the AI itself asked for.
 */
export type DepthDirection = {
  motionLevel?: string | null;
  shadow?: string | null;
};

const NO_MOTION = /^\s*(none|no|minimal|static|off|still)\b/i;
const NO_SHADOW = /^\s*(none|no|flat|off)\b/i;

/** What the AI's brief asks for, in its own words. */
function depthAsks(direction: DepthDirection | null | undefined): string[] {
  const motion = (direction?.motionLevel ?? "").trim();
  const shadow = (direction?.shadow ?? "").trim();
  return [
    motion && !NO_MOTION.test(motion) ? `motion ("${motion.slice(0, 80)}")` : null,
    shadow && !NO_SHADOW.test(shadow) ? `depth ("${shadow.slice(0, 80)}")` : null,
  ].filter((entry): entry is string => entry !== null);
}

/** True when the AI's brief calls for motion or visual depth. */
export function briefAsksForDepth(direction: DepthDirection | null | undefined): boolean {
  return depthAsks(direction).length > 0;
}

/** Reads the motion level and shadow language from a JSON look summary, when present. */
export function depthDirectionFromLook(lookSummary: string | null | undefined): DepthDirection | null {
  if (!lookSummary) return null;
  try {
    const parsed = JSON.parse(lookSummary) as { motion?: { level?: unknown }; shapeLanguage?: { shadow?: unknown } };
    const motionLevel = typeof parsed?.motion?.level === "string" ? parsed.motion.level : null;
    const shadow = typeof parsed?.shapeLanguage?.shadow === "string" ? parsed.shapeLanguage.shadow : null;
    return motionLevel || shadow ? { motionLevel, shadow } : null;
  } catch {
    return null;
  }
}

/** A node that moves, responds to the pointer, or sits on its own layer. */
function hasDepthNode(tree: CompositionTree): boolean {
  return walk(tree.root).some(({ node }) => {
    if (node.motion && node.motion.kind !== "none") return true;
    if (node.hover && Object.keys(node.hover).length > 0) return true;
    const style = node.style;
    if (!style) return false;
    return (
      style.position === "absolute" ||
      style.position === "sticky" ||
      typeof style.zIndex === "number" ||
      typeof style.overlap === "number" ||
      (typeof style.rotate === "number" && style.rotate !== 0) ||
      (typeof style.blur === "number" && style.blur > 0) ||
      (style.shadow !== undefined && style.shadow !== "none")
    );
  });
}

/** Findings for every section of one page, keyed by section id. */
export function auditPageDesign(
  sections: { id: string; role: string; tree: CompositionTree; mediaAvailable?: number }[],
  options: {
    direction?: DepthDirection | null;
    /**
     * The site's home page carries the site's interactive centrepiece: with
     * none on it, a first build could ship with no interactive primitive.
     */
    home?: boolean;
  } = {},
): Record<string, DesignFinding[]> {
  const out: Record<string, DesignFinding[]> = {};
  sections.forEach((section, index) => {
    const findings = auditSectionDesign(section.tree, {
      lead: index === 0,
      role: section.role,
      ...(section.mediaAvailable !== undefined ? { mediaAvailable: section.mediaAvailable } : {}),
    });
    if (findings.length) out[section.id] = findings;
  });

  if (options.home && sections.length && !sections.some((section) => hasInteractive(section.tree))) {
    // Attached to the first content section after the opening (the opening
    // keeps its own bar); the AI chooses where the centrepiece really fits.
    const target = sections[1] ?? sections[0]!;
    (out[target.id] ??= []).push({
      code: "page_missing_interactive",
      severity: "major",
      path: "root",
      fix: "The home page has no interactive centrepiece, so the whole site has none. Where it serves real supplied material, add one: a spin_viewer (8+ owner-photographed angles), a collection_row of offer cards, scroll_chapters of scenes, a tab_group, a faq_accordion of supplied FAQs, or a before_after_slider of the owner's own before/after photos.",
    });
  }

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

  // One page, one level-1 heading, across every composition on it.
  let firstH1Seen = false;
  for (const section of sections) {
    for (const visit of walk(section.tree.root)) {
      if (visit.node.type !== "heading" || visit.node.level !== 1) continue;
      if (!firstH1Seen) {
        firstH1Seen = true;
        continue;
      }
      (out[section.id] ??= []).push({
        code: "duplicate_h1",
        severity: "critical",
        path: visit.path,
        fix: "This page already has a level-1 heading in an earlier section. A page has exactly one; make this heading level 2 (keep its look if it should stay large).",
      });
    }
  }

  // Repeated wording: the same sentence shown twice on one page reads as filler.
  const seenText = new Map<string, string>();
  for (const section of sections) {
    for (const visit of walk(section.tree.root)) {
      const raw = (visit.node.text ?? "").trim();
      const key = raw.toLowerCase().replace(/\s+/g, " ");
      if (key.length < 40) continue;
      if (seenText.has(key)) {
        (out[section.id] ??= []).push({
          code: "duplicate_text",
          severity: "major",
          path: visit.path,
          fix: "This exact wording already appears earlier on this page. Rewrite it so each section says something new, or remove the repeat.",
        });
      } else seenText.set(key, section.id);
    }
  }

  // Empty column: a multi-column grid/row with a cell that has no words or picture
  // leaves a blank area on desktop.
  const hasContent = (node: CompositionNode): boolean =>
    walk(node).some(({ node: n }) => !CONTAINERS.has(n.type) || Boolean((n.text ?? "").trim()) || Boolean(n.src || n.mediaRef));
  for (const section of sections) {
    for (const visit of walk(section.tree.root)) {
      if (visit.node.type !== "grid" && visit.node.type !== "row") continue;
      const kids = visit.node.children ?? [];
      if (kids.length < 2) continue;
      kids.forEach((child, index) => {
        if (hasContent(child)) return;
        (out[section.id] ??= []).push({
          code: "empty_column",
          severity: "major",
          path: `${visit.path}.children[${index}]`,
          fix: "This column has no words or picture, so desktop shows a blank area. Fill it with supplied content or a supplied picture, or remove the column and let the layout span full width.",
        });
      });
    }
  }

  // The AI's own brief asked for motion or depth; a page with none of it reads flat.
  const first = sections[0];
  if (first && briefAsksForDepth(options.direction) && !sections.some((section) => hasDepthNode(section.tree)))
    (out[first.id] ??= []).push({
      code: "flat_page",
      severity: "major",
      path: "root",
      fix: `The approved brief calls for ${depthAsks(options.direction).join(" and ")}, but this page has no motion, hover response or layered element. Add the motion, hover or layering the brief describes where it helps the content (it is skipped for reduced-motion visitors).`,
    });
  return out;
}

/** True when a tree contains a primitive the visitor operates. */
export function hasInteractive(tree: CompositionTree): boolean {
  return walk(tree.root).some(({ node }) => INTERACTIVE_PRIMITIVES.has(node.type));
}

/** Gates that always go back to the AI, whatever their severity. */
const ALWAYS_REPAIR = new Set<DesignFinding["code"]>(["flat_page", "lead_not_scene", "scene_text_contrast", "page_missing_interactive"]);

/** True when any finding must be fixed before the section ships. */
export function needsDesignRepair(findings: DesignFinding[]): boolean {
  // A flat page is a miss against the AI's own brief, so it always goes back;
  // so do the cinematic gates (scene opening, readable scene text, one
  // interactive centrepiece).
  return (
    findings.some((finding) => finding.severity === "critical" || ALWAYS_REPAIR.has(finding.code)) ||
    findings.length >= 3
  );
}
