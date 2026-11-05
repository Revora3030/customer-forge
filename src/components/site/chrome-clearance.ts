/**
 * Room for the two pieces of site chrome that stay on screen while a visitor
 * scrolls: the sticky header at the top and the fixed Call / Book bar at the
 * bottom of a phone. Both publish their measured height as a custom property
 * (`--rv-header-height`, `--rv-sticky-height`); nothing else should hard-code
 * either number.
 *
 * Without this, a link such as `#quote`, a keyboard Tab stop or a "scroll into
 * view" lands the target under the header or under the bar, and the first
 * words of a hero, a FAQ line or a Call button are hidden (Elite Mobile
 * Detailing 390px QA).
 */
export const CHROME_CLEARANCE_CSS = `
html:has(.pm-header,.rv-site-header){scroll-padding-top:calc(var(--rv-header-height,72px) + 8px)}
@media (max-width:767px){html:has(.rv-cn-mobile-sticky-bar){scroll-padding-bottom:calc(var(--rv-sticky-height,72px) + env(safe-area-inset-bottom,0px) + 16px)}}
`;
