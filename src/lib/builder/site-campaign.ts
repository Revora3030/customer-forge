import type { CreativeBrief } from "@/lib/builder/creative-brief";
import type { DesignFingerprint } from "@/lib/builder/design-fingerprint";

export const SITE_CAMPAIGN_VERSION = 1 as const;

export type PageJourney = {
  slug: string;
  kind: string;
  purpose: "orient" | "compare" | "decide" | "trust" | "convert" | "visit";
  opening: "cinematic" | "editorial" | "compact";
  primaryAction: string;
  target: string;
  mediaRole: "background" | "feature" | "supporting" | "none";
  mobileOrder: "content-first" | "media-first";
  requiredSections: string[];
};

export type SiteCampaign = {
  version: typeof SITE_CAMPAIGN_VERSION;
  fingerprintId: string;
  family: string;
  announcement: "service-area" | "none";
  header: "overlay-to-solid" | "solid";
  navigation: string;
  footer: string;
  mobileActions: "call-and-primary" | "primary-only" | "none";
  sectionRhythm: string;
  typeSystem: string;
  colorStrategy: CreativeBrief["color"]["strategy"];
  pageJourneys: PageJourney[];
};

export type CampaignPageInput = {
  slug: string;
  kind: string;
  sectionKinds: string[];
};

function purposeFor(page: CampaignPageInput): PageJourney["purpose"] {
  if (page.slug === "home") return "orient";
  if (/contact|book|quote|consult|valuation/.test(`${page.slug} ${page.kind}`)) return "convert";
  if (/about|team|work|gallery|project/.test(`${page.slug} ${page.kind}`)) return "trust";
  if (/area|location|visit/.test(`${page.slug} ${page.kind}`)) return "visit";
  if (/pricing|package|membership|menu/.test(`${page.slug} ${page.kind}`)) return "compare";
  return "decide";
}

export function compileSiteCampaign(input: {
  fingerprint: DesignFingerprint;
  brief: CreativeBrief;
  pages: CampaignPageInput[];
  primaryAction: string;
  primaryTarget: string;
  hasPhone: boolean;
  hasPlace: boolean;
}): SiteCampaign {
  const dark = input.brief.color.strategy === "dark-dominant";
  return {
    version: SITE_CAMPAIGN_VERSION,
    fingerprintId: input.fingerprint.id,
    family: input.fingerprint.family,
    announcement: input.hasPlace ? "service-area" : "none",
    header: dark || /cinematic|overlay|full-bleed/.test(input.fingerprint.heroComposition)
      ? "overlay-to-solid"
      : "solid",
    navigation: input.fingerprint.navSystem,
    footer: input.fingerprint.footerSystem,
    mobileActions: input.hasPhone ? "call-and-primary" : input.primaryTarget ? "primary-only" : "none",
    sectionRhythm: input.fingerprint.sectionRhythm,
    typeSystem: input.fingerprint.typeSystem,
    colorStrategy: input.brief.color.strategy,
    pageJourneys: input.pages.map((page) => {
      const purpose = purposeFor(page);
      const hasHero = page.sectionKinds.includes("hero");
      return {
        slug: page.slug,
        kind: page.kind,
        purpose,
        opening: page.slug === "home" ? "cinematic" : hasHero ? "editorial" : "compact",
        primaryAction: input.primaryAction,
        target: input.primaryTarget,
        mediaRole: page.slug === "home" ? "background" : hasHero ? "feature" : "supporting",
        mobileOrder: purpose === "trust" ? "media-first" : "content-first",
        requiredSections: page.sectionKinds,
      };
    }),
  };
}

export function readSiteCampaign(generation: unknown): SiteCampaign | null {
  if (!generation || typeof generation !== "object" || Array.isArray(generation)) return null;
  const raw = (generation as Record<string, unknown>)["siteCampaign"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const campaign = raw as Partial<SiteCampaign>;
  if (
    campaign.version !== SITE_CAMPAIGN_VERSION ||
    typeof campaign.fingerprintId !== "string" ||
    !Array.isArray(campaign.pageJourneys)
  ) return null;
  return campaign as SiteCampaign;
}

export function pageJourneyFor(campaign: SiteCampaign | null, slug: string): PageJourney | null {
  return campaign?.pageJourneys.find((page) => page.slug === slug) ?? null;
}