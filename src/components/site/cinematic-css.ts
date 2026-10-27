/**
 * Shared CSS for the cinematic composition primitives. Mechanics only: every
 * colour, font, anchor and word comes from the AI-authored tree.
 *
 * Selectors carry a doubled [data-composition] so they outrank the phone
 * safety sheet (which resets img height) whatever order the sheets load in.
 *
 * Guarantees:
 *  - scenes fill the viewport (100svh, clamped 560–1200px) and never clip copy,
 *  - phones: floating offer cards flow below the copy so nothing covers a
 *    control, and scenes leave room for a mobile sticky bar,
 *  - reduced motion: no scroll-driven or smooth motion at all,
 *  - every control is at least 44×44px with a visible focus ring.
 */
const S = "[data-composition][data-composition]";

export const CINEMATIC_CSS = `
${S} .rv-scene{position:relative;isolation:isolate;overflow:hidden;display:grid;width:100%;max-width:100%;min-height:clamp(560px,100vh,1200px);min-height:clamp(560px,100svh,1200px)}
${S} .rv-scene-media{position:absolute!important;inset:0;z-index:-2;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover;display:block}
${S} .rv-scene-scrim{position:absolute;inset:0;z-index:-1;pointer-events:none}
${S} .rv-scene-inner{position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:24px;width:100%;padding:clamp(88px,11vw,128px) clamp(20px,5vw,72px) clamp(32px,6vw,80px)}
${S} .rv-scene-slot{display:flex;flex-direction:column;gap:16px;max-width:min(640px,100%);min-width:0}
${S} .rv-scene-offers{display:grid;gap:16px;min-width:0}
@media (min-width:768px){
${S} .rv-scene[data-anchor$="-left"] .rv-scene-slot,${S} .rv-scene[data-anchor$="-right"] .rv-scene-slot{max-width:min(560px,52%)}
${S} .rv-scene-offers{position:absolute;z-index:2;width:min(340px,34%);margin:clamp(20px,4vw,56px)}
${S} .rv-scene-offers[data-anchor^="top"]{top:clamp(72px,8vw,104px)}${S} .rv-scene-offers[data-anchor^="bottom"]{bottom:0}${S} .rv-scene-offers[data-anchor^="center"]{top:50%;transform:translateY(-50%)}
${S} .rv-scene-offers[data-anchor$="-left"]{left:0}${S} .rv-scene-offers[data-anchor$="-right"]{right:0}${S} .rv-scene-offers[data-anchor$="-center"],${S} .rv-scene-offers[data-anchor="center"]{left:50%;transform:translateX(-50%)}
${S} .rv-scene-offers[data-anchor="center"]{transform:translate(-50%,-50%)}
}
@media (max-width:767px){
${S} .rv-scene-offers{position:static;width:100%;max-width:420px}
:root:has(.rv-cn-mobile-sticky-bar) ${S} .rv-scene-inner{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}
html:has(.rv-cn-mobile-sticky-bar,[data-testid="site-sticky-actions"]) body{padding-bottom:calc(84px + env(safe-area-inset-bottom,0px))}
}
${S} .rv-offer{display:grid;gap:12px;padding:16px;border-radius:16px;min-width:0;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
${S} .rv-offer-media{width:100%;aspect-ratio:4 / 3;height:auto!important;object-fit:cover;border-radius:10px;display:block}
${S} .rv-offer-title{margin:0;font-size:1.05rem;line-height:1.25;font-weight:650}
${S} .rv-offer-price{margin:0;font-weight:700;font-variant-numeric:tabular-nums}
${S} .rv-offer-specs{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0;padding:0;list-style:none;font-size:.9rem;opacity:.9}
${S} .rv-offer [data-rv-button]{min-height:44px;min-width:44px;width:100%}
.rv-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important;border:0!important}
${S} .rv-chapters{position:relative;display:block;width:100%}
${S} .rv-chapter{position:relative}
${S} .rv-chapter-rail{display:none}
@media (min-width:1024px){
${S} .rv-chapter-rail{position:sticky;top:calc(50vh - 90px);z-index:6;height:0;display:flex;flex-direction:column;align-items:flex-end;overflow:visible;padding-right:16px;pointer-events:none}
${S} .rv-chapter-rail a{pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:999px;color:inherit}
${S} .rv-chapter-rail a span{display:block;width:10px;height:10px;border-radius:999px;border:2px solid currentColor;opacity:.7}
${S} .rv-chapter-rail a[aria-current="true"] span{background:currentColor;opacity:1}
}
@media (prefers-reduced-motion: no-preference){
@supports (animation-timeline: view()){
${S} .rv-chapter .rv-scene-media{animation:rv-scene-settle linear both;animation-timeline:view();animation-range:entry 0% exit 100%}
${S} .rv-chapter .rv-scene-slot,${S} .rv-chapter .rv-scene-offers{animation:rv-scene-rise linear both;animation-timeline:view();animation-range:entry 5% cover 40%}
}
${S} .rv-collection-viewport{scroll-behavior:smooth}
}
@keyframes rv-scene-settle{from{transform:scale(1.1)}to{transform:scale(1)}}
@keyframes rv-scene-rise{from{opacity:.001;translate:0 48px}to{opacity:1;translate:0 0}}
${S} .rv-spin{display:grid;gap:16px;justify-items:center;margin:0;width:100%}
${S} .rv-spin-stage{position:relative;width:100%;max-width:960px;aspect-ratio:16 / 10;display:grid;place-items:center;border-radius:24px;overflow:hidden;cursor:grab;user-select:none;touch-action:pan-y}
${S} .rv-spin-stage:active{cursor:grabbing}
${S} .rv-spin-still .rv-spin-stage{cursor:default}
${S} .rv-spin-frame{position:relative;z-index:1;width:86%!important;height:78%!important;object-fit:contain;pointer-events:none}
${S} .rv-spin-podium{position:absolute;left:12%;right:12%;bottom:7%;height:16%;border-radius:50%;background:radial-gradient(closest-side,var(--rv-podium,currentColor),transparent);opacity:.55;filter:blur(6px)}
${S} .rv-spin-stage:focus-visible,${S} .rv-spin-controls button:focus-visible,${S} .rv-collection-viewport:focus-visible,${S} .rv-collection-controls button:focus-visible{outline:3px solid currentColor;outline-offset:3px}
${S} .rv-spin-controls,${S} .rv-collection-controls{display:flex;gap:12px;justify-content:center}
${S} .rv-spin-controls button,${S} .rv-collection-controls button{min-width:44px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;font-weight:650;cursor:pointer}
${S} .rv-collection{display:grid;gap:16px;width:100%}
${S} .rv-collection-viewport{overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scrollbar-width:thin;border-radius:4px}
${S} .rv-collection-track{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(220px,78%);gap:16px;margin:0;padding:4px 2px 12px;list-style:none}
@media (min-width:768px){${S} .rv-collection-track{grid-auto-columns:minmax(240px,31%)}}
${S} .rv-collection-item{scroll-snap-align:start;min-width:0}
${S} .rv-collection-item > .rv-offer{height:100%}
`;
