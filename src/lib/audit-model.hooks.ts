/**
 * One audit model for the whole builder.
 *
 * Both the Growth Command Center and the builder's "Growth & audit" section
 * read from here, so a finding, its score and its fix are identical wherever the
 * customer meets them. Everything is derived from records already saved in the
 * workspace — nothing is invented.
 */

import { useMemo } from "react";
import { useBusinessProfile, useServices, useWebsiteSettings } from "@/lib/queries";
import { useScoreFacts } from "@/lib/site-engine.hooks";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { readSeo } from "@/lib/site-seo";
import { readCopy } from "@/lib/site-engine";
import { auditStructure } from "@/lib/site-audit";
import { conversionGaps, normalizeGoal, type ConversionContext } from "@/lib/conversion-engine";
import { proposeUpgrades } from "@/lib/auto-upgrade";

export function useAuditModel(
  organizationId: string | undefined,
  org: { name?: string | null; slug?: string | null; conversion_goal?: string | null } | null | undefined,
) {
  const profileQuery = useBusinessProfile(organizationId);
  const settingsQuery = useWebsiteSettings(organizationId);
  const { data: services } = useServices(organizationId);
  const { data: pages } = useWebsiteContent(organizationId);
  const facts = useScoreFacts(organizationId);

  const profile = profileQuery.data as Record<string, unknown> | null | undefined;
  const settings = settingsQuery.data;
  const seo = readSeo(settings?.seo);
  const generation = (settings?.generation ?? null) as Record<string, unknown> | null;
  const copy = readCopy(generation?.["copy"]);

  const str = (key: string) => {
    const value = profile?.[key];
    return typeof value === "string" && value.trim() ? value : null;
  };

  const selectedGoals = Array.isArray(profile?.["website_goals"])
    ? (profile["website_goals"] as unknown[]).filter((goal): goal is string => typeof goal === "string")
    : [];
  const goal =
    normalizeGoal(org?.conversion_goal ?? null) ??
    selectedGoals.map((selected) => normalizeGoal(selected)).find((selected) => selected !== null) ??
    null;

  const conversionCtx: ConversionContext = {
    phone: str("phone"),
    smsCapable: !!str("phone"),
    bookableCount: facts.data?.bookableCount ?? 0,
    quoteFormCount: facts.data?.quoteFormCount ?? 0,
    paymentsEnabled: (services ?? []).some((service) => Number(service.starting_price ?? 0) > 0),
    email: str("email"),
    slug: org?.slug ?? null,
  };

  const structure = useMemo(
    () =>
      auditStructure({
        pages: pages ?? [],
        goal,
        metaDescription: seo.meta_description ?? null,
        headline: seo.headline ?? null,
      }),
    [pages, goal, seo.meta_description, seo.headline],
  );

  const sectionKinds = (pages ?? []).flatMap((page) =>
    page.sections.filter((section) => section.is_visible).map((section) => section.kind),
  );
  const gaps = conversionGaps(
    goal,
    conversionCtx,
    sectionKinds,
    (copy?.faqs ?? []).map((faq) => faq.question),
  );

  const proposals = useMemo(
    () =>
      proposeUpgrades(structure.issues, {
        goal,
        copyHeadline: copy?.heroHeadline ?? null,
        copyMetaDescription: copy?.metaDescription ?? null,
        copyPrimaryCta: copy?.primaryCta ?? null,
        headline: seo.headline ?? null,
        metaDescription: seo.meta_description ?? null,
        primaryCtaLabel: seo.primary_cta_label ?? null,
        publishState: settings?.publish_state ?? "draft",
        pages: (pages ?? []).map((page) => ({
          id: page.id,
          title: page.title,
          slug: page.slug,
          seo_title: page.seo_title,
          seo_description: page.seo_description,
          noindex: page.noindex,
        })),
        businessName: org?.name ?? null,
        city: str("city"),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structure.issues, goal, copy, seo, settings?.publish_state, pages, org?.name, profile],
  );

  return {
    goal,
    conversionCtx,
    structure,
    gaps,
    proposals,
    seo: seo as unknown as Record<string, unknown>,
    isLoading: profileQuery.isLoading || settingsQuery.isLoading,
  };
}
