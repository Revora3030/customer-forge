/**
 * Local visual harness for the premium mobile template. Renders the fictional
 * fixture with a static stand-in form (no network, no database, no AI).
 * ?page=ceramic shows a service page; ?min=1 shows a sparse business with no
 * phone, address, photos or trust facts.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PremiumSite } from "@/components/site/premium/PremiumSite";
import { PREMIUM_FIXTURE } from "@/components/site/premium/premium-fixture";
import { premiumDarkThemeVars, type PremiumFacts, type PremiumPage } from "@/lib/builder/premium-mobile-template";

const params = new URLSearchParams(location.search);
const sparse: PremiumFacts = {
  ...PREMIUM_FIXTURE, name: "Sample Plumbing", tagline: null, industry: "Plumbing", phone: null, phoneDisplay: null, email: null, address: null,
  serviceArea: null, yearsInBusiness: null, certifications: null, hero: null,
  services: PREMIUM_FIXTURE.services.map((s) => ({ ...s, image: null, href: null, detail: {} })),
};
const facts = params.get("min") ? sparse : PREMIUM_FIXTURE;
const slug = params.get("page");
const service = facts.services.find((s) => s.href === `?page=${slug}`);
const page: PremiumPage = service ? { kind: "service", service } : { kind: "home" };

// eslint-disable-next-line react-refresh/only-export-components -- local harness entry; fast refresh is not needed.
function FixtureForm() {
  const field = { display: "grid", gap: 6, fontSize: 14, fontWeight: 600 } as const;
  const input = { minHeight: 48, borderRadius: 12, border: "1px solid var(--pm-border-strong)", background: "var(--background)", color: "var(--foreground)", padding: "0 14px", font: "inherit" } as const;
  return (
    <form onSubmit={(e) => e.preventDefault()} style={{ display: "grid", gap: 16 }} aria-label="Quote request (sample, does not send)">
      <label style={field}>Name<input style={input} name="name" autoComplete="name" /></label>
      <label style={field}>Phone or email<input style={input} name="contact" autoComplete="email" /></label>
      <label style={field}>What do you need?<textarea style={{ ...input, minHeight: 110, padding: 14 }} name="message" /></label>
      <button type="submit" className="pm-btn pm-btn-primary pm-btn-lg">Send request</button>
    </form>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={premiumDarkThemeVars({ brandColor: "#3b82f6" })}>
      <PremiumSite facts={facts} page={page} form={<FixtureForm />} homeHref="/" />
    </div>
  </StrictMode>,
);
