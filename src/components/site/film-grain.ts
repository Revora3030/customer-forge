/**
 * Static film grain: one tiny SVG feTurbulence tile, painted once as a CSS
 * background. No animation, no canvas, no script — it renders under SSR and
 * costs a single 160px tile decode. Its job is to break up the flat,
 * plasticky gradients and scrims that make generated sites look generated.
 */
export const GRAIN_OPACITY = 0.16;
export const GRAIN_TILE_PX = 160;

const GRAIN_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='${GRAIN_TILE_PX}' height='${GRAIN_TILE_PX}'>` +
  `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>` +
  `<feColorMatrix type='saturate' values='0'/></filter>` +
  `<rect width='100%' height='100%' filter='url(#g)'/></svg>`;

/** `url("data:image/svg+xml,…")`, safe inside a CSS declaration or an inline style. */
export const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

/** Declarations for an absolutely positioned grain overlay. */
export const GRAIN_LAYER_CSS = `content:"";position:absolute;inset:0;pointer-events:none;background-image:${GRAIN_URL};background-size:${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px;opacity:${GRAIN_OPACITY};mix-blend-mode:overlay`;
