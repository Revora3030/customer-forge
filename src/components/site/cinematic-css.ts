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
:root:has(.rv-cn-mobile-sticky-bar) ${S} .rv-scene-inner{padding-bottom:calc(max(var(--rv-sticky-height,84px),84px) + 12px + env(safe-area-inset-bottom,0px))}
html:has(.rv-cn-mobile-sticky-bar,[data-testid="site-sticky-actions"]) body{padding-bottom:calc(max(var(--rv-sticky-height,84px),84px) + env(safe-area-inset-bottom,0px))}
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
${S} .rv-lens{margin:0;display:grid;gap:12px;width:100%}
${S} .rv-lens-stage{position:relative;overflow:hidden;border-radius:4px;cursor:crosshair;line-height:0}
${S} .rv-lens-img{display:block;width:100%!important;height:auto!important;user-select:none;-webkit-user-drag:none}
${S} .rv-lens-loupe{position:absolute;border-radius:50%;border:3px solid #fff;box-shadow:0 8px 28px rgba(0,0,0,.45);background-repeat:no-repeat;pointer-events:none}
${S} .rv-lens-stage:focus-visible,${S} .rv-lens-touch:focus-visible{outline:3px solid currentColor;outline-offset:3px}
${S} .rv-lens-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
${S} .rv-lens-touch{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;font-weight:650;cursor:pointer}
@media (hover:hover) and (pointer:fine){${S} .rv-lens-touch{display:none}}
${S} .rv-split{display:grid;gap:24px;width:100%}
${S} .rv-split-pin{min-width:0}
${S} .rv-split-pin img,${S} .rv-split-pin video{display:block;width:100%!important;height:auto!important;max-width:100%}
${S} .rv-split-phases{margin:0;padding:0;list-style:none;display:grid;gap:24px;min-width:0}
@media (min-width:768px){
${S} .rv-split{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:start}
${S} .rv-split-pin{position:sticky;top:96px;align-self:start}
${S} .rv-split-phases{gap:0}
${S} .rv-split-phase{min-height:70vh;display:flex;flex-direction:column;justify-content:center}
}
${S} .rv-tier{display:grid;gap:20px;width:100%}
${S} .rv-tier-control{display:grid;gap:10px}
${S} .rv-tier-label{font-weight:650}
${S} .rv-tier-range{width:100%;min-height:44px;accent-color:currentColor;touch-action:pan-y;cursor:pointer;-webkit-appearance:none;appearance:none;background:transparent;color:inherit}
${S} .rv-tier-range::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:linear-gradient(currentColor,currentColor) 0 0/var(--rv-tier-fill,0%) 100% no-repeat,color-mix(in srgb,currentColor 22%,transparent)}
${S} .rv-tier-range::-moz-range-track{height:6px;border-radius:999px;background:color-mix(in srgb,currentColor 22%,transparent)}
${S} .rv-tier-range::-moz-range-progress{height:6px;border-radius:999px;background:currentColor}
${S} .rv-tier-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;margin-top:-10px;border-radius:999px;background:var(--background,#fff);border:3px solid currentColor;box-shadow:0 4px 14px rgba(0,0,0,.28);transition:transform .18s ease}
${S} .rv-tier-range::-moz-range-thumb{width:20px;height:20px;border-radius:999px;background:var(--background,#fff);border:3px solid currentColor;box-shadow:0 4px 14px rgba(0,0,0,.28)}
${S} .rv-tier-range:active::-webkit-slider-thumb{transform:scale(1.12)}
${S} .rv-tier-range:focus-visible{outline:3px solid currentColor;outline-offset:3px}
${S} .rv-tier-ticks{display:flex;justify-content:space-between;gap:8px;margin:0;padding:0;list-style:none;font-size:14px;opacity:.7}
${S} .rv-tier-ticks li[data-on]{opacity:1;font-weight:650}
${S} .rv-tier-cards{display:grid;gap:16px}
${S} .rv-tier-card[data-hidden]{display:none}
@media (min-width:768px){${S} .rv-tier-cards{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}}
${S} .rv-tier[data-live] .rv-tier-card[data-on]{animation:rv-tier-in .28s ease both}
@keyframes rv-tier-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){${S} .rv-tier[data-live] .rv-tier-card[data-on]{animation:none}}
${S} .rv-scrub[data-live]{height:300vh;height:300svh}
${S} .rv-scrub[data-live] > .rv-scene{position:sticky;top:0}
${S} .rv-seq{display:block;width:100%}
${S} .rv-seq-pin{position:relative}
${S} .rv-seq-stage{position:relative;display:grid;align-items:end;min-height:clamp(520px,100svh,920px);overflow:hidden;isolation:isolate}
${S} .rv-seq-frame{position:absolute;inset:0;z-index:1;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover;display:block}
${S} .rv-seq-scrim{position:absolute;inset:0;z-index:2;pointer-events:none}
${S} .rv-seq-copy{position:relative;z-index:3;display:flex;flex-direction:column;gap:12px;width:min(46rem,100%);padding:clamp(72px,12vw,120px) clamp(20px,5vw,64px) clamp(28px,6vw,72px)}
${S} .rv-seq-copy :is(h1,h2,h3){text-transform:inherit;text-wrap:balance}
${S} .rv-seq-prompt{margin:0;font-size:12px;font-weight:650;letter-spacing:.16em;text-transform:uppercase;opacity:.85}
${S} .rv-seq[data-live]{height:240vh;height:240svh}
${S} .rv-seq[data-live] > .rv-seq-pin{position:sticky;top:0;height:100vh;height:100svh}
${S} .rv-seq[data-live] > .rv-seq-pin > .rv-seq-stage{height:100%;min-height:100%}
@media (max-width:767px){${S} .rv-seq[data-live]{height:180vh;height:180svh}}
@media (prefers-reduced-motion:reduce){
${S} .rv-seq,${S} .rv-seq[data-live]{height:auto!important}
${S} .rv-seq-pin,${S} .rv-seq[data-live] > .rv-seq-pin{position:relative!important;height:auto!important}
}
${S} .rv-px{position:relative;overflow:hidden;overflow:clip;isolation:isolate;width:100%;aspect-ratio:4/5}
@media (min-width:768px){${S} .rv-px{aspect-ratio:16/9}}
${S} .rv-px-layer{position:absolute;left:0;top:-8%;width:100%!important;height:116%!important;max-width:none!important;object-fit:cover;display:block;will-change:transform}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
${S} .rv-px{view-timeline:--rv-px block}
${S} .rv-px-layer{animation:rv-px-drift linear both;animation-timeline:--rv-px;animation-range:cover}
${S} .rv-px-layer[data-depth="1"]{--px:2%}
${S} .rv-px-layer[data-depth="2"]{--px:4%}
${S} .rv-px-layer[data-depth="3"]{--px:6%}
@keyframes rv-px-drift{from{transform:translateY(var(--px,0%))}to{transform:translateY(calc(var(--px,0%) * -1))}}
}}
${S} .rv-scene :is(h1,h2),${S} .rv-seq-copy :is(h1,h2){font-size:clamp(3.2rem,7vw,6.5rem)!important;line-height:.95!important;letter-spacing:-.03em;text-wrap:balance}
${S} .rv-scene:not(:has(img)):not(:has(video)){background:radial-gradient(48% 36% at 50% 12%,rgba(255,255,255,.07),transparent 70%),#0a0d10}
.rv-site-root[data-studio]{background:#0a0d10;color:#f4f1ea}
.rv-site-root[data-studio]::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(42% 32% at 50% -4%,rgba(255,255,255,.07),transparent 68%),radial-gradient(28% 22% at 88% 18%,rgba(255,255,255,.04),transparent 70%)}
.rv-site-root[data-studio] .rv-ai-header,.rv-site-root[data-studio] .rv-site-header{background:rgba(10,13,16,.72);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.10)}
.rv-site-root[data-studio] .panel,.rv-site-root[data-studio] [data-live-block="service_menu"] li{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);color:#f4f1ea;backdrop-filter:blur(16px)}
.rv-site-root[data-studio] .panel input,.rv-site-root[data-studio] .panel select,.rv-site-root[data-studio] .panel textarea{background:rgba(0,0,0,.45);border-color:rgba(255,255,255,.15);color:#f4f1ea}
.rv-site-root[data-studio] [data-rv-button]{width:fit-content;max-width:100%;border-radius:999px;align-self:flex-start}
.rv-site-root[data-studio] .rv-offer [data-rv-button]{width:100%}
${S} .rv-chapter{min-height:85svh}
${S} .rv-seq-hud{position:absolute;z-index:4;top:clamp(76px,10vw,104px);left:clamp(16px,4vw,48px);display:flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:14px;background:rgba(8,10,14,.55);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;pointer-events:none}
${S} .rv-seq-hud-text{display:flex;flex-direction:column;line-height:1.05}
${S} .rv-seq-hud-text strong{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
${S} .rv-seq-hud-text small{font-size:11px;font-weight:700;margin-left:1px;opacity:.7}
${S} .rv-seq-hud-text span{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
${S} .rv-cn-brush-hud{position:absolute;z-index:3;top:12px;right:12px;display:flex;gap:2px;border-radius:12px;overflow:hidden;background:rgba(8,10,14,.62);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;pointer-events:none}
${S} .rv-cn-brush-hud span{display:flex;flex-direction:column;padding:6px 12px;line-height:1.1}
${S} .rv-cn-brush-hud span + span{border-left:1px solid rgba(255,255,255,.14)}
${S} .rv-cn-brush-hud small{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;opacity:.7}
${S} .rv-cn-brush-hud strong{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
${S} .rv-cn-brush-tools,${S} .rv-dial-chips{display:flex;flex-wrap:wrap;gap:8px;padding-top:10px}
${S} .rv-cn-brush-tools button,${S} .rv-dial-chips button{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font-size:13px;font-weight:700;letter-spacing:.02em;cursor:pointer}
${S} .rv-cn-brush-tools button[aria-pressed="true"],${S} .rv-dial-chips button[aria-checked="true"]{background:var(--primary,currentColor);color:var(--primary-foreground,#101114);border-color:transparent}
${S} .rv-dial{display:flex;flex-direction:column;gap:14px;width:100%}
${S} .rv-dial-gauge{display:grid;justify-items:center;gap:4px;padding:clamp(18px,3vw,28px);border-radius:20px;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.22);text-align:center}
${S} .rv-dial-gauge svg{width:min(240px,70%);height:auto;overflow:visible}
${S} .rv-dial-gauge svg[data-draggable]{cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}${S} .rv-dial-gauge svg[data-draggable]:active{cursor:grabbing}
${S} .rv-dial-fill,${S} .rv-dial-needle{transition:all 520ms cubic-bezier(.2,.8,.2,1)}
${S} .rv-dial-reading{display:flex;align-items:baseline;gap:6px;margin-top:-28px}
${S} .rv-dial-reading strong{font-size:clamp(24px,3.4vw,34px);font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
${S} .rv-dial-reading span{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;opacity:.7}
${S} .rv-dial-option{margin:6px 0 0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--primary,currentColor)}
${S} .rv-dial-note{margin:0;max-width:34ch;font-size:14px;line-height:1.5;opacity:.8}
${S} .rv-dial-list{width:100%;border-collapse:collapse;font-size:14px}
${S} .rv-dial-list caption{text-align:left;font-weight:700;padding-bottom:6px}
${S} .rv-dial-list th,${S} .rv-dial-list td{text-align:left;padding:8px 0;border-top:1px solid rgba(127,127,127,.22);vertical-align:top}
${S} .rv-dial-list th{padding-right:16px;white-space:nowrap}
@media (prefers-reduced-motion: reduce){${S} .rv-dial-fill,${S} .rv-dial-needle{transition:none}}
${S} .rv-model{margin:0;display:flex;flex-direction:column;gap:10px}
${S} .rv-model-stage{position:relative;aspect-ratio:4/3;width:100%;border-radius:18px;overflow:hidden;background:radial-gradient(120% 90% at 50% 20%,rgba(127,127,127,.18),rgba(127,127,127,.04));touch-action:none}
${S} .rv-model-poster,${S} .rv-model-canvas,${S} .rv-model-placeholder{position:absolute;inset:0;width:100%;height:100%}
${S} .rv-model-poster{object-fit:cover}
${S} .rv-model-placeholder{display:grid;place-items:center;font-size:clamp(28px,6vw,56px);font-weight:800;letter-spacing:.08em;opacity:.35}
${S} .rv-model-open{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);min-height:44px;padding:0 20px;border-radius:999px;border:0;background:var(--primary,#111);color:var(--primary-foreground,#fff);font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25)}
${S} .rv-model-status{position:absolute;inset:auto 0 16px;text-align:center;font-size:14px;margin:0}
${S} .rv-model-caption{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;font-size:14px;font-weight:600}
${S} .rv-model-hint{font-weight:400;opacity:.7}
/* Chapter snap: long scroll_chapters pages settle on each chapter instead of
   stopping between two (proximity, so a visitor can still stop anywhere and
   tall chapters never trap the scroll). Off for reduced motion. */
@media (prefers-reduced-motion:no-preference){
html:has(.rv-site-root .rv-chapters){scroll-snap-type:y proximity}
${S} .rv-chapters > .rv-chapter{scroll-snap-align:start;scroll-margin-top:var(--rv-header-height,0px)}
}
`;
