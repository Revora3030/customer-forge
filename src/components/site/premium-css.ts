/**
 * Styles for the premium effects: split-word headlines, depth scroll, the
 * shader field, the 360° tour and the building explorer. Pure CSS, shipped in
 * the shared composition stylesheet (no extra request). Every animation sits
 * behind prefers-reduced-motion: no-preference, and scroll-linked ones behind
 * @supports (animation-timeline: view()), so other browsers show the content
 * still. Nothing here captures the wheel or touch scroll of the page.
 */
const S = "[data-composition][data-composition]";

export const PREMIUM_CSS = `
${S} .rv-cn-motion[data-motion=split]{animation:none}
${S} .rv-cn-w{display:inline-block;white-space:pre}
@media (prefers-reduced-motion:no-preference){
${S} [data-motion=split] .rv-cn-w{animation:rv-cn-word var(--rv-sdur,.7s) cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--rv-sd,0ms) + var(--rv-w,0) * 55ms)}
${S} .rv-cn-motion[data-motion=depth]{animation:rv-cn-in .8s ease both}
}
@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){
${S} [data-motion=split] [data-split=view] .rv-cn-w{animation-duration:auto;animation-timing-function:linear;animation-delay:0s;animation-timeline:view();animation-range:entry calc(var(--rv-w,0) * 14px) entry calc(160px + var(--rv-w,0) * 14px)}
${S} .rv-cn-motion[data-motion=depth]{animation:rv-cn-depth linear both;animation-timeline:view();animation-range:cover 0% cover 100%;will-change:transform}
}}
@keyframes rv-cn-word{from{opacity:0;transform:translateY(.45em);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
@keyframes rv-cn-depth{0%{opacity:.55;transform:scale(1.07)}35%{opacity:1}100%{opacity:1;transform:scale(1)}}
${S} .rv-shader{position:relative;isolation:isolate;overflow:hidden}
${S} .rv-shader>canvas,${S} .rv-shader>div[aria-hidden]{border-radius:inherit}
${S} .rv-tour,${S} .rv-building{margin:0;display:flex;flex-direction:column;gap:10px;min-width:0}
${S} .rv-tour-stage,${S} .rv-building-stage{position:relative;width:100%;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:radial-gradient(120% 90% at 50% 20%,rgba(127,127,127,.2),rgba(127,127,127,.05))}
${S} .rv-tour-poster,${S} .rv-tour-canvas,${S} .rv-building-photo,${S} .rv-building-canvas,${S} .rv-building-still{position:absolute;inset:0;width:100%;height:100%}
${S} .rv-tour-poster,${S} .rv-building-photo{object-fit:cover}
${S} .rv-tour-canvas{touch-action:pan-y}
${S} .rv-tour-open,${S} .rv-building-open{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);min-height:44px;padding:0 20px;border-radius:999px;border:0;background:var(--primary,#111);color:var(--primary-foreground,#fff);font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25)}
${S} .rv-tour-status{position:absolute;inset:auto 0 16px;text-align:center;font-size:14px;margin:0;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6)}
${S} .rv-tour-caption{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;font-size:14px;font-weight:600}
${S} .rv-tour-scenes{display:flex;flex-wrap:wrap;gap:6px}
${S} .rv-tour-scene,${S} .rv-building-floor{min-height:44px;padding:0 14px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer;opacity:.75}
${S} .rv-tour-scene[aria-pressed=true],${S} .rv-building-floor[aria-pressed=true]{opacity:1;background:var(--primary,#111);border-color:var(--primary,#111);color:var(--primary-foreground,#fff)}
${S} .rv-tour-hint{font-weight:400;opacity:.7}
${S} .rv-building{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:20px;align-items:start}
@media (max-width:767px){${S} .rv-building{grid-template-columns:minmax(0,1fr)}}
${S} .rv-building-stage{aspect-ratio:4/3;touch-action:pan-y}
${S} .rv-building-still{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;padding:12%}
${S} .rv-building-still span{display:block;width:62%;flex:1;max-height:28px;border-radius:4px;background:rgba(127,127,127,.28);transition:transform .3s ease,background .3s ease}
${S} .rv-building-still span[data-on]{background:var(--primary,#3b82f6);transform:translateX(8%)}
${S} .rv-building-panel{display:flex;flex-direction:column;gap:12px;min-width:0}
${S} .rv-building-label{font-weight:700;font-size:16px}
${S} .rv-building-floors{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
${S} .rv-building-floor{width:100%;text-align:left;border-radius:12px}
${S} .rv-building-note{margin:0;font-size:15px;line-height:1.5;min-height:3em}
@media (prefers-reduced-motion:reduce){${S} .rv-building-still span{transition:none}}
`.replace(/\n/g, "");
