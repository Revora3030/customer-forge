/**
 * Pure maths and CSS for `cinematic_hero_stage`, kept out of the component so
 * it is testable without a browser. Every value written into CSS comes from a
 * validated stage (ids, tokens and enums checked by cinematic-hero-stage.ts);
 * nothing here evaluates author strings.
 */
import type { CinematicHeroStage, HeroStageLayerSpec } from "@/lib/builder/cinematic-hero-stage";
import { promotedLayerIds } from "@/lib/builder/cinematic-hero-stage";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type Scalar = { value: number; unit: "" | "%" };
const scalar = (v: number | string): Scalar =>
  typeof v === "number" ? { value: v, unit: "" } : { value: Number.parseFloat(v), unit: "%" };

/** 0–1 position inside a step's [start, end] window of the stage's scroll progress. */
export function windowProgress(progress: number, range: readonly [number, number]): number {
  const [start, end] = range;
  if (!(end > start)) return progress >= end ? 1 : 0;
  return clamp((progress - start) / (end - start), 0, 1);
}

/**
 * Opacity of each frame of an overlaid media stack. Frames stack in order
 * (later on top); each segment holds the current frame for `holdFraction`
 * of its length before the next one fades in over it.
 */
export function stackOpacities(count: number, position: number, holdFraction: number): number[] {
  if (count <= 0) return [];
  const at = clamp(position, 0, count - 1);
  const index = Math.min(count - 1, Math.floor(at));
  const local = at - index;
  const hold = clamp(holdFraction, 0, 0.9);
  const mix = index >= count - 1 ? 0 : clamp((local - hold) / (1 - hold), 0, 1);
  return Array.from({ length: count }, (_, i) => (i <= index ? 1 : i === index + 1 ? mix : 0));
}

export type LayerFrameState = {
  transform?: string;
  opacity?: number;
  clipPath?: string;
  /** rule_path: stroke-dashoffset on a pathLength=1 path. */
  dashOffset?: number;
  /** media_stack: per-frame opacity. */
  frames?: number[];
  /** media_single video scrub: 0–1 playhead. */
  playhead?: number;
};

/** What every layer looks like at a scroll progress (0–1). */
export function stageFrame(stage: CinematicHeroStage, progress: number, opts: { drawPaths?: boolean } = {}): Record<string, LayerFrameState> {
  const out: Record<string, LayerFrameState> = {};
  const p = clamp(progress, 0, 1);
  for (const layer of stage.layers) out[layer.id] = initial(layer, stage, p, opts);
  const transforms: Record<string, string[]> = {};
  for (const step of stage.motion.scrubs) {
    const state = out[step.target];
    const layer = stage.layers.find((l) => l.id === step.target);
    if (!state || !layer) continue;
    const t = windowProgress(p, step.range);
    const from = scalar(step.from);
    const to = scalar(step.to);
    const v = from.value + (to.value - from.value) * t;
    const unit = to.unit || from.unit;
    const list = (transforms[step.target] ??= []);
    switch (step.property) {
      case "translateX": list.push(`translateX(${round(v)}${unit || "px"})`); break;
      case "translateY": list.push(`translateY(${round(v)}${unit || "px"})`); break;
      case "scale": list.push(`scale(${round(v, 4)})`); break;
      case "rotate": list.push(`rotate(${round(v)}deg)`); break;
      case "opacity": state.opacity = clamp(v, 0, 1); break;
      case "clipInsetBottom": state.clipPath = `inset(0 0 ${round(clamp(v, 0, 100))}% 0)`; break;
      case "pathDraw": if (!opts.drawPaths) state.dashOffset = round(1 - clamp(v, 0, 1), 4); break;
      case "frameIndex":
        if (layer.type === "media_stack") state.frames = stackOpacities(layer.frames.length, v, layer.holdFraction);
        break;
    }
  }
  for (const [id, list] of Object.entries(transforms)) if (list.length && out[id]) out[id]!.transform = list.join(" ");
  return out;
}

function initial(layer: HeroStageLayerSpec, stage: CinematicHeroStage, p: number, opts: { drawPaths?: boolean }): LayerFrameState {
  const driven = (property: string) => stage.motion.scrubs.some((s) => s.target === layer.id && s.property === property);
  if (layer.type === "media_stack" && !driven("frameIndex"))
    return { frames: stackOpacities(layer.frames.length, windowProgress(p, layer.scrub.range) * (layer.frames.length - 1), layer.holdFraction) };
  if (layer.type === "rule_path" && !driven("pathDraw"))
    return { dashOffset: opts.drawPaths ? 0 : round(1 - windowProgress(p, layer.drawRange), 4) };
  if (layer.type === "rule_path" && opts.drawPaths) return { dashOffset: 0 };
  if (layer.type === "media_single" && layer.scrubVideo) return { playhead: p };
  return {};
}

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Fallback colours for the tokens the round-7 examples use, when a site does not define them. */
export function tokenColor(token: string): string {
  const name = /^var\((--[a-z][a-z0-9-]*)\)$/.exec(token)?.[1];
  if (!name) return "transparent";
  const fallback = name.startsWith("--amber") ? "#d4a24c" : name.startsWith("--warm") ? "#e6c3a1" : name.startsWith("--scrim") ? "#08090c" : "#ffffff";
  return `var(${name}, ${fallback})`;
}

/** Fluid display sizes (rem + vw, max ≤ 2.5× min so browser zoom still scales text). */
export const HEADLINE_SIZES: Record<CinematicHeroStage["responsive"]["narrow"]["headlineToken"], string> = {
  "--step-6": "var(--step-6, clamp(2.25rem, 1.75rem + 2.5vw, 3.5rem))",
  "--step-7": "var(--step-7, clamp(2.5rem, 1.9rem + 3vw, 4.25rem))",
  "--display-1": "var(--display-1, clamp(3rem, 2rem + 4vw, 5.5rem))",
  "--display-2": "var(--display-2, clamp(3.5rem, 2rem + 5vw, 7rem))",
};

const PLACEMENT: Record<string, { row: string; col: string; text: string }> = {
  "bottom-left": { row: "end", col: "start", text: "left" },
  "bottom-center": { row: "end", col: "center", text: "center" },
  "stacked-center": { row: "center", col: "center", text: "center" },
  "split-left": { row: "center", col: "start", text: "left" },
  "stacked-left": { row: "end", col: "start", text: "left" },
  "top-left": { row: "start", col: "start", text: "left" },
};

const PIN_SCREENS = { none: 0, short: 150, medium: 200, long: 260 } as const;

/** Unitless svh number of a stage height, for the pinned track. */
const svh = (height: string) => Number.parseInt(height, 10);

/** The stage's own scoped CSS: breakpoint registers, hidden layers, reveals. */
export function stageCss(stage: CinematicHeroStage): string {
  const root = `[data-hs="${stage.id}"]`;
  const rules: string[] = [];
  const register = (key: "narrow" | "mid" | "wide") => {
    const r = stage.responsive[key];
    const place = PLACEMENT[r.lockup] ?? PLACEMENT[stage.lockup.placement]!;
    const shown = r.showLayers ? new Set(r.showLayers) : null;
    const hidden = stage.layers
      .map((l) => l.id)
      .filter((id) => (shown && !shown.has(id)) || (key === "narrow" && stage.responsive.disableOnMobile.includes(id)));
    const h = svh(r.stageHeight);
    const pin = stage.stage.pin.enabled ? PIN_SCREENS[stage.stage.pin.distance] : 0;
    const body = [
      stage.stage.height === "auto"
        ? `${root} .rv-hs-stage{aspect-ratio:${r.mediaAspect};height:auto;min-height:0}`
        : `${root} .rv-hs-stage{height:${h}vh;height:${h}svh${stage.stage.height === "screen-tall" && !pin ? `;min-height:${Math.round(h * 1.15)}vh` : ""}}`,
      pin ? `${root}{height:${Math.max(pin, h)}vh;height:${Math.max(pin, h)}svh}` : "",
      `${root} .rv-hs-lockup{align-self:${place.row};justify-self:${place.col};text-align:${place.text};--hs-cta-align:${place.col === "center" ? "center" : "flex-start"}${r.lockup === "split-left" && key !== "narrow" ? ";max-width:min(50%,var(--hs-measure))" : ""}}`,
      `${root} .rv-hs-headline{font-size:${HEADLINE_SIZES[r.headlineToken]}}`,
      hidden.length ? `${hidden.map((id) => `${root} [data-hs-layer="${id}"]`).join(",")}{display:none}` : "",
    ].filter(Boolean).join("");
    return body;
  };
  rules.push(`@media (max-width:47.99rem){${register("narrow")}}`);
  rules.push(`@media (min-width:48rem) and (max-width:79.99rem){${register("mid")}}`);
  rules.push(`@media (min-width:80rem){${register("wide")}}`);
  for (const layer of stage.layers) {
    const sel = `${root} [data-hs-layer="${layer.id}"]`;
    if (layer.type === "scrim") {
      const pct = Math.round(layer.strength * 100);
      const c = tokenColor(layer.token);
      const shape = (color: string, soft: string) =>
        layer.direction === "radial"
          ? `radial-gradient(ellipse 90% 80% at 50% 55%, ${color} 0%, ${soft} 60%, transparent 100%)`
          : `linear-gradient(${layer.direction.replace("-", " ")}, ${color} 0%, ${color} 38%, ${soft} 70%, transparent 100%)`;
      rules.push(`${sel}{background:${shape(`rgb(8 9 12 / ${pct}%)`, `rgb(8 9 12 / ${Math.round(pct * 0.45)}%)`)}}`);
      rules.push(`@supports (color: color-mix(in srgb, red 50%, transparent)){${sel}{background:${shape(`color-mix(in srgb, ${c} ${pct}%, transparent)`, `color-mix(in srgb, ${c} ${Math.round(pct * 0.45)}%, transparent)`)}}}`);
    }
    if (layer.type === "ambient") {
      const washes = layer.washes
        .map((w) => `radial-gradient(${w.radius} at ${w.at}, color-mix(in srgb, ${tokenColor(w.color)} ${Math.round(w.opacity * 100)}%, transparent), transparent 70%)`)
        .join(",");
      rules.push(`@supports (color: color-mix(in srgb, red 50%, transparent)){${sel} .rv-hs-drift{background:${washes}}}`);
      if (layer.drift)
        rules.push(`@media (prefers-reduced-motion: no-preference){${sel} .rv-hs-drift{--hs-dx:${layer.drift.x}px;--hs-dy:${layer.drift.y}px;animation:rv-hs-drift ${layer.drift.periodMs}ms ease-in-out infinite alternate}}`);
    }
    if (layer.type === "light_sweep") {
      rules.push(`${sel} .rv-hs-band{width:${layer.widthPct}%;margin-left:-${layer.widthPct / 2}%;transform:rotate(${layer.angleDeg - 90}deg);opacity:${layer.opacity}}`);
      rules.push(`@supports (color: color-mix(in srgb, red 50%, transparent)){${sel} .rv-hs-band{background:linear-gradient(90deg, transparent, color-mix(in srgb, ${tokenColor(layer.color)} 100%, transparent) 50%, transparent)}}`);
    }
  }
  const EASE = { "expo.out": "cubic-bezier(.16,1,.3,1)", "power3.out": "cubic-bezier(.215,.61,.355,1)", "quart.out": "cubic-bezier(.25,1,.5,1)" } as const;
  const KEYFRAME = { "clip-wipe-up": "rv-hs-wipe-up", "mask-line": "rv-hs-wipe-up", "clip-wipe-right": "rv-hs-wipe-right", "iris-open": "rv-hs-iris", rise: "rv-hs-rise", "curtain-roll": "rv-hs-curtain" } as const;
  const reveals = stage.motion.reveals.map((r) => {
    const target = r.target.startsWith("lockup.") ? `[data-hs-reveal="${r.target.slice(7)}"]` : `[data-hs-layer="${r.target}"]`;
    return `${root} ${target}{animation:${KEYFRAME[r.effect]} ${r.durationMs}ms ${EASE[r.easing]} ${r.delayMs}ms both}`;
  });
  if (reveals.length) rules.push(`@media (prefers-reduced-motion: no-preference){${reveals.join("")}}`);
  return rules.join("");
}

/** A static fractal-noise tile (never animated: animated grain repaints the viewport every frame). */
const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

/** Shared, stage-independent rules (one copy per page). */
export const HERO_STAGE_CSS = [
  ".rv-hs{position:relative;width:100%;--hs-measure:22ch}",
  ".rv-hs-stage{position:relative;display:grid;overflow:hidden;isolation:isolate;min-height:22rem;padding:clamp(1.25rem,4vw,4rem)}",
  ".rv-hs[data-pin] .rv-hs-stage{position:sticky;top:0}",
  ".rv-hs-layer{position:absolute;inset:0;pointer-events:none}",
  ".rv-hs-layer img,.rv-hs-layer video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}",
  ".rv-hs-drift{position:absolute;inset:-6%}",
  ".rv-hs-band{position:absolute;top:-50%;left:0;height:200%}",
  ".rv-hs-layer[data-blend=overlay]{mix-blend-mode:overlay}",
  ".rv-hs-layer[data-blend=soft-light]{mix-blend-mode:soft-light}",
  ".rv-hs-layer svg{width:100%;height:100%;overflow:visible}",
  ".rv-hs-lockup{position:relative;z-index:10;max-width:var(--hs-measure);display:flex;flex-direction:column;gap:.75rem}",
  ".rv-hs[data-ink=light] .rv-hs-lockup{color:#fff}",
  ".rv-hs-eyebrow{font-size:.8125rem;letter-spacing:.14em;text-transform:uppercase;opacity:.86;margin:0}",
  ".rv-hs-headline{margin:0;line-height:1.02;letter-spacing:-.02em;text-wrap:balance}",
  ".rv-hs-headline .rv-hs-line{display:block}",
  ".rv-hs-em{font-style:normal;color:var(--hs-accent,inherit)}",
  ".rv-hs-sub{margin:0;font-size:clamp(1rem,.95rem + .25vw,1.25rem);line-height:1.5;max-width:44ch}",
  ".rv-hs-cta{align-self:var(--hs-cta-align,flex-start);display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:.75rem 1.25rem;border-radius:999px;background:#fff;color:#0b0c0f;font-weight:600;text-decoration:none;margin-top:.5rem}",
  `.rv-hs-grain{background-image:url("${GRAIN_SVG}");background-size:180px 180px}`,
  "@keyframes rv-hs-wipe-up{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}",
  "@keyframes rv-hs-wipe-right{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}",
  "@keyframes rv-hs-iris{from{clip-path:circle(0% at 50% 50%)}to{clip-path:circle(150% at 50% 50%)}}",
  "@keyframes rv-hs-rise{from{opacity:0;transform:translateY(.6em)}to{opacity:1;transform:none}}",
  "@keyframes rv-hs-curtain{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}",
  "@keyframes rv-hs-drift{from{transform:translate(0,0)}to{transform:translate(var(--hs-dx,0),var(--hs-dy,0))}}",
].join("");

/** Layers that may carry will-change while live, capped by the stage's guardrail. */
export function promotedForStage(stage: CinematicHeroStage): Set<string> {
  return new Set(promotedLayerIds(stage).slice(0, stage.guardrails.maxPromotedLayers));
}
