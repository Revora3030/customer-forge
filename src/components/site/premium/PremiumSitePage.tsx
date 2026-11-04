/**
 * Production wiring for the premium mobile template: turns a loaded
 * PublicSite into the facts model, applies the AA-checked dark theme and
 * mounts the real enquiry form. Opt-in per site via
 * settings.generation.template = "premium-mobile"; every other site keeps the
 * existing renderer untouched.
 */
import type { ReactNode } from "react";
import type { PublicSite } from "@/lib/public-site.functions";
import { EnquiryForm } from "@/components/site/SiteForms";
import { PremiumSite } from "@/components/site/premium/PremiumSite";
import { premiumDarkThemeVars, premiumFactsFrom, premiumPageFor } from "@/lib/builder/premium-mobile-template";

export function PremiumSitePage({ site, href, children, pageHasForm, footer }: {
  site: NonNullable<PublicSite>;
  /** Resolves a site path for the current address (custom domain, /s/slug, draft preview). */
  href: (path: string) => string;
  /** The page's own stored sections, shown on pages the template does not lay out itself. */
  children?: ReactNode;
  /** The page's sections already include an enquiry form, so the template does not add a second. */
  pageHasForm: boolean;
  /** Preview-only chrome (builder return bar etc.). */
  footer?: ReactNode;
}) {
  const facts = premiumFactsFrom(site as never, href);
  const page = premiumPageFor(site.content?.page ?? null, facts.services);
  // The template always places the quote form on the page, so its quote
  // buttons scroll there instead of leaving for another page.
  const onPageFacts = pageHasForm ? facts : { ...facts, quoteHref: "#quote" };
  return (
    <div className="rv-site-root" style={premiumDarkThemeVars({ brandColor: site.profile?.primary_color ?? null })} data-template="premium-mobile">
      <PremiumSite facts={onPageFacts} page={page} homeHref={href("/")} form={pageHasForm ? undefined : <EnquiryForm site={site} />}>
        {page.kind === "other" ? children : null}
      </PremiumSite>
      {footer}
    </div>
  );
}
