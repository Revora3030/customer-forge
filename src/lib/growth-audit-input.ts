/**
 * Builds the Growth Command Center's audit input from saved workspace records.
 * Shared by /app/command and the read-only growth snapshot on /app so both
 * show the same score. Pure: no queries, nothing invented.
 */
import type { GrowthAuditInput } from "@/lib/growth-command";

export type GrowthScoreFacts = {
  servicesCount: number;
  pricedServicesCount: number;
  bookableCount: number;
  quoteFormCount: number;
  mediaCount: number;
  reviewCount: number;
  socialLinks: number;
  signals: { visitors: number; leads: number; bookings: number; callClicks: number };
};

export type GrowthAuditParts = {
  businessName: string | null | undefined;
  profile: Record<string, unknown> | null | undefined;
  seo: {
    headline?: string | null;
    meta_description?: string | null;
    primary_cta_label?: string | null;
  };
  copy:
    | {
        faqs?: unknown[] | null;
        heroHeadline?: string | null;
        metaDescription?: string | null;
        primaryCta?: string | null;
      }
    | null
    | undefined;
  facts: GrowthScoreFacts | null | undefined;
  servicesLength: number;
  pages: { sections: { is_visible: boolean | null }[] }[] | null | undefined;
  publishState: string | null | undefined;
  domainStatus: string | null | undefined;
};

export function buildGrowthAuditInput(p: GrowthAuditParts): GrowthAuditInput {
  const str = (key: string) => {
    const value = p.profile?.[key];
    return typeof value === "string" && value.trim() ? value : null;
  };
  const hours = p.profile?.["hours"];
  const pages = p.pages ?? [];
  const visibleSections = pages.reduce(
    (sum, page) => sum + page.sections.filter((section) => section.is_visible).length,
    0,
  );
  return {
    businessName: p.businessName ?? null,
    description: str("description"),
    tagline: str("tagline"),
    phone: str("phone"),
    email: str("email"),
    city: str("city"),
    serviceArea: str("service_area"),
    logoUrl: str("logo_url"),
    hoursSet: Boolean(hours && typeof hours === "object" && Object.keys(hours).length > 0),
    headline: p.seo.headline ?? null,
    metaDescription: p.seo.meta_description ?? null,
    primaryCtaLabel: p.seo.primary_cta_label ?? null,
    hasCopy: !!p.copy,
    copyFaqCount: p.copy?.faqs?.length ?? 0,
    copyHeadline: p.copy?.heroHeadline ?? null,
    copyMetaDescription: p.copy?.metaDescription ?? null,
    copyPrimaryCta: p.copy?.primaryCta ?? null,
    servicesCount: p.facts?.servicesCount ?? p.servicesLength,
    pricedServicesCount: p.facts?.pricedServicesCount ?? 0,
    bookableCount: p.facts?.bookableCount ?? 0,
    quoteFormCount: p.facts?.quoteFormCount ?? 0,
    mediaCount: p.facts?.mediaCount ?? 0,
    reviewCount: p.facts?.reviewCount ?? 0,
    socialLinks: p.facts?.socialLinks ?? 0,
    pagesCount: pages.length,
    visibleSections,
    publishState: p.publishState ?? "draft",
    domainStatus: p.domainStatus ?? null,
    visitors: p.facts?.signals.visitors ?? 0,
    leads: p.facts?.signals.leads ?? 0,
    bookings: p.facts?.signals.bookings ?? 0,
    callClicks: p.facts?.signals.callClicks ?? 0,
  };
}
