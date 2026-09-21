/**
 * One authoritative creative brief for a website's first build.
 *
 * This joins the existing business DNA, industry playbook, composition
 * fingerprint and image-direction systems before any page rows are written.
 * It is deliberately pure: strategy can shape presentation, but it can never
 * introduce a business claim.
 */
import { businessDna } from "@/lib/business-dna";
import { playbookFor } from "@/lib/builder/industry";
import {
  createDesignFingerprint,
  type DesignFingerprint,
} from "@/lib/builder/design-fingerprint";
import { pickVisualDirection, planShots, type PlannedShot } from "@/lib/visual-direction";
import { assetPlanFor, type AssetPlan } from "@/lib/builder/asset-intelligence";
import { compileCreativeBrief, type CreativeBrief } from "@/lib/builder/creative-brief";

export type FirstBuildCreativeInput = {
  organizationId: string;
  businessName: string;
  industry: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;
  yearsInBusiness: number | null;
  services: { name: string; price?: number | null; starting_price?: number | null }[];
  goals: string[];
  conversionGoal: string | null;
  photoCount: number;
  testimonialCount: number;
  bookableServices: number;
  hasHours: boolean;
};

export type FirstBuildCreativeDirection = {
  version: 1;
  industry: {
    id: string;
    label: string;
    objections: string[];
    trust: string[];
    avoid: string[];
    homeSections: string[];
    pageSlugs: string[];
  };
  audience: string;
  offerHierarchy: string[];
  conversion: {
    goal: string;
    primaryCta: string;
    secondaryCta: string;
    placements: string[];
    stickyMobile: boolean;
  };
  fingerprint: DesignFingerprint;
  imagery: {
    directionId: string;
    language: string;
    treatment: string;
    status: "owner_photos" | "artwork_only";
    shots: PlannedShot[];
    assetPlan: AssetPlan;
  };
  /** Art direction decided before any page row is written. */
  brief: CreativeBrief;
  unknowns: string[];
};

export function compileFirstBuildCreativeDirection(
  input: FirstBuildCreativeInput,
): FirstBuildCreativeDirection {
  const serviceNames = input.services.map((service) => service.name).filter(Boolean);
  const hasPrices = input.services.some(
    (service) => service.price != null || service.starting_price != null,
  );
  const dna = businessDna({
    businessName: input.businessName,
    industry: input.industry,
    services: serviceNames,
    description: input.description,
    city: input.city,
    region: input.state,
    serviceArea: input.serviceArea,
    phone: input.phone,
    email: input.email,
    yearsInBusiness: input.yearsInBusiness,
    testimonialCount: input.testimonialCount,
    photoCount: input.photoCount,
    hasPrices,
    bookableServices: input.bookableServices,
    goals: input.goals,
    conversionGoal: input.conversionGoal,
    hasHours: input.hasHours,
  });
  const playbook = playbookFor(
    input.industry,
    input.description,
    serviceNames.join(" "),
  );
  const fingerprint = createDesignFingerprint({
    businessName: input.businessName,
    industry: playbook.slug,
    city: input.city ?? input.serviceArea,
    audience: dna.targetCustomer,
    goal: playbook.conversion.primaryAction,
    photoCount: input.photoCount,
    contentDensity: serviceNames.length >= 6 ? "rich" : serviceNames.length <= 2 ? "light" : "balanced",
  });
  const visual = pickVisualDirection({
    industry: [input.industry, playbook.slug, input.description].filter(Boolean).join(" "),
    services: input.services,
  });
  const shots = planShots({
    direction: visual,
    serviceNames,
    hasHeroImage: input.photoCount > 0,
    mediaCount: input.photoCount,
  });
  const assetPlan = assetPlanFor(
    { businessName: input.businessName, logoUrl: null, heroImageUrl: null },
    playbook,
    playbook.homeSections,
    {
      hasHeroImage: input.photoCount > 0,
      galleryPhotoCount: input.photoCount,
    },
  );

  const brief = compileCreativeBrief({
    fingerprint,
    direction: visual,
    shots,
    industryLabel: playbook.label,
    industrySignals: [input.industry, playbook.slug, input.description, serviceNames.join(" ")]
      .filter(Boolean)
      .join(" "),
    primaryCta: dna.primaryCta,
    secondaryCta: dna.secondaryCta,
    conversionPlacements: [...playbook.conversion.placement],
    stickyMobile: playbook.conversion.stickyMobile,
    hasOwnerPhotos: input.photoCount > 0,
  });

  return {
    version: 1,
    industry: {
      id: playbook.slug,
      label: playbook.label,
      objections: playbook.objections.slice(0, 6),
      trust: playbook.trust.slice(0, 6),
      avoid: [...dna.prohibited],
      homeSections: [...playbook.homeSections],
      pageSlugs: playbook.pages.map((page) => page.slug).filter(Boolean),
    },
    audience: dna.targetCustomer,
    offerHierarchy: serviceNames.slice(0, 12),
    conversion: {
      goal: dna.desiredAction,
      primaryCta: dna.primaryCta,
      secondaryCta: dna.secondaryCta,
      placements: [...playbook.conversion.placement],
      stickyMobile: playbook.conversion.stickyMobile,
    },
    fingerprint,
    imagery: {
      directionId: visual.id,
      language: visual.language,
      treatment: visual.treatment,
      status: input.photoCount > 0 ? "owner_photos" : "artwork_only",
      shots,
      assetPlan,
    },
    unknowns: dna.needed,
  };
}