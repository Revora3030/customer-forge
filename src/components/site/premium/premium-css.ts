/**
 * Styles for the premium mobile template, scoped under .pm-root. Colours come
 * from the theme variables (premiumDarkThemeVars), which are AA-checked.
 * Type scale: a 1.25 ratio on phones growing to ~1.333 on desktop via clamp().
 * Motion: only opacity/transform; everything is disabled by
 * prefers-reduced-motion. Media sit in fixed aspect-ratio frames so nothing
 * shifts while pictures load.
 */
export const PREMIUM_CSS = `
.pm-root{--pm-font:var(--font-body,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif);--pm-display:var(--font-display,var(--pm-font));--pm-ease:cubic-bezier(.2,.8,.2,1);--pm-r:18px;--pm-gutter:clamp(20px,5vw,48px);--pm-max:1200px;
  --pm-s1:clamp(.8125rem,.78rem + .15vw,.875rem);--pm-s2:clamp(1rem,.96rem + .2vw,1.0625rem);--pm-s3:clamp(1.125rem,1.05rem + .35vw,1.3rem);--pm-s4:clamp(1.4rem,1.2rem + 1vw,2rem);--pm-s5:clamp(2rem,1.5rem + 2.6vw,3.4rem);--pm-s6:clamp(2.35rem,1.5rem + 4.6vw,5.4rem);
  background:var(--background);color:var(--foreground);font-family:var(--pm-font);font-size:var(--pm-s2);line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:clip;padding-bottom:calc(var(--rv-sticky-height,0px) + env(safe-area-inset-bottom,0px))}
@media (min-width:768px){.pm-root{padding-bottom:0}}
.pm-root *{box-sizing:border-box}
.pm-root img{display:block;max-width:100%}
.pm-root a{color:inherit}
.pm-root :focus-visible{outline:3px solid var(--primary-ink);outline-offset:3px;border-radius:6px}
.pm-skip{position:absolute;left:12px;top:-60px;z-index:100;padding:10px 14px;border-radius:10px;background:var(--primary);color:var(--primary-foreground)!important;font-weight:700;text-decoration:none}
.pm-skip:focus{top:12px}
.pm-container{width:100%;max-width:var(--pm-max);margin-inline:auto;padding-inline:var(--pm-gutter)}
.pm-accent{color:var(--primary-ink)}
.pm-muted{color:var(--muted-foreground)}
.pm-eyebrow{margin:0 0 14px;font-size:var(--pm-s1);font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--primary-ink)}
.pm-display{margin:0;font-family:var(--pm-display);font-size:var(--pm-s6);line-height:.95;font-weight:850;letter-spacing:-.025em;text-transform:uppercase;text-wrap:balance}
.pm-display-sm{font-size:var(--pm-s5);line-height:1}
.pm-line{display:block}
.pm-h2{margin:0;font-family:var(--pm-display);font-size:var(--pm-s5);line-height:1.02;font-weight:800;letter-spacing:-.02em;text-transform:uppercase;text-wrap:balance}
.pm-lede{margin:22px 0 0;max-width:36ch;font-size:var(--pm-s3);line-height:1.55;color:var(--muted-foreground)}
.pm-root .pm-link{display:inline-flex;align-items:center;gap:6px;color:var(--primary-ink);font-weight:700;text-decoration:none;min-height:44px}
.pm-link:hover{text-decoration:underline;text-underline-offset:4px}
.pm-link .pm-arrow{width:15px;height:15px}

/* buttons + micro-interactions */
.pm-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 20px;border-radius:12px;font-weight:750;font-size:var(--pm-s2);letter-spacing:.02em;text-decoration:none;white-space:nowrap;cursor:pointer;isolation:isolate;overflow:hidden;transition:transform .2s var(--pm-ease),box-shadow .25s var(--pm-ease),background-color .2s,border-color .2s;-webkit-tap-highlight-color:transparent}
.pm-btn-lg{min-height:56px;padding:0 26px;text-transform:uppercase;font-size:clamp(.9rem,.86rem + .2vw,1rem);letter-spacing:.06em}
.pm-btn-block{width:100%}
.pm-btn-primary{background:var(--primary);color:var(--primary-foreground)!important;box-shadow:0 10px 30px -10px color-mix(in srgb,var(--primary) 75%,transparent),inset 0 1px 0 rgb(255 255 255 / .25)}
.pm-btn-primary::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(110deg,transparent 30%,rgb(255 255 255 / .28) 50%,transparent 70%);transform:translateX(-120%);transition:transform .7s var(--pm-ease)}
.pm-btn-primary:hover::after{transform:translateX(120%)}
.pm-btn-primary:hover{transform:translateY(-2px);box-shadow:0 18px 40px -12px color-mix(in srgb,var(--primary) 85%,transparent),inset 0 1px 0 rgb(255 255 255 / .25)}
.pm-btn-ghost{background:color-mix(in srgb,var(--foreground) 7%,transparent);color:var(--foreground)!important;border:1px solid var(--pm-border-strong,var(--border));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.pm-btn-ghost:hover{transform:translateY(-2px);border-color:var(--primary-ink);background:color-mix(in srgb,var(--primary) 12%,transparent)}
.pm-btn:active{transform:translateY(0) scale(.98)}
.pm-arrow{transition:transform .25s var(--pm-ease)}
.pm-btn:hover .pm-arrow,.pm-link:hover .pm-arrow,.pm-card:hover .pm-arrow{transform:translateX(4px)}
.pm-cta-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
@media (max-width:639px){.pm-cta-row .pm-btn{width:100%}}

/* header + mobile nav */
.pm-header{position:sticky;top:0;z-index:60;background:color-mix(in srgb,var(--background) 78%,transparent);backdrop-filter:saturate(140%) blur(16px);-webkit-backdrop-filter:saturate(140%) blur(16px);border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.pm-header-inner{display:flex;align-items:center;gap:20px;height:68px;max-width:var(--pm-max);margin-inline:auto;padding-inline:var(--pm-gutter)}
.pm-brand{display:flex;align-items:center;gap:12px;text-decoration:none;min-width:0;margin-right:auto}
.pm-logo{width:40px;height:40px;border-radius:10px;object-fit:cover}
.pm-monogram{display:grid;place-items:center;width:40px;height:40px;border-radius:11px;font-weight:900;font-size:20px;color:var(--primary-foreground);background:linear-gradient(140deg,var(--primary),color-mix(in srgb,var(--primary) 55%,#000));box-shadow:inset 0 1px 0 rgb(255 255 255 / .3)}
.pm-brand-text{display:flex;flex-direction:column;min-width:0;line-height:1.1}
.pm-wordmark{font-family:var(--pm-display);font-weight:850;font-size:clamp(1.05rem,1rem + .3vw,1.25rem);letter-spacing:-.01em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pm-brand-tag{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--muted-foreground);margin-top:3px}
.pm-desktop-nav{display:none;gap:4px}
.pm-desktop-nav a{position:relative;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;color:var(--muted-foreground);transition:color .2s}
.pm-desktop-nav a::after{content:"";position:absolute;left:14px;right:14px;bottom:4px;height:2px;border-radius:2px;background:var(--primary);transform:scaleX(0);transition:transform .25s var(--pm-ease)}
.pm-desktop-nav a:hover{color:var(--foreground)}.pm-desktop-nav a:hover::after{transform:scaleX(1)}
.pm-header-cta{display:flex;align-items:center;gap:10px}
.pm-header-cta .pm-btn{min-height:44px;font-size:15px}
.pm-hide-sm{display:none!important}
.pm-menu-button{display:grid;place-items:center;width:48px;height:48px;border-radius:12px;border:1px solid var(--border);background:color-mix(in srgb,var(--foreground) 5%,transparent);color:var(--foreground);cursor:pointer}
.pm-burger{position:relative;width:20px;height:14px}
.pm-burger i{position:absolute;left:0;right:0;height:2px;border-radius:2px;background:currentColor;transition:transform .3s var(--pm-ease),opacity .2s}
.pm-burger i:nth-child(1){top:0}.pm-burger i:nth-child(2){top:6px}.pm-burger i:nth-child(3){top:12px}
.pm-burger.is-open i:nth-child(1){transform:translateY(6px) rotate(45deg)}.pm-burger.is-open i:nth-child(2){opacity:0}.pm-burger.is-open i:nth-child(3){transform:translateY(-6px) rotate(-45deg)}
.pm-sheet{position:fixed;inset:68px 0 0;z-index:80;display:flex;flex-direction:column;gap:24px;padding:24px var(--pm-gutter) calc(32px + env(safe-area-inset-bottom,0px));overflow-y:auto;background:linear-gradient(180deg,var(--pm-raised),var(--background));animation:pm-sheet-in .28s var(--pm-ease)}
.pm-sheet[hidden]{display:none}
.pm-sheet-nav{display:flex;flex-direction:column}
.pm-sheet-nav a{display:flex;align-items:center;min-height:56px;border-bottom:1px solid var(--border);text-decoration:none;font-family:var(--pm-display);font-weight:800;font-size:1.6rem;text-transform:uppercase;letter-spacing:-.01em}
.pm-sheet-nav a.pm-sheet-sub{min-height:48px;font-family:var(--pm-font);font-weight:600;font-size:1.05rem;text-transform:none;color:var(--muted-foreground)}
.pm-sheet-label{margin:24px 0 4px}
.pm-sheet-cta{display:grid;gap:12px;margin-top:auto}
.pm-sheet-address{margin:4px 0 0;font-size:14px;color:var(--muted-foreground);text-align:center}
@keyframes pm-sheet-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media (min-width:1024px){.pm-desktop-nav{display:flex}.pm-hide-sm{display:inline-flex!important}.pm-menu-button,.pm-sheet{display:none!important}}

/* hero: layered photo treatment */
.pm-hero{position:relative;isolation:isolate;overflow:hidden;min-height:min(calc(100svh - 68px),860px);display:flex;align-items:flex-end;padding:clamp(56px,10vh,140px) 0 clamp(32px,6vh,96px);background:radial-gradient(120% 80% at 85% 0%,color-mix(in srgb,var(--primary) 22%,transparent),transparent 60%),linear-gradient(180deg,var(--pm-band),var(--background))}
@media (max-width:767px){.pm-hero{min-height:calc(100svh - 68px - 64px - env(safe-area-inset-bottom,0px))}}
.pm-hero-service{min-height:min(calc(88svh - 68px),720px)}
.pm-hero-media{position:absolute;inset:0;z-index:-3}
.pm-hero-media img{width:100%;height:100%;object-fit:cover;transform:scale(1.04);animation:pm-kenburns 18s ease-out forwards}
.pm-hero-scrim{position:absolute;inset:0;z-index:-2;background:linear-gradient(180deg,rgb(4 6 10 / .55) 0%,rgb(4 6 10 / .35) 30%,rgb(4 6 10 / .82) 68%,var(--background) 100%)}
@media (min-width:1024px){.pm-hero-scrim{background:linear-gradient(90deg,rgb(4 6 10 / .94) 0%,rgb(4 6 10 / .78) 38%,rgb(4 6 10 / .25) 75%,rgb(4 6 10 / .4) 100%),linear-gradient(180deg,transparent 60%,var(--background) 100%)}.pm-hero{align-items:center}}
.pm-hero-glow{position:absolute;z-index:-1;width:60vmax;height:60vmax;left:-20vmax;bottom:-30vmax;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--primary) 26%,transparent),transparent);filter:blur(10px);pointer-events:none}
.pm-hero:not(.has-photo)::before{content:"";position:absolute;inset:0;z-index:-2;background-image:linear-gradient(color-mix(in srgb,var(--foreground) 5%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--foreground) 5%,transparent) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(80% 70% at 70% 30%,#000,transparent)}
.pm-hero-copy{max-width:760px}
.pm-hero .pm-lede{color:color-mix(in srgb,var(--foreground) 80%,transparent)}
.pm-address{margin:22px 0 0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:var(--pm-s1);color:var(--muted-foreground)}
.pm-crumb{color:inherit;text-decoration:none}
.pm-rise{animation:pm-rise .8s var(--pm-ease) both}
@keyframes pm-rise{from{transform:translateY(18px)}to{transform:none}}
@keyframes pm-kenburns{to{transform:scale(1)}}

/* trust strip */
.pm-trust{position:relative;z-index:2;margin-top:-1px;background:linear-gradient(180deg,var(--background),var(--pm-band));border-block:1px solid var(--border)}
.pm-trust-list{list-style:none;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0}
.pm-trust-item{display:flex;align-items:center;gap:12px;padding:20px 4px;color:var(--primary-ink)}
.pm-trust-item strong{display:block;color:var(--foreground);font-size:var(--pm-s3);line-height:1.2;font-weight:800}
.pm-trust-item small{display:block;color:var(--muted-foreground);font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:600}
@media (min-width:768px){.pm-trust-item+.pm-trust-item{border-left:1px solid var(--border);padding-left:24px}}

/* sections */
.pm-section{position:relative;padding-block:clamp(64px,10vw,128px)}
.pm-band{background:var(--pm-band);border-block:1px solid var(--border)}
.pm-section-head{max-width:720px;margin-bottom:clamp(28px,4vw,52px)}
.pm-section-head .pm-muted{margin:14px 0 0;font-size:var(--pm-s3)}
.pm-page-intro{padding-block:clamp(48px,8vw,96px) 0}

/* service cards: layered depth */
.pm-grid{--pm-gap:clamp(16px,2vw,28px);list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:var(--pm-gap)}
.pm-card-wrap{display:flex;flex:0 0 100%;min-width:0}
@media (min-width:640px){.pm-card-wrap{flex-basis:calc((100% - var(--pm-gap)) / 2)}}
@media (min-width:1024px){.pm-card-wrap{flex-basis:calc((100% - 2 * var(--pm-gap)) / 3)}}
.pm-card{position:relative;display:flex;flex-direction:column;width:100%;border-radius:var(--pm-r);overflow:hidden;background:linear-gradient(180deg,var(--pm-raised),var(--card));border:1px solid var(--border);box-shadow:0 1px 0 rgb(255 255 255 / .04) inset,0 20px 40px -24px rgb(0 0 0 / .8);transition:transform .35s var(--pm-ease),border-color .3s,box-shadow .35s}
.pm-card:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--primary) 55%,var(--border));box-shadow:0 1px 0 rgb(255 255 255 / .06) inset,0 30px 60px -28px color-mix(in srgb,var(--primary) 45%,#000)}
.pm-photo{position:relative;overflow:hidden;background:var(--pm-band)}
.pm-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .8s var(--pm-ease)}
.pm-card-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgb(4 6 10 / .55) 100%);pointer-events:none}
.pm-card:hover .pm-photo img{transform:scale(1.05)}
.pm-card-nophoto{position:relative;display:grid;place-items:center;background:radial-gradient(90% 90% at 80% 10%,color-mix(in srgb,var(--primary) 30%,transparent),transparent),var(--pm-band)}
.pm-card-nophoto span{font-family:var(--pm-display);font-weight:900;font-size:5rem;color:color-mix(in srgb,var(--foreground) 12%,transparent)}
.pm-card-body{display:flex;flex-direction:column;gap:10px;padding:22px 22px 24px;flex:1}
.pm-card-title{margin:0;font-family:var(--pm-display);font-size:var(--pm-s4);line-height:1.1;font-weight:800;text-transform:uppercase;letter-spacing:-.01em}
.pm-card-link{text-decoration:none}
.pm-card-link::after{content:"";position:absolute;inset:0;z-index:1}
.pm-card-copy{margin:0;color:var(--muted-foreground);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.pm-more{margin-top:auto;padding-top:6px;display:inline-flex;align-items:center;gap:8px;color:var(--primary-ink);font-weight:800;font-size:var(--pm-s1);letter-spacing:.12em;text-transform:uppercase}

/* service page */
.pm-panels{display:grid;gap:20px}
@media (min-width:900px){.pm-panels{grid-template-columns:1fr 1fr}}
.pm-panel{border-radius:var(--pm-r);padding:clamp(24px,3vw,40px);background:var(--card);border:1px solid var(--border);box-shadow:0 20px 40px -28px rgb(0 0 0 / .8)}
.pm-panel-accent{background:linear-gradient(160deg,color-mix(in srgb,var(--primary) 14%,var(--card)),var(--card) 60%);border-color:color-mix(in srgb,var(--primary) 40%,var(--border))}
.pm-panel-text{margin:0;font-size:var(--pm-s3);line-height:1.6}
.pm-steps{list-style:none;margin:0;padding:0;display:grid;gap:16px;counter-reset:step}
@media (min-width:900px){.pm-steps{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}
.pm-step{position:relative;padding:24px;border-radius:var(--pm-r);background:var(--card);border:1px solid var(--border)}
.pm-step p{margin:12px 0 0;font-size:var(--pm-s3);line-height:1.5}
.pm-step-num{font-family:var(--pm-display);font-weight:900;font-size:2.4rem;line-height:1;color:var(--primary-ink)}
.pm-checks{list-style:none;margin:0;padding:0;display:grid;gap:12px}
@media (min-width:768px){.pm-checks{grid-template-columns:1fr 1fr}}
.pm-checks li{display:flex;gap:12px;align-items:flex-start;padding:16px 18px;border-radius:14px;background:var(--card);border:1px solid var(--border);font-size:var(--pm-s3)}
.pm-checks svg{flex:none;margin-top:3px;color:var(--primary-ink)}

/* quote band */
.pm-quote{background:radial-gradient(70% 60% at 10% 0%,color-mix(in srgb,var(--primary) 16%,transparent),transparent 70%),var(--pm-band);border-top:1px solid var(--border)}
.pm-quote-grid{display:grid;gap:32px;align-items:start}
@media (min-width:1024px){.pm-quote-grid{grid-template-columns:5fr 6fr;gap:64px}}
.pm-quote-copy .pm-muted{margin:16px 0 0;font-size:var(--pm-s3)}
.pm-form-card{border-radius:calc(var(--pm-r) + 4px);padding:clamp(20px,3vw,36px);background:var(--card);border:1px solid var(--border);box-shadow:0 40px 80px -40px rgb(0 0 0 / .9),0 1px 0 rgb(255 255 255 / .05) inset}

/* footer */
.pm-footer{padding-block:56px 32px;background:var(--background);border-top:1px solid var(--border)}
.pm-footer-grid{display:grid;gap:32px}
@media (min-width:768px){.pm-footer-grid{grid-template-columns:2fr 1fr 1fr}}
.pm-footer-tag{margin:12px 0 0;max-width:36ch}
.pm-footer-list{list-style:none;margin:0;padding:0;display:grid;gap:4px;color:var(--muted-foreground)}
.pm-footer-list a{display:inline-flex;align-items:center;min-height:40px;text-decoration:none}
.pm-footer-list a:hover{color:var(--foreground)}
.pm-legal{margin-top:32px;padding-top:20px;border-top:1px solid var(--border);font-size:13px;color:var(--muted-foreground)}

/* quick-action bar look inside the template */
.pm-root .pm-bar{backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 -12px 32px rgb(0 0 0 / .45)}
.pm-root .pm-bar .rv-cn-sticky-tab{transition:background-color .2s,transform .15s var(--pm-ease)}
.pm-root .pm-bar .rv-cn-sticky-tab:active{transform:scale(.96)}
@media (min-width:768px){.pm-root .rv-cn-mobile-sticky-bar{display:none!important}}
@media (max-width:767px){html:has(input:focus,textarea:focus,select:focus) .pm-root .rv-cn-mobile-sticky-bar{display:none!important}}

@media (prefers-reduced-motion:reduce){.pm-root *,.pm-root *::before,.pm-root *::after{animation:none!important;transition:none!important}.pm-hero-media img{transform:none}}
`;
