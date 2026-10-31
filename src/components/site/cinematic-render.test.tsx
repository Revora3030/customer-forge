import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import { SpinViewerView } from "./CinematicBlocks";
import { CINEMATIC_CSS } from "./cinematic-css";
import { offerFactsFor } from "./live-blocks-utils";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

const ref = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const pic = (n: number, alt = `Angle ${n}`): CompositionNode => ({ type: "media", mediaRef: ref(n), alt });
const media = (source: "generated" | "customer" = "customer") => (r: string) => ({ url: `https://img.example.test/${r}.jpg`, visual: { source } as never });
const render = (root: CompositionNode, extra: Partial<Parameters<typeof CompositionRenderer>[0]> = {}) =>
  renderToStaticMarkup(<CompositionRenderer tree={{ version: 1, root } as CompositionTree} scope="s-test" resolveMedia={media()} {...extra} />);

/** The element markup without the shared stylesheet (which names every class). */
const markup = (html: string) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");

const scene = (extra: Partial<CompositionNode> = {}, children: CompositionNode[] = []): CompositionNode => ({
  type: "scene",
  anchor: "bottom-left",
  children: [pic(1, "A red coupe on a harbour road at sunset"), { type: "heading", level: 1, text: "Sunset," }, { type: "heading", level: 2, text: "in red.", style: { italic: true } }, ...children],
  ...extra,
});
const offer = (extra: Partial<CompositionNode> = {}): CompositionNode => ({
  type: "offer_card",
  text: "Evening detail",
  items: ["Two hours", "Indoor bay"],
  anchor: "top-right",
  children: [{ type: "button", text: "Reserve", href: "/book" }],
  ...extra,
});

describe("scene renders a full-viewport, readable photographic chapter", () => {
  it("draws the backdrop, computed scrim and anchored copy slot", () => {
    const html = render(scene({ scrim: { color: "#120c08", opacity: 20 } }));
    expect(html).toContain('class="rv-scene"');
    expect(html).toContain('data-anchor="bottom-left"');
    expect(html).toContain('alt="A red coupe on a harbour road at sunset"');
    expect(html).toMatch(/class="rv-scene-scrim" aria-hidden="true" data-scrim-opacity="0\.\d\d"/);
    expect(html).toContain("<h1");
    expect(html).toContain("Sunset,");
    // The scrim is AI-coloured but its opacity is computed, never below the AI's floor.
    const opacity = Number(/data-scrim-opacity="([\d.]+)"/.exec(html)?.[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.2);
    // Phones always get the even scrim.
    expect(html).toContain("@media (max-width:767px){[data-cn=");
    expect(CINEMATIC_CSS).toContain("min-height:clamp(560px,100svh,1200px)");
  });

  it("lazy-loads a later scene's photo and eagerly loads the page's first hero", () => {
    expect(render(scene())).toContain('loading="lazy"');
    const eager = render(scene(), { eagerFirstMedia: true });
    expect(eager).toContain('loading="eager"');
    expect(eager).toContain('fetchPriority="high"');
  });

  it("the first picture on the page may be a lens magnifier: it loads eagerly, a later one stays lazy (audit P2-07)", () => {
    const lens = (n: number): CompositionNode => ({ type: "lens_magnifier", text: "Inspect", children: [pic(n, `Detail ${n}`)] });
    const html = markup(render({ type: "stack", children: [lens(1), lens(2)] } as CompositionNode, { eagerFirstMedia: true }));
    const tags = html.match(/<img[^>]*rv-lens-img[^>]*>/g) ?? [];
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain('loading="eager"');
    expect(tags[0]).toContain('fetchPriority="high"');
    expect(tags[1]).toContain('loading="lazy"');
    const notFirst = markup(render({ type: "stack", children: [lens(1)] } as CompositionNode));
    expect(notFirst).toContain('loading="lazy"');
  });

  it("plays a backdrop video muted, without autoplay attributes or controls in the server HTML", () => {
    const html = render(scene(), { resolveMedia: (r) => ({ url: `https://img.example.test/${r}.mp4`, visual: { source: "customer" } as never }) });
    expect(html).toContain("<video");
    expect(markup(html)).not.toMatch(/autoplay/i);
    expect(markup(html)).not.toContain("controls");
    expect(html).toContain("playsInline");
  });

  it("floats an offer card in its own anchor group, flowing below the copy on phones", () => {
    const html = render(scene({}, [offer()]));
    expect(html).toContain('class="rv-scene-offers" data-anchor="top-right"');
    expect(CINEMATIC_CSS).toMatch(/@media \(max-width:767px\)\{[^}]*\.rv-scene-offers\{position:static/);
    // Room for a mobile sticky bar under the scene copy and at the end of the page.
    expect(CINEMATIC_CSS).toContain(":root:has(.rv-cn-mobile-sticky-bar)");
    expect(CINEMATIC_CSS).toContain('html:has(.rv-cn-mobile-sticky-bar,[data-testid="site-sticky-actions"]) body{padding-bottom');
  });
});

describe("scroll_chapters", () => {
  it("server-renders every scene stacked, with plain anchor links as the chapter rail (works without JS)", () => {
    const html = render({ type: "scroll_chapters", children: [scene(), scene({ anchor: "center" })] });
    expect(html.match(/class="rv-chapter"/g)?.length).toBe(2);
    expect(html).toMatch(/<nav class="rv-chapter-rail" aria-label="Chapters">/);
    expect(html).toMatch(/href="#s-test-\d+-c0" aria-label="Chapter 1: Sunset,"/);
    expect(html).toMatch(/id="s-test-\d+-c1"/);
  });

  it("only animates for visitors who did not ask for reduced motion, and only where scroll timelines exist", () => {
    const start = CINEMATIC_CSS.indexOf("@media (prefers-reduced-motion: no-preference){");
    expect(start).toBeGreaterThan(-1);
    const before = CINEMATIC_CSS.slice(0, start);
    expect(before).not.toContain("animation:");
    expect(before).not.toContain("animation-timeline");
    const block = CINEMATIC_CSS.slice(start, CINEMATIC_CSS.indexOf("@keyframes rv-scene-settle"));
    expect(block).toContain("@supports (animation-timeline: view())");
    expect(block).toContain("animation-timeline:view()");
  });
});

describe("offer_card", () => {
  const services = [
    { id: "1", name: "Evening Detail", price: 180, duration_minutes: 120 },
    { id: "2", name: "Quick Wash", price: null },
  ];

  it("shows the named real service's own price and duration", () => {
    const html = render({ type: "stack", children: [offer({ service: "evening detail" })] }, { resolveOffer: (name) => offerFactsFor(services, name) });
    expect(html).toContain('class="rv-offer-price"');
    expect(html).toMatch(/\$180/);
    expect(html).toContain("2 hr");
    expect(html).toContain('data-rv-overlay="offer"');
    expect(html).toContain('href="/book"');
    expect(html).toContain("<h3");
  });

  it("shows no price when the service has none, is unknown, or no services resolver exists", () => {
    const withResolver = (service: string) => render({ type: "stack", children: [offer({ service })] }, { resolveOffer: (name) => offerFactsFor(services, name) });
    expect(markup(withResolver("Quick Wash"))).not.toContain("rv-offer-price");
    expect(markup(withResolver("Mystery Package"))).not.toContain("rv-offer-price");
    expect(markup(render({ type: "stack", children: [offer({ service: "Evening Detail" })] }))).not.toContain("rv-offer-price");
  });

  it("gets a computed readable surface when it floats over a scene", () => {
    const html = render(scene({}, [offer()]));
    expect(html).toMatch(/class="rv-offer" style="[^"]*background-color:rgb\(0 0 0 \/ 0\.\d+\);color:#ffffff" data-rv-card="" data-rv-overlay="offer"/);
  });
});

describe("spin_viewer", () => {
  const frames = Array.from({ length: 8 }, (_, i) => pic(i + 1));
  const props = { "data-cn": "s-spin", "data-motion": undefined, className: undefined, style: {} };
  const views = frames.map((_, i) => ({ src: `https://img.example.test/${i}.jpg`, alt: `Angle ${i + 1}` }));

  it("server-renders a single still with no dead controls (no-JS fallback)", () => {
    const html = render({ type: "spin_viewer", text: "Spin the coupe", children: frames });
    expect(html).toContain("rv-spin-still");
    expect(markup(html)).not.toContain('role="slider"');
    expect(markup(html)).not.toContain("<button");
    expect(html.match(/<img/g)?.length).toBe(1);
  });

  it("becomes an ARIA slider with labelled 44px buttons once interactive", () => {
    const html = renderToStaticMarkup(<SpinViewerView props={props} frames={views} label="Spin the coupe" frame={2} interactive />);
    for (const attr of ['role="slider"', 'tabindex="0"', 'aria-valuemin="1"', 'aria-valuemax="8"', 'aria-valuenow="3"', 'aria-valuetext="Angle 3 of 8"', 'aria-labelledby="s-spin-label"', 'aria-label="Rotate left"', 'aria-label="Rotate right"'])
      expect(html).toContain(attr);
    expect(CINEMATIC_CSS).toMatch(/\.rv-spin-controls button,[^{]*\{min-width:44px;min-height:44px/);
  });

  it("falls back to a still with fewer than eight angles", () => {
    const html = renderToStaticMarkup(<SpinViewerView props={props} frames={views.slice(0, 5)} label="" frame={0} interactive />);
    expect(html).toContain("rv-spin-still");
    expect(html).not.toContain('role="slider"');
  });

  it("never spins AI-made or stock angle pictures", () => {
    const html = render({ type: "spin_viewer", children: frames }, { resolveMedia: media("generated") });
    expect(html).toContain('data-frames="1"');
  });
});

describe("collection_row", () => {
  it("is a focusable, labelled, snap-scrolling region whose items are real links", () => {
    const html = render({ type: "collection_row", text: "The collection", children: [offer({ children: [pic(4, "Interior"), { type: "button", text: "Book", href: "/book" }] }), offer({ text: "Ceramic coat" })] });
    expect(html).toContain('role="region" aria-label="The collection" tabindex="0"');
    expect(html.match(/class="rv-collection-item"/g)?.length).toBe(2);
    expect(html).toContain('class="rv-offer-media"');
    // Prev/next buttons only appear once they can work.
    expect(markup(html)).not.toContain("Previous in");
    expect(CINEMATIC_CSS).toContain("scroll-snap-type:x mandatory");
  });
});

describe("scrub_sequence", () => {
  it("renders the last frame and the display copy before JavaScript runs", () => {
    const html = render({
      type: "scrub_sequence",
      text: "Scroll",
      scrim: { color: "#0c0e12", opacity: 50 },
      children: [
        pic(1, "Vehicle in shade"),
        pic(2, "Panel in the light"),
        { type: "heading", level: 1, text: "Bring it dirty", style: { uppercase: true, letterSpacing: 0.12, size: 64 } },
        { type: "button", text: "Book", href: "/book" },
      ],
    });
    expect(html).toContain('class="rv-seq"');
    expect(markup(html)).not.toContain("data-live");
    expect(html).toContain('alt="Panel in the light"');
    expect(html).toContain("Bring it dirty");
    expect(html).toContain(">Scroll<");
    expect(CINEMATIC_CSS).toContain("prefers-reduced-motion:reduce");
    expect(CINEMATIC_CSS).toContain(".rv-seq[data-live]");
  });
});

describe("accordion labels are not a hollow box", () => {
  it("stretches to the row and does not paint each label as a bordered card", () => {
    const html = markup(render({
      type: "accordion",
      style: { align: "center" },
      children: [
        { type: "stack", text: "Full" },
        { type: "stack", text: "Auto detailing" },
      ],
    }));
    expect(html).toContain("rv-cn-acc");
    expect(html).toContain("width:100%");
    expect(html).toContain(">Full<");
    expect(html).toContain(">Auto detailing<");
    expect(html).not.toContain("border:1px solid");
  });

  it("drops an aspect ratio that would turn two short labels into a tall empty frame", () => {
    const html = markup(render({
      type: "grid",
      style: { columns: 1, aspect: "3:4", borderWidth: 1, align: "center", items: "center" },
      children: [
        { type: "heading", level: 2, text: "Full" },
        { type: "text", text: "Auto detailing" },
      ],
    }));
    expect(html).not.toContain("aspect-ratio");
    expect(html).toContain(">Full<");
    expect(html).toContain(">Auto detailing<");
  });
});

describe("phrasing hosts stay valid HTML", () => {
  it("renders a text node that contains a card as a div, so the browser cannot split the paragraph", () => {
    const html = markup(render({
      type: "text",
      text: "Intro",
      children: [{ type: "card", children: [{ type: "text", text: "Inside" }] }],
    }));
    expect(html).not.toMatch(/<p[^>]*>Intro/);
    expect(html).toContain(">Intro");
    expect(html).toContain(">Inside<");
  });
});

describe("mobile sticky bar is marked as an overlay for the browser QA gate", () => {
  it("carries data-rv-overlay", () => {
    expect(render({ type: "mobile_sticky_bar", primaryCta: { label: "Call", href: "tel:+15551234567" } })).toContain('data-rv-overlay="sticky"');
  });
});

describe("home page hero video loop", () => {
  const hero = { src: "https://media.example.test/hero.mp4", mobileSrc: "https://media.example.test/hero-m.mp4", poster: "https://media.example.test/p.jpg", loopStart: 0, loopEnd: 8, source: "stock" as const };

  it("layers a muted, inline, looping, lazy video over the hero photo without autoplay in the server HTML", () => {
    const html = render(scene(), { heroVideo: hero, eagerFirstMedia: true });
    const body = markup(html);
    expect(body).toContain('data-hero-video=""');
    expect(body).toContain('alt="A red coupe on a harbour road at sunset"');
    expect(body).toMatch(/<video[^>]*class="rv-scene-media rv-hero-video"/);
    expect(body).toMatch(/<video[^>]*muted/);
    expect(body).toMatch(/<video[^>]*playsInline/);
    expect(body).toMatch(/<video[^>]*loop/);
    expect(body).toMatch(/<video[^>]*preload="none"/);
    expect(body).toMatch(/<video[^>]*poster="https:\/\/img\.example\.test\//);
    expect(body).toMatch(/<video[^>]*aria-hidden="true"/);
    // No source until hydration: the photo paints first; reduced motion never loads the clip.
    expect(body).not.toContain("hero.mp4");
    // The play/pause control only exists after hydration, when it can work.
    expect(body).not.toContain("data-hero-control");
    expect(body).not.toMatch(/autoplay/i);
    expect(body.indexOf("rv-hero-video")).toBeLessThan(body.indexOf("rv-scene-scrim"));
  });

  it("fades in only when playing, shows the poster with a control for reduced motion and drifts with scroll where supported", () => {
    expect(CINEMATIC_CSS).toMatch(/\.rv-scene-media\.rv-hero-video\{opacity:0/);
    expect(CINEMATIC_CSS).toMatch(/\.rv-hero-video\[data-playing\]\{opacity:1\}/);
    // Reduced motion keeps the poster frame on screen (never a blank hero) and adds a visible play/pause control.
    expect(CINEMATIC_CSS).toMatch(/prefers-reduced-motion: reduce\)\{[^}]*\.rv-hero-video\{opacity:1/);
    expect(CINEMATIC_CSS).not.toMatch(/prefers-reduced-motion: reduce\)\{[^}]*\.rv-hero-video\{display:none/);
    expect(CINEMATIC_CSS).toMatch(/\.rv-hero-control\{[^}]*min-width:44px;min-height:44px/);
    expect(CINEMATIC_CSS).toContain("animation-timeline:view()");
  });

  it("goes on the first scene only, never in the editor, and never over an owner's backdrop video", () => {
    const two: CompositionNode = { type: "stack", children: [scene(), scene()] };
    expect(markup(render(two, { heroVideo: hero })).match(/data-hero-video/g)?.length).toBe(1);
    expect(markup(render(scene(), { heroVideo: hero, editable: true }))).not.toContain("data-hero-video");
    const ownVideo = render(scene(), { heroVideo: hero, resolveMedia: (r) => ({ url: `https://img.example.test/${r}.mp4`, visual: { source: "customer" } as never }) });
    expect(markup(ownVideo)).not.toContain("data-hero-video");
    expect(markup(render(scene()))).not.toContain("data-hero-video");
  });
});

