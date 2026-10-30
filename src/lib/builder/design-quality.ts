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
import { MAX_HEAVY_PER_PAGE, overBudget, shaderPalette, shaderTextContrast } from "@/lib/builder/premium-effects";

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
    | "page_mostly_plain"
    | "duplicate_text"
    | "empty_column"
    | "hollow_control"
    | "lead_not_cinematic"
    | "card_missing_body"
    | "action_label_is_heading"
    | "orphan_action"
    | "duplicate_media"
    | "near_duplicate_text"
    | "flat_section_rhythm"
    | "too_many_heavy_effects"
    | "shader_text_contrast";
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
    if (node.type === "scrub_sequence" && depth <= 3) return (node.children ?? []).filter((child) => child.type === "media").length >= 2;
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
      fix: "This page's opening section is text-only although its own pictures were supplied. Open with a full-viewport scene (children[0] is the supplied picture as its media backdrop, the headline and primary button in its anchored copy slot), a scrub_sequence of those pictures, or a full-bleed media hero — not a picture tucked into a card.",
    });

  // 1b2. Several pictures of one subject can be a scroll-scrubbed sequence.
  // A single full-bleed photo still passes. This only fires when the section
  // was given two or more pictures and still opens as plain stacked copy.
  if (options.lead && (options.mediaAvailable ?? 0) >= 2 && !functional && !hasCinematicOpening(tree.root))
    findings.push({
      code: "lead_not_cinematic",
      severity: "major",
      path: "root",
      fix: "This opening was given more than one picture and still reads as a stacked template. When the pictures are one subject, open with a scrub_sequence (2-6 media frames in order, display heading in the overlay). Otherwise open with a full-viewport scene or scroll_chapters. Generated frames stay atmosphere — never a before/after of work the owner did not photograph.",
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

  // 10. An interactive control that is only a label paints as an empty bordered
  // cell (a heading split into "Full" / "Auto detailing" with nothing inside).
  for (const visit of nodes) {
    if (visit.node.type !== "accordion" && visit.node.type !== "tabs" && visit.node.type !== "toggle") continue;
    (visit.node.children ?? []).forEach((child, index) => {
      if (controlHasBody(child)) return;
      findings.push({
        code: "hollow_control",
        severity: "major",
        path: `${visit.path}.children[${index}]`,
        fix: "This control item is only a label, so it renders as an empty box. Put the real supplied answer in its children, or remove the item. Do not split a heading across empty panels.",
      });
    });
  }

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

/** A scene, chapter sequence or scroll-scrubbed still sequence near the top of the tree. */
function hasCinematicOpening(root: CompositionNode): boolean {
  const go = (node: CompositionNode, depth: number): boolean => {
    if (depth > 3) return false;
    if (node.type === "scene" || node.type === "scroll_chapters" || node.type === "scrub_sequence") return true;
    return (node.children ?? []).some((child) => go(child, depth + 1));
  };
  return go(root, 0);
}

/** An accordion, tab or toggle item that is only a label, so it paints as an empty box. */
function controlHasBody(node: CompositionNode): boolean {
  return (node.children ?? []).some((child) => {
    if (child.type === "media" || child.type === "widget" || child.type === "button" || child.type === "link") return true;
    if ((child.text ?? "").trim().length > 0) return true;
    return (child.children ?? []).length > 0 && controlHasBody(child);
  });
}

function hasDepthNode(tree: CompositionTree): boolean {
  return walk(tree.root).some(({ node }) => {
    if (node.type === "scrub_sequence" || node.type === "scroll_chapters" || node.type === "parallax_layers") return true;
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

  // Premium effects budget: one live canvas per page, so at most one
  // shader_field and at most MAX_HEAVY_PER_PAGE heavy blocks in all.
  for (const hit of overBudget(sections.map((section) => ({ id: section.id, root: section.tree.root })))) {
    (out[hit.sectionId] ??= []).push({
      code: "too_many_heavy_effects",
      severity: "major",
      path: hit.path,
      fix: `This page already has its heavy effects (at most one shader_field and ${MAX_HEAVY_PER_PAGE} heavy blocks per page: shader_field, model_3d_viewer, tour_360, building_explorer). Replace this ${hit.type} with a still treatment: a picture, a scene over a supplied picture, or a plain gradient background. Keep every word and fact.`,
    });
  }
  // Copy over a shader must read on every colour the shader moves through.
  sections.forEach((section) => {
    for (const { node, path } of walk(section.tree.root)) {
      if (node.type !== "shader_field") continue;
      const palette = shaderPalette(node.style?.background, node.style?.gradientTo);
      for (const { node: inner, path: innerPath } of walk(node)) {
        if ((inner.type !== "heading" && inner.type !== "text") || !inner.style?.color) continue;
        const worst = shaderTextContrast(inner.style.color, palette);
        if (worst !== null && worst < 3) {
          (out[section.id] ??= []).push({
            code: "shader_text_contrast",
            severity: "major",
            path: `${path}${innerPath.slice(4)}`,
            fix: `Text colour ${inner.style.color} drops to ${worst.toFixed(1)}:1 on part of the shader's colours. Pick a text colour that reads at 4.5:1 on both style.background and style.gradientTo, or darken the shader's base and accent.`,
          });
          break;
        }
      }
    }
  });

  if (options.home && sections.length && !sections.some((section) => hasCentrepiece(section.tree))) {
    // Attached to the first content section after the opening (the opening
    // keeps its own bar); the AI chooses where the centrepiece really fits.
    const target = sections[1] ?? sections[0]!;
    (out[target.id] ??= []).push({
      code: "page_missing_interactive",
      severity: "major",
      path: "root",
      fix: "The home page has no interactive centrepiece, so the whole site has none. Where it serves real supplied material, add one: a scrub_sequence of the supplied pictures, scroll_chapters of scenes, a collection_row of offer cards, a spin_viewer (8+ owner-photographed angles), a dial_selector of the real method choices, a sticky_split_story of the real process, a before_after_slider of the owner's own before/after photos, or a service_estimator / quote_calculator widget. A faq_accordion, accordion, tab_group, tabs or toggle only hides text, so it does not count as the centrepiece.",
    });
  }

  // A home page that is mostly plain stacks and cards reads as a template, even with one interactive block.
  if (options.home && sections.length >= 4 && sections.some((section) => (section.mediaAvailable ?? 0) > 0)) {
    const plainSections = sections.slice(1).filter((section) => isPlainSection(section.tree));
    if (plainSections.length * 2 > sections.length - 1) {
      const target = plainSections[0]!;
      (out[target.id] ??= []).push({
        code: "page_mostly_plain",
        severity: "major",
        path: "root",
        fix: "Most sections on this home page are plain stacks and cards with no picture, scene or interaction. Rebuild this one with the supplied pictures or real material: a scene over a picture, a split story, a media-led bento, or a gallery or collection_row. Keep every word and fact the owner supplied.",
      });
    }
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

  for (const finding of auditPageCraft(sections, options)) (out[finding.sectionId] ??= []).push(finding.finding);
  return out;
}

/** Text-only reveals: useful, but not the page's interactive centrepiece (quality bar #14-17). */
const TEXT_REVEALS: ReadonlySet<string> = new Set(["faq_accordion", "accordion", "tab_group", "tabs", "toggle"]);
/** Working widgets that are a real interactive centrepiece. */
const CENTREPIECE_WIDGETS: ReadonlySet<string> = new Set(["quote_calculator", "service_estimator"]);

/** True when a tree holds an interactive centrepiece, not just an accordion or tabs of text. */
export function hasCentrepiece(tree: CompositionTree): boolean {
  return walk(tree.root).some(({ node }) =>
    (INTERACTIVE_PRIMITIVES.has(node.type) && !TEXT_REVEALS.has(node.type)) ||
    (node.type === "widget" && CENTREPIECE_WIDGETS.has((node.text ?? "").trim())),
  );
}

function normText(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value: string | undefined): string[] {
  return normText(value).split(" ").filter((w) => w.length > 2);
}

/** Share of the smaller word set found in the larger: 1 means one sentence restates the other. */
export function wordOverlap(a: string, b: string): number {
  const left = new Set(words(a));
  const right = new Set(words(b));
  if (!left.size || !right.size) return 0;
  const [small, big] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const w of small) if (big.has(w)) shared += 1;
  return shared / small.size;
}

function nodeMediaKeys(node: CompositionNode): string[] {
  const keys: string[] = [];
  if (node.mediaRef) keys.push(`ref:${node.mediaRef}`);
  if (node.src) keys.push(`src:${node.src}`);
  return keys;
}

/**
 * Page craft gates found on the Oak City Plumbing draft (2026-10-30 audit):
 * service cards with a title and no words, a button whose label is just a
 * section heading, a section that is only a button, one picture reused in
 * several sections, the same sentence paraphrased in every section, and a
 * page where every section sits on one background with no change of pace.
 */
export function auditPageCraft(
  sections: { id: string; role: string; tree: CompositionTree }[],
  options: { home?: boolean } = {},
): { sectionId: string; finding: DesignFinding }[] {
  const out: { sectionId: string; finding: DesignFinding }[] = [];
  const push = (sectionId: string, finding: DesignFinding) => out.push({ sectionId, finding });

  // Headings anywhere on the page, for the "button label is a heading" check.
  const headings = new Set<string>();
  for (const section of sections)
    for (const { node } of walk(section.tree.root)) if (node.type === "heading" && normText(node.text)) headings.add(normText(node.text));

  for (const section of sections) {
    const visits = walk(section.tree.root);

    // Repeated cards that carry a title but no supporting words.
    for (const visit of visits) {
      if (visit.node.type !== "grid" && visit.node.type !== "row") continue;
      const cards = (visit.node.children ?? []).filter((child) => child.type === "card" || child.type === "stack");
      if (cards.length < 2) continue;
      const bare = cards.filter((card) => {
        const inner = walk(card);
        const hasTitle = inner.some(({ node }) => node.type === "heading" && normText(node.text));
        const hasBody = inner.some(({ node }) => (TEXTUAL.has(node.type) && normText(node.text).length >= 12) || (node.items?.length ?? 0) > 0);
        return hasTitle && !hasBody;
      });
      if (bare.length >= 2 && bare.length * 2 >= cards.length)
        push(section.id, {
          code: "card_missing_body",
          severity: "major",
          path: visit.path,
          fix: "These cards show a title (and maybe a picture) with no words, so each row looks half empty. Give every card one short line from the supplied service description, or turn the set into a compact list of names.",
        });
    }

    // A button whose label is a section heading ("What we handle") says nothing about what happens on click.
    for (const visit of visits) {
      const labels: string[] = [];
      if (visit.node.type === "button" || visit.node.type === "link") labels.push(visit.node.text ?? "");
      if (visit.node.primaryCta?.label) labels.push(visit.node.primaryCta.label);
      if (visit.node.secondaryCta?.label) labels.push(visit.node.secondaryCta.label);
      for (const label of labels) {
        const key = normText(label);
        if (key.split(" ").length >= 2 && headings.has(key))
          push(section.id, {
            code: "action_label_is_heading",
            severity: "major",
            path: visit.path,
            fix: `The button label "${label.trim().slice(0, 60)}" is a section heading, not an action. Name what the visitor gets: "Book a visit", "Call now", "See all services".`,
          });
      }
    }

    // A section that is only a button (with or without a picture) and no heading or text.
    const hasWords = visits.some(({ node }) => (node.type === "heading" || TEXTUAL.has(node.type)) && normText(node.text));
    const hasRich = visits.some(({ node }) => node.type !== "media" && node.type !== "button" && !CONTAINERS.has(node.type) && node.type !== "link");
    const buttons = visits.filter(({ node }) => node.type === "button");
    if (!hasWords && !hasRich && buttons.length > 0)
      push(section.id, {
        code: "orphan_action",
        severity: "critical",
        path: "root",
        fix: "This section is only a button (and maybe a picture) with no heading or words, so it reads as a leftover. Move the action into the section it belongs to, or give it a short heading and one line saying why to click.",
      });
  }

  // One picture used in more than one section on the page.
  const mediaOwner = new Map<string, string>();
  for (const section of sections) {
    const seenHere = new Set<string>();
    for (const visit of walk(section.tree.root)) {
      for (const key of nodeMediaKeys(visit.node)) {
        if (seenHere.has(key)) continue;
        seenHere.add(key);
        const owner = mediaOwner.get(key);
        if (owner && owner !== section.id)
          push(section.id, {
            code: "duplicate_media",
            severity: "major",
            path: visit.path,
            fix: "This picture is already used in an earlier section of this page. Use a different supplied picture here, or drop the picture and let the words carry the section.",
          });
        else if (!owner) mediaOwner.set(key, section.id);
      }
    }
  }

  // The same message paraphrased section after section ("We focus on three core services in Raleigh…").
  const sentences: { sectionId: string; text: string }[] = [];
  for (const section of sections) {
    for (const visit of walk(section.tree.root)) {
      if (!TEXTUAL.has(visit.node.type) && visit.node.type !== "heading") continue;
      const text = (visit.node.text ?? "").trim();
      if (words(text).length < 6) continue;
      const echo = sentences.find((prior) => prior.sectionId !== section.id && normText(prior.text) !== normText(text) && wordOverlap(prior.text, text) >= 0.75);
      if (echo)
        push(section.id, {
          code: "near_duplicate_text",
          severity: "major",
          path: visit.path,
          fix: "This line restates a sentence from an earlier section in slightly different words. Say something new here (a step, a reason, a detail of the service) or remove it.",
        });
      sentences.push({ sectionId: section.id, text });
    }
  }

  // Every section on one background with no scene, image band or contrast surface: no change of pace.
  if (options.home && sections.length >= 4) {
    const backgrounds = new Set<string>();
    let paced = false;
    for (const section of sections.slice(1)) {
      const root = section.tree.root;
      backgrounds.add(String(root.style?.background ?? "").toLowerCase());
      if (walk(root).some(({ node, depth }) => depth <= 1 && (node.type === "scene" || node.type === "scroll_chapters" || node.type === "parallax_layers" || node.type === "marquee"))) paced = true;
    }
    if (!paced && backgrounds.size <= 1) {
      const target = sections[Math.min(2, sections.length - 1)]!;
      push(target.id, {
        code: "flat_section_rhythm",
        severity: "major",
        path: "root",
        fix: "Every section after the opening sits on the same background, so the page scrolls as one flat sheet. Give this section a contrasting surface (the accent at low strength, a lighter or darker band) or a full-bleed picture scene so the page changes pace.",
      });
    }
  }
  return out;
}

/** True when a tree contains a primitive the visitor operates. */
const RICH_PRIMITIVES: ReadonlySet<string> = new Set(["scene", "scrub_sequence", "parallax_layers", "gallery", "marquee", "widget", "media"]);

/** A section with no picture, scene, interactive block, working widget or layered depth: only text on stacks and cards. */
export function isPlainSection(tree: CompositionTree): boolean {
  if (hasInteractive(tree) || hasDepthNode(tree)) return false;
  return !walk(tree.root).some(({ node }) => RICH_PRIMITIVES.has(node.type));
}

export function hasInteractive(tree: CompositionTree): boolean {
  return walk(tree.root).some(({ node }) => INTERACTIVE_PRIMITIVES.has(node.type));
}

/** Gates that always go back to the AI, whatever their severity. */
const ALWAYS_REPAIR = new Set<DesignFinding["code"]>(["flat_page", "lead_not_scene", "lead_not_cinematic", "scene_text_contrast", "page_missing_interactive", "page_mostly_plain", "duplicate_text", "empty_column", "hollow_control", "card_missing_body", "action_label_is_heading", "orphan_action", "duplicate_media", "too_many_heavy_effects", "shader_text_contrast"]);

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
