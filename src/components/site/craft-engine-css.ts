/**
 * Revora craft engine v1 — the SSR-safe static layer (deepseek round 7, Part 7),
 * adapted to how customer sites actually render.
 *
 * Checked against the code before adopting the spec verbatim:
 *  - Layer names are namespaced (`rv-*`). Tailwind v4 already declares
 *    `@layer base` in styles.css; a bare `base` would merge into it.
 *  - Tokens are scoped to `.rv-site-root`, never `:root`/`html`/`body`, and no
 *    `color-scheme: dark` is forced: tenant sites can be light, and their own
 *    theme (and every existing site) must render exactly as before.
 *  - Layered rules lose to unlayered ones, so the existing cinematic sheet
 *    (which must outrank the phone safety sheet) stays unlayered; this sheet
 *    only adds new, opt-in classes and tokens.
 *  - OKLCH tokens have hex fallbacks for engines without oklch().
 *  - `animation-timeline` appears only inside `@supports`, after the shorthand,
 *    with a non-zero base duration (Gecko), and all motion sits under
 *    `prefers-reduced-motion: no-preference`.
 *  - `will-change` never appears.
 */
import { GRAIN_OPACITY, GRAIN_TILE_PX, GRAIN_URL } from "./film-grain";
import { BODY_SCRIM_MIN_OPACITY } from "@/lib/builder/cinematic-primitives";

export const CRAFT_LAYER_ORDER = ["rv-tokens", "rv-base", "rv-craft", "rv-motion", "rv-tenant"] as const;

/** Obsidian surfaces: tinted neutrals (blue-violet undertone), never pure black. [oklch, hex fallback] */
export const OBSIDIAN_TOKENS: Record<string, readonly [string, string]> = {
  "--rv-void": ["oklch(0.145 0.012 268)", "#121318"],
  "--rv-surface-1": ["oklch(0.190 0.014 268)", "#1a1c22"],
  "--rv-surface-2": ["oklch(0.235 0.016 268)", "#23252c"],
  "--rv-surface-3": ["oklch(0.285 0.018 268)", "#2d3038"],
  "--rv-text": ["oklch(0.945 0.006 268)", "#eceef3"],
  "--rv-text-2": ["oklch(0.780 0.010 268)", "#b8bcc6"],
  "--rv-text-3": ["oklch(0.620 0.012 268)", "#8a8f9b"],
  "--rv-heading": ["oklch(0.975 0.004 268)", "#f6f7fa"],
  "--rv-glass-bg": ["oklch(0.280 0.018 268 / 0.55)", "rgb(44 47 56 / .55)"],
};

/** Scrim alphas. Body text over media always uses the strong scrim (≥ the body floor). */
export const SCRIM_ALPHA = { strong: 0.78, soft: 0.62, faint: 0.42 } as const;

const tokenBlock = (pick: 0 | 1) =>
  Object.entries(OBSIDIAN_TOKENS).map(([name, pair]) => `${name}:${pair[pick]}`).join(";");
const scrim = (alpha: number, pick: 0 | 1) =>
  pick === 0 ? `oklch(0.145 0.012 268 / ${alpha})` : `rgb(18 19 24 / ${alpha})`;
const scrimTokens = (pick: 0 | 1) =>
  (Object.keys(SCRIM_ALPHA) as Array<keyof typeof SCRIM_ALPHA>).map((k) => `--rv-scrim-${k}:${scrim(SCRIM_ALPHA[k], pick)}`).join(";");

const R = ".rv-site-root";

export const CRAFT_ENGINE_CSS = `@layer ${CRAFT_LAYER_ORDER.join(",")};
@layer rv-tokens{
${R}{${tokenBlock(1)};${scrimTokens(1)};--rv-glass-edge-hi:rgb(255 255 255 / .16);--rv-glass-edge-lo:rgb(255 255 255 / .04);--rv-glass-blur:14px;--rv-ease-out-expo:cubic-bezier(.16,1,.3,1);--rv-ease-out-quart:cubic-bezier(.25,1,.5,1);--rv-dur-reveal:700ms;--rv-dur-micro:140ms}
@supports (color:oklch(0 0 0)){${R}{${tokenBlock(0)};${scrimTokens(0)}}}
}
@layer rv-base{
${R} .rv-below-fold{content-visibility:auto;contain-intrinsic-size:auto 800px}
}
@layer rv-craft{
${R} .rv-grain{position:fixed;inset:0;z-index:60;pointer-events:none;opacity:${GRAIN_OPACITY};mix-blend-mode:overlay;background-image:${GRAIN_URL};background-size:${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px;background-repeat:repeat;contain:strict}
@media (max-width:47.99rem){${R} .rv-grain{opacity:.12}}
@media print,(forced-colors:active){${R} .rv-grain{display:none}}
${R} .rv-glass{position:relative;border:1px solid transparent;border-radius:14px;background:linear-gradient(var(--rv-glass-bg),var(--rv-glass-bg)) padding-box,linear-gradient(155deg,var(--rv-glass-edge-hi),var(--rv-glass-edge-lo) 62%) border-box;-webkit-backdrop-filter:blur(var(--rv-glass-blur)) saturate(1.1);backdrop-filter:blur(var(--rv-glass-blur)) saturate(1.1)}
${R} .rv-scrim{position:absolute;inset:0;pointer-events:none}
${R} .rv-scrim--even{background:var(--rv-scrim-strong)}
${R} .rv-scrim--to-top{background:linear-gradient(to top,var(--rv-scrim-strong) 0%,var(--rv-scrim-strong) 55%,var(--rv-scrim-soft) 78%,transparent 100%)}
${R} .rv-scrim--to-bottom{background:linear-gradient(to bottom,var(--rv-scrim-strong) 0%,var(--rv-scrim-strong) 55%,var(--rv-scrim-soft) 78%,transparent 100%)}
${R} .rv-scrim--to-right{background:linear-gradient(to right,var(--rv-scrim-strong) 0%,var(--rv-scrim-strong) 55%,var(--rv-scrim-soft) 80%,transparent 100%)}
@keyframes rv-wipe-right{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes rv-iris-open{from{clip-path:inset(46% 46% 46% 46% round 24px)}to{clip-path:inset(0 0 0 0 round 0)}}
@keyframes rv-mask-line{from{clip-path:inset(-20% 100% -20% -6%)}to{clip-path:inset(-20% -6% -20% -6%)}}
}
@layer rv-motion{
@media (prefers-reduced-motion:no-preference){
${R} .rv-reveal{animation-duration:1ms;animation-fill-mode:both;animation-timing-function:var(--rv-ease-out-expo)}
${R} .rv-reveal--wipe-up{animation-name:rv-wipe-up}
${R} .rv-reveal--wipe-right{animation-name:rv-wipe-right}
${R} .rv-reveal--iris{animation-name:rv-iris-open}
${R} .rv-reveal--mask-line{animation-name:rv-mask-line}
@supports (animation-timeline:view()){
${R} .rv-reveal{animation-timeline:view();animation-range:entry 12% cover 34%;animation-duration:auto}
${R} .rv-hero .rv-reveal{animation-timeline:auto;animation-duration:var(--rv-dur-reveal);animation-delay:var(--rv-reveal-delay,0ms)}
}
}
}
@layer rv-tenant{}
`;

/** Lowest scrim alpha a body-text class in this sheet paints. */
export const CRAFT_BODY_SCRIM_FLOOR = Math.min(SCRIM_ALPHA.strong, BODY_SCRIM_MIN_OPACITY / 100);
