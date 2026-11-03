/**
 * Test fixtures for the video-bar scorer. Every site here is assembled from a trade's own blueprint (palette, fonts,
 * section components, signature tool, scroll story) and the owner-fill markers, so no business, number or claim is
 * invented. `badSite` is the opposite: it breaks the bar on purpose, and its one invented claim exists only so the
 * scorer can be shown to catch it.
 */
import type { CompositionNode } from "@/lib/builder/composition-tree";
import { loadBlueprint, type LoadedBlueprint } from "@/lib/builder/quality/blueprint-loader";
import { STORY_PRIMITIVES, TOOL_PRIMITIVES, type VideoScoreInput } from "@/lib/builder/quality/video-score";
import type { ModelSection, SiteModel } from "@/lib/builder/quality/video-site-model";

const MARK_NAME = "[Add your business name]";
const rise = { kind: "rise", durationMs: 600, easing: "ease-out", trigger: "view" } as const;

const photo = (n: number, label: string): CompositionNode => ({
  type: "media", mediaRef: `owner-photo-${n}`, alt: `Owner photo ${n}: ${label}`, style: { aspect: "16/9", objectFit: "cover" },
});

function nodeFor(key: string): CompositionNode {
  if (key.startsWith("widget:")) return { type: "widget", text: key.slice(7), style: { padding: 24 } };
  switch (key) {
    case "scene": return { type: "scene", scrub: true, anchor: "bottom-left", children: [photo(2, "the work"), { type: "heading", level: 2, text: "Scroll to see the work", style: { size: 56, lineHeight: 1.05 } }] };
    case "scrub_sequence": return { type: "scrub_sequence", children: [photo(2, "first stage"), photo(3, "second stage"), photo(4, "third stage")] };
    case "scroll_chapters": return { type: "scroll_chapters", children: [{ type: "scene", children: [photo(2, "chapter one")] }, { type: "scene", children: [photo(3, "chapter two")] }] };
    case "parallax_layers": return { type: "parallax_layers", children: [photo(2, "back layer"), photo(3, "front layer")] };
    case "before_after_slider": return { type: "before_after_slider", beforeImage: { mediaRef: "owner-photo-5", alt: "Owner photo of the work before", label: "Before" }, afterImage: { mediaRef: "owner-photo-6", alt: "Owner photo of the work after", label: "After" } };
    case "building_explorer": return { type: "building_explorer", text: "Explore the building", floors: [{ label: "[Add your floor]", body: "[Add your detail]" }, { label: "[Add your floor]", body: "[Add your detail]" }] };
    case "sticky_split_story": return { type: "sticky_split_story", children: [photo(2, "the process"), { type: "stack", children: [{ type: "heading", level: 3, text: "Step one" }] }, { type: "stack", children: [{ type: "heading", level: 3, text: "Step two" }] }] };
    case "tour_360": return { type: "tour_360", children: [photo(2, "the space")] };
    case "compare": return { type: "compare", children: [photo(5, "before"), photo(6, "after")] };
    default: return { type: key as CompositionNode["type"], children: [{ type: "text", text: "[Add your details]" }] };
  }
}

const section = (id: string, kind: string, root: CompositionNode, heading?: string): ModelSection => ({
  id, pageSlug: "home", kind, heading: heading ?? null, composition: root,
});

const heading = (text: string, level: 1 | 2 = 2): CompositionNode => ({
  type: "heading", level, text, style: { size: level === 1 ? 72 : 40, lineHeight: level === 1 ? 0.95 : 1.05, letterSpacing: level === 1 ? -0.03 : 0 },
  motion: level === 1 ? { kind: "split", durationMs: 600, easing: "ease-out" } : rise,
});

/** A site that meets the bar, assembled from a trade blueprint. */
export function goodSite(bp: LoadedBlueprint): VideoScoreInput {
  const storyKey = (STORY_PRIMITIVES[bp.scrollComponent] ?? ["scroll_chapters"])[0]!;
  const toolKey = (TOOL_PRIMITIVES[bp.signatureTool.component] ?? ["tabs"])[0]!;
  const toolNode = nodeFor(toolKey);
  const sections: ModelSection[] = [];

  sections.push(section("hero", "composition", {
    type: "scene", anchor: "bottom-left", motion: { kind: "depth", easing: "ease-out" }, style: { minHeight: 720 },
    children: [
      photo(1, "the opening"),
      { type: "text", text: bp.label.toUpperCase(), style: { uppercase: true, size: 12, letterSpacing: 0.16 }, motion: rise },
      heading(MARK_NAME, 1),
      { type: "button", text: bp.hero.primaryCta, href: "#lead", motion: { ...rise, delayMs: 400 } },
    ],
  }, MARK_NAME));

  sections.push(section("story", "composition", { type: "stack", motion: rise, children: [heading(bp.signatureTool.name === bp.label ? "How it works" : "See it in motion"), nodeFor(storyKey)] }, "See it in motion"));
  sections.push(section("tool", "composition", { type: "stack", motion: rise, children: [heading(bp.signatureTool.name), toolNode] }, bp.signatureTool.name));
  sections.push(section("gallery", "composition", {
    type: "grid", style: { columns: 3, gap: 16 }, responsive: { mobile: { columns: 1 } }, motion: rise,
    children: [photo(7, "the work"), photo(8, "the work"), photo(9, "the work")],
  }, "The work"));
  sections.push(section("services", "composition", {
    type: "tabs", motion: rise, children: [
      { type: "stack", children: [heading("Services"), { type: "text", text: "[Add your services]", style: { size: 18 } }] },
      { type: "stack", children: [{ type: "text", text: "[Add your service area]", style: { size: 18 } }] },
    ],
  }, "Services"));
  sections.push(section("faq", "composition", { type: "faq_accordion", motion: rise, faqItems: [{ question: "[Add your question]", answer: "[Add your answer]" }] }, "Questions"));
  sections.push(section("lead", "composition", {
    type: "stack", motion: rise, children: [
      heading("Ask for a time"), { type: "widget", text: "enquiry_form" },
      { type: "mobile_sticky_bar", primaryCta: { label: bp.hero.primaryCta, href: "#lead" } },
    ],
  }, "Ask for a time"));

  const site: SiteModel = {
    sections,
    theme: { fonts: [bp.fonts.display, bp.fonts.body], palette: { ...bp.palette } },
  };
  return { site, blueprint: bp, intake: {} };
}

/** A site that misses the bar on purpose. */
export function badSite(bp: LoadedBlueprint): VideoScoreInput {
  const sections: ModelSection[] = [
    { id: "hero", pageSlug: "home", kind: "hero", heading: "Welcome to our website \u2014 elevate your experience \u2728", body: "Seamless service, 4.9 stars from 312 reviews. Call (212) 555-0188." },
    section("features", "composition", {
      type: "grid", style: { columns: 3, radius: 24, shadow: "strong" }, children: [
        { type: "card", text: "\u2713 Quality", style: { shadow: "medium", radius: 24, background: "radial-gradient(circle, #7c3aed, #000)" } },
        { type: "card", text: "\u2713 Speed", style: { shadow: "medium", radius: 24 } },
        { type: "card", text: "\u2713 Trust", style: { shadow: "medium", radius: 24 } },
      ],
    }, "Why us"),
    section("quote", "composition", { type: "quote", text: "Best service in town!", items: ["A happy customer"] }, "Reviews"),
    section("pics", "composition", { type: "gallery", children: [{ type: "media", src: "https://images.unsplash.com/photo-1", alt: "image" }, { type: "media", src: "https://via.placeholder.com/600", alt: "photo" }] }, "Gallery"),
  ];
  return {
    site: { sections, theme: { fonts: ["Inter", "Poppins", "Roboto"], palette: { base: "#FFFFFF", text: "#CCCCCC", accent: "#7C3AED", onAccent: "#EEEEEE" } } },
    blueprint: bp,
    intake: {},
  };
}

export const FIXTURE_TRADES = ["golf course", "roofing", "dentist", "pressure washing", "auto detailing"] as const;
export const blueprintFor = (trade: string): LoadedBlueprint => loadBlueprint(trade);
