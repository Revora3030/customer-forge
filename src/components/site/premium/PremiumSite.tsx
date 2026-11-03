/**
 * Premium mobile template (PR2). Dark, layered, photo-led page shell for a
 * local-service business, rendered from the facts model only
 * (premium-mobile-template.ts). Every block that depends on a fact (phone,
 * address, services, trust items, service-page detail) is omitted when that
 * fact is missing — nothing is invented here.
 *
 * Phone first (390px): sticky header with a full-screen menu, a two-tone hero
 * over the owner's photo, trust strip, service cards, CTA band, the 3-slot
 * quick-action bar (Call | Get quote | Directions) and the call/quote
 * launcher. Desktop (>= 1024px): the same content in a wide, centred layout
 * with a split hero and a 3-column service grid.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MobileStickyBar } from "@/components/site/CompositionRenderer";
import { ChatLauncher } from "@/components/site/ChatLauncher";
import { Reveal } from "@/components/site/premium/Reveal";
import {
  clip,
  directionsHref,
  premiumQuickActions,
  splitTwoTone,
  telHref,
  trustItems,
  type PremiumFacts,
  type PremiumImage,
  type PremiumPage,
  type PremiumService,
  type TrustItem,
} from "@/lib/builder/premium-mobile-template";
import { PREMIUM_CSS } from "@/components/site/premium/premium-css";

export function PremiumSite({ facts, page, form, children, homeHref = "/" }: {
  facts: PremiumFacts;
  page: PremiumPage;
  /** The site's working quote/enquiry form (anchored at #quote). */
  form?: ReactNode;
  /** The page's own sections, for pages the template does not lay out itself. */
  children?: ReactNode;
  homeHref?: string;
}) {
  const actions = premiumQuickActions(facts);
  const primary = actions.primary ?? actions.secondary ?? actions.tertiary;
  return (
    <div className="pm-root">
      <style data-rv-premium="">{PREMIUM_CSS}</style>
      <a href="#main" className="pm-skip">Skip to content</a>
      <PremiumHeader facts={facts} homeHref={homeHref} />
      <main id="main">
        {page.kind === "home" ? (
          <>
            <Hero facts={facts} />
            <TrustStrip items={trustItems(facts)} />
            <Services facts={facts} />
          </>
        ) : page.kind === "service" ? (
          <ServiceDetail facts={facts} service={page.service} />
        ) : children ? null : (
          <PageIntro title={page.title} />
        )}
        {children}
        <QuoteBand facts={facts} form={form} />
      </main>
      <Footer facts={facts} homeHref={homeHref} />
      {primary ? (
        <MobileStickyBar
          props={{ "data-cn": "pm-bar", "data-motion": undefined, className: "pm-bar", style: { background: "color-mix(in srgb, var(--pm-raised) 92%, transparent)" } }}
          primary={primary}
          {...(actions.secondary && actions.secondary !== primary ? { secondary: actions.secondary } : {})}
          {...(actions.tertiary && actions.tertiary !== primary ? { tertiary: actions.tertiary } : {})}
          layout="tabs"
        />
      ) : null}
      <ChatLauncher businessName={facts.name} telHref={telHref(facts.phone)} phoneDisplay={facts.phoneDisplay} quoteHref={facts.quoteHref} />
    </div>
  );
}

/* ------------------------------------------------------------ header */

function Wordmark({ name }: { name: string }) {
  const words = name.split(" ");
  const last = words.length > 1 ? words.pop() : null;
  return (
    <span className="pm-wordmark">
      {words.join(" ")}
      {last ? <> <span className="pm-accent">{last}</span></> : null}
    </span>
  );
}

function PremiumHeader({ facts, homeHref }: { facts: PremiumFacts; homeHref: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const tel = telHref(facts.phone);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheet.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
      if (event.key === "Tab" && sheet.current) {
        const items = Array.from(sheet.current.querySelectorAll<HTMLElement>("a,button"));
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); };
  }, [open]);
  const links = facts.nav.filter((link) => link.href !== homeHref);
  // The sheet sits outside <header>: the header's backdrop blur would
  // otherwise become the containing block for the fixed sheet.
  return (
    <>
    <header className="pm-header">
      <div className="pm-header-inner">
        <a href={homeHref} className="pm-brand">
          {facts.logo ? (
            <img src={facts.logo} alt="" width={40} height={40} className="pm-logo" decoding="async" />
          ) : (
            <span className="pm-monogram" aria-hidden="true">{facts.name.slice(0, 1)}</span>
          )}
          <span className="pm-brand-text">
            <Wordmark name={facts.name} />
            {facts.industry ? <span className="pm-brand-tag">{facts.industry}</span> : null}
          </span>
        </a>
        <nav className="pm-desktop-nav" aria-label="Main">
          {facts.services.length ? <a href="#services">Services</a> : null}
          {links.slice(0, 4).map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className="pm-header-cta">
          {tel && facts.phoneDisplay ? <a className="pm-btn pm-btn-ghost pm-hide-sm" href={tel}>{facts.phoneDisplay}</a> : null}
          {facts.quoteHref ? <a className="pm-btn pm-btn-primary pm-hide-sm" href={facts.quoteHref}>Get a quote <Arrow /></a> : null}
          <button ref={toggle} type="button" className="pm-menu-button" aria-expanded={open} aria-controls="pm-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
            <span className={`pm-burger${open ? " is-open" : ""}`} aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>
    </header>
      <div ref={sheet} id="pm-menu" className={`pm-sheet${open ? " is-open" : ""}`} hidden={!open} role="dialog" aria-modal="true" aria-label="Menu">
        <nav aria-label="Menu" className="pm-sheet-nav">
          <a href={homeHref} onClick={() => setOpen(false)}>Home</a>
          {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
          {facts.services.length ? <p className="pm-eyebrow pm-sheet-label">Services</p> : null}
          {facts.services.map((service) => (
            <a key={service.name} className="pm-sheet-sub" href={service.href ?? "#services"} onClick={() => setOpen(false)}>{service.name}</a>
          ))}
        </nav>
        <div className="pm-sheet-cta">
          {facts.quoteHref ? <a className="pm-btn pm-btn-primary pm-btn-block" href={facts.quoteHref} onClick={() => setOpen(false)}>Get a quote <Arrow /></a> : null}
          {tel && facts.phoneDisplay ? <a className="pm-btn pm-btn-ghost pm-btn-block" href={tel}>Call {facts.phoneDisplay}</a> : null}
          {facts.address ? <p className="pm-sheet-address">{facts.address}</p> : null}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ pieces */

function Arrow() {
  return <svg className="pm-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

function PhoneIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>;
}

/** Owner photo in a fixed-ratio frame (no layout shift), smart crop via focal point, lazy unless it is the LCP. */
function Photo({ image, ratio, eager = false, sizes, className }: { image: PremiumImage; ratio: string; eager?: boolean; sizes: string; className?: string }) {
  return (
    <div className={`pm-photo ${className ?? ""}`.trim()} style={{ aspectRatio: ratio }}>
      <img
        src={image.src}
        alt={image.alt}
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        {...(eager ? { fetchPriority: "high" as const } : {})}
        {...(image.width && image.height ? { width: image.width, height: image.height } : {})}
        style={{ objectPosition: image.focal ?? "50% 40%" }}
      />
    </div>
  );
}

function TwoTone({ text, as: Tag = "h1", className }: { text: string; as?: "h1" | "h2"; className?: string }) {
  const { lead, accent } = splitTwoTone(text);
  return (
    <Tag className={className}>
      <span className="pm-line">{lead}</span>
      {accent ? <span className="pm-line pm-accent">{accent}</span> : null}
    </Tag>
  );
}

function CtaPair({ facts, quoteLabel = "Get a quote", extra }: { facts: PremiumFacts; quoteLabel?: string; extra?: ReactNode }) {
  const tel = telHref(facts.phone);
  return (
    <div className="pm-cta-row">
      {facts.quoteHref ? <a className="pm-btn pm-btn-primary pm-btn-lg" href={facts.quoteHref}>{quoteLabel} <Arrow /></a> : null}
      {extra}
      {tel && facts.phoneDisplay ? <a className="pm-btn pm-btn-ghost pm-btn-lg" href={tel}><PhoneIcon /> Call {facts.phoneDisplay}</a> : null}
    </div>
  );
}

function AddressLine({ facts }: { facts: PremiumFacts }) {
  const maps = directionsHref(facts.address);
  if (!facts.address || !maps) return null;
  return (
    <p className="pm-address">
      <span>{facts.name} · {facts.address}</span>{" "}
      <a href={maps} target="_blank" rel="noopener noreferrer" className="pm-link">Get directions <Arrow /></a>
    </p>
  );
}

/* ------------------------------------------------------------ home */

function Hero({ facts }: { facts: PremiumFacts }) {
  const headline = facts.tagline ?? facts.name;
  const eyebrow = [facts.industry, facts.serviceArea].filter(Boolean).join(" · ");
  const lede = clip(facts.description, 220);
  return (
    <section className={`pm-hero${facts.hero ? " has-photo" : ""}`} aria-label="Introduction">
      {facts.hero ? (
        <div className="pm-hero-media" aria-hidden="false">
          <img src={facts.hero.src} alt={facts.hero.alt} loading="eager" decoding="async" fetchPriority="high" sizes="100vw" style={{ objectPosition: facts.hero.focal ?? "60% 40%" }} />
        </div>
      ) : null}
      <div className="pm-hero-scrim" aria-hidden="true" />
      <div className="pm-hero-glow" aria-hidden="true" />
      <div className="pm-container pm-hero-inner">
        <div className="pm-hero-copy">
          {eyebrow ? <p className="pm-eyebrow pm-rise" style={{ animationDelay: "0ms" }}>{eyebrow}</p> : null}
          <TwoTone text={headline} className="pm-display pm-rise" />
          {lede ? <p className="pm-lede pm-rise" style={{ animationDelay: "120ms" }}>{lede}</p> : null}
          <div className="pm-rise" style={{ animationDelay: "200ms" }}><CtaPair facts={facts} /></div>
          <div className="pm-rise" style={{ animationDelay: "260ms" }}><AddressLine facts={facts} /></div>
        </div>
      </div>
    </section>
  );
}

const TRUST_ICON: Record<TrustItem["kind"], string> = {
  years: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  area: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  credential: "M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4zM9 12l2 2 4-4",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.7 2.7-1.8 3.4a16 16 0 0 0 6 6l3.4-1.8 2.7.7a2 2 0 0 1 1.9 2.2z",
  hours: "M12 8v4l3 2",
};

function TrustStrip({ items }: { items: TrustItem[] }) {
  if (!items.length) return null;
  return (
    <section className="pm-trust" aria-label="About us at a glance">
      <ul className="pm-container pm-trust-list">
        {items.map((item, index) => (
          <Reveal as="li" key={item.kind} delay={index * 0.06} className="pm-trust-item">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TRUST_ICON[item.kind]} /></svg>
            <span><strong>{item.value}</strong><small>{item.label}</small></span>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

function ServiceCard({ service, facts, index }: { service: PremiumService; facts: PremiumFacts; index: number }) {
  const href = service.href ?? facts.quoteHref;
  const copy = clip(service.description, 120);
  return (
    <Reveal as="li" delay={(index % 3) * 0.08} className="pm-card-wrap">
      <article className="pm-card">
        {service.image ? (
          <Photo image={service.image} ratio="16 / 10" sizes="(min-width:1024px) 380px, (min-width:640px) 50vw, 100vw" className="pm-card-photo" />
        ) : (
          <div className="pm-card-photo pm-card-nophoto" style={{ aspectRatio: "16 / 10" }} aria-hidden="true"><span>{service.name.slice(0, 1)}</span></div>
        )}
        <div className="pm-card-body">
          <h3 className="pm-card-title">{href ? <a href={href} className="pm-card-link">{service.name}</a> : service.name}</h3>
          {copy ? <p className="pm-card-copy">{copy}</p> : null}
          {href ? <span className="pm-more" aria-hidden="true">{service.href ? "Learn more" : "Get a quote"} <Arrow /></span> : null}
        </div>
      </article>
    </Reveal>
  );
}

function Services({ facts }: { facts: PremiumFacts }) {
  if (!facts.services.length) return null;
  return (
    <section id="services" className="pm-section pm-services" aria-labelledby="pm-services-title">
      <div className="pm-container">
        <Reveal className="pm-section-head">
          <p className="pm-eyebrow">Services</p>
          <h2 id="pm-services-title" className="pm-h2">What we <span className="pm-accent">do</span></h2>
          {facts.serviceArea ? <p className="pm-muted">Serving {facts.serviceArea}.</p> : null}
        </Reveal>
        <ul className="pm-grid">
          {facts.services.map((service, index) => <ServiceCard key={service.name} service={service} facts={facts} index={index} />)}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ service page */

function ServiceDetail({ facts, service }: { facts: PremiumFacts; service: PremiumService }) {
  const { problem, approach, steps, included } = service.detail;
  const others = facts.services.filter((s) => s.name !== service.name).slice(0, 3);
  return (
    <>
      <section className={`pm-hero pm-hero-service${service.image ? " has-photo" : ""}`} aria-label={service.name}>
        {service.image ? (
          <div className="pm-hero-media"><img src={service.image.src} alt={service.image.alt} loading="eager" decoding="async" fetchPriority="high" sizes="100vw" style={{ objectPosition: service.image.focal ?? "50% 45%" }} /></div>
        ) : null}
        <div className="pm-hero-scrim" aria-hidden="true" />
        <div className="pm-hero-glow" aria-hidden="true" />
        <div className="pm-container pm-hero-inner">
          <div className="pm-hero-copy">
            <p className="pm-eyebrow pm-rise"><a href="#services" className="pm-crumb">Services</a> / {facts.name}</p>
            <TwoTone text={service.name} className="pm-display pm-display-sm pm-rise" />
            {service.description ? <p className="pm-lede pm-rise" style={{ animationDelay: "120ms" }}>{clip(service.description, 260)}</p> : null}
            <div className="pm-rise" style={{ animationDelay: "200ms" }}>
              <CtaPair facts={facts} extra={facts.bookHref ? <a className="pm-btn pm-btn-ghost pm-btn-lg" href={facts.bookHref}>Book this service</a> : null} />
            </div>
          </div>
        </div>
      </section>
      {problem || approach ? (
        <section className="pm-section" aria-label="How we help">
          <div className="pm-container pm-panels">
            {problem ? (
              <Reveal className="pm-panel"><p className="pm-eyebrow">The problem</p><p className="pm-panel-text">{problem}</p></Reveal>
            ) : null}
            {approach ? (
              <Reveal delay={0.08} className="pm-panel pm-panel-accent"><p className="pm-eyebrow">Our approach</p><p className="pm-panel-text">{approach}</p></Reveal>
            ) : null}
          </div>
        </section>
      ) : null}
      {steps?.length ? (
        <section className="pm-section pm-band" aria-labelledby="pm-steps">
          <div className="pm-container">
            <Reveal className="pm-section-head"><p className="pm-eyebrow">Process</p><h2 id="pm-steps" className="pm-h2">How it <span className="pm-accent">works</span></h2></Reveal>
            <ol className="pm-steps">
              {steps.map((step, index) => (
                <Reveal as="li" key={step} delay={index * 0.06} className="pm-step"><span className="pm-step-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p>{step}</p></Reveal>
              ))}
            </ol>
          </div>
        </section>
      ) : null}
      {included?.length ? (
        <section className="pm-section" aria-labelledby="pm-included">
          <div className="pm-container pm-included">
            <Reveal className="pm-section-head"><p className="pm-eyebrow">What's included</p><h2 id="pm-included" className="pm-h2">Every <span className="pm-accent">{service.name}</span> job</h2></Reveal>
            <ul className="pm-checks">
              {included.map((item) => (
                <li key={item}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      {others.length ? (
        <section id="services" className="pm-section pm-band" aria-labelledby="pm-more">
          <div className="pm-container">
            <Reveal className="pm-section-head"><p className="pm-eyebrow">More services</p><h2 id="pm-more" className="pm-h2">Also from <span className="pm-accent">{facts.name}</span></h2></Reveal>
            <ul className="pm-grid">{others.map((s, i) => <ServiceCard key={s.name} service={s} facts={facts} index={i} />)}</ul>
          </div>
        </section>
      ) : null}
    </>
  );
}

function PageIntro({ title }: { title: string }) {
  return (
    <section className="pm-section pm-page-intro"><div className="pm-container"><TwoTone text={title} className="pm-display pm-display-sm" /></div></section>
  );
}

/* ------------------------------------------------------------ quote + footer */

function QuoteBand({ facts, form }: { facts: PremiumFacts; form?: ReactNode }) {
  if (!form && !facts.quoteHref && !telHref(facts.phone)) return null;
  return (
    <section id="quote" className="pm-section pm-quote" aria-labelledby="pm-quote-title">
      <div className="pm-container pm-quote-grid">
        <Reveal className="pm-quote-copy">
          <p className="pm-eyebrow">Get a quote</p>
          <h2 id="pm-quote-title" className="pm-h2">Tell us about <span className="pm-accent">your job</span></h2>
          <p className="pm-muted">Send the details and {facts.name} will get back to you{facts.phoneDisplay ? <>, or call <a className="pm-link" href={telHref(facts.phone) ?? undefined}>{facts.phoneDisplay}</a></> : null}.</p>
          <AddressLine facts={facts} />
        </Reveal>
        {form ? <Reveal delay={0.08} className="pm-form-card"><div id="contact">{form}</div></Reveal> : null}
      </div>
    </section>
  );
}

function Footer({ facts, homeHref }: { facts: PremiumFacts; homeHref: string }) {
  const tel = telHref(facts.phone);
  const maps = directionsHref(facts.address);
  return (
    <footer className="pm-footer">
      <div className="pm-container pm-footer-grid">
        <div>
          <a href={homeHref} className="pm-brand"><span className="pm-brand-text"><Wordmark name={facts.name} /></span></a>
          {facts.tagline ? <p className="pm-muted pm-footer-tag">{facts.tagline}</p> : null}
        </div>
        {facts.services.length ? (
          <div><p className="pm-eyebrow">Services</p><ul className="pm-footer-list">{facts.services.slice(0, 6).map((s) => <li key={s.name}>{s.href ? <a href={s.href}>{s.name}</a> : s.name}</li>)}</ul></div>
        ) : null}
        {tel || facts.email || facts.address ? (
          <div><p className="pm-eyebrow">Contact</p><ul className="pm-footer-list">
            {tel && facts.phoneDisplay ? <li><a href={tel}>{facts.phoneDisplay}</a></li> : null}
            {facts.email ? <li><a href={`mailto:${facts.email}`}>{facts.email}</a></li> : null}
            {facts.address && maps ? <li><a href={maps} target="_blank" rel="noopener noreferrer">{facts.address}</a></li> : null}
          </ul></div>
        ) : null}
      </div>
      <p className="pm-container pm-legal">© {new Date().getFullYear()} {facts.name}</p>
    </footer>
  );
}
