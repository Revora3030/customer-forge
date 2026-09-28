/**
 * Site campaign — compiles conversion-focused campaign sections.
 */

export type SiteCampaign = {
  headline: string;
  subheadline: string;
  ctaLabel: string;
  ctaHref: string;
  placement: "hero" | "banner" | "footer" | "inline";
  active: boolean;
};

export function compileSiteCampaign(input: {
  businessName: string;
  primaryCta: string;
  city: string | null;
  services: string[];
  fingerprint?: unknown;
  brief?: unknown;
  directedBy?: string;
  reviewedBy?: string | null;
  conversionGoal?: string | null;
  navigationItems?: string[];
  primaryAction?: string;
  secondaryAction?: string | null;
  differentiators?: string[];
  pages?: unknown;
  primaryTarget?: unknown;
  hasPhone?: boolean;
  hasPlace?: boolean;
  hasQuoteForm?: boolean;
  hasBooking?: boolean;
  phone?: string | null;
  state?: string | null;
  serviceArea?: string | null;
}): SiteCampaign | null {
  if (!input.primaryCta) return null;
  return {
    headline: input.primaryCta,
    subheadline: input.city
      ? `Serving ${input.city} and surrounding areas`
      : "Ready when you are",
    ctaLabel: input.primaryCta,
    ctaHref: "#contact",
    placement: "hero",
    active: true,
  };
}
