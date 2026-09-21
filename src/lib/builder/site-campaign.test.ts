import { describe, expect, it } from "vitest";
import { compileFirstBuildCreativeDirection } from "./first-build-creative";
import { compileSiteCampaign, pageJourneyFor, readSiteCampaign } from "./site-campaign";

const creative = compileFirstBuildCreativeDirection({
  organizationId: "11111111-1111-4111-8111-111111111111",
  businessName: "Northline Detail",
  industry: "Automotive detailing",
  description: "Mobile vehicle detailing",
  city: "Leeds",
  state: null,
  serviceArea: "Leeds",
  phone: "0113 555 0100",
  email: null,
  yearsInBusiness: null,
  services: [{ name: "Interior detail" }],
  goals: ["quotes"],
  conversionGoal: "quotes",
  photoCount: 0,
  testimonialCount: 0,
  bookableServices: 0,
  hasHours: false,
});

describe("site campaign", () => {
  it("gives every page its own journey while sharing one brand system", () => {
    const campaign = compileSiteCampaign({
      fingerprint: creative.fingerprint,
      brief: creative.brief,
      pages: [
        { slug: "home", kind: "home", sectionKinds: ["hero", "services", "cta"] },
        { slug: "services/interior-detail", kind: "service", sectionKinds: ["hero", "service_detail", "faq", "cta"] },
        { slug: "contact", kind: "contact", sectionKinds: ["hero", "contact"] },
      ],
      primaryAction: "Get a quote",
      primaryTarget: "/contact",
      hasPhone: true,
      hasPlace: true,
    });
    expect(campaign.mobileActions).toBe("call-and-primary");
    expect(pageJourneyFor(campaign, "home")?.opening).toBe("cinematic");
    expect(pageJourneyFor(campaign, "services/interior-detail")?.purpose).toBe("decide");
    expect(pageJourneyFor(campaign, "contact")?.purpose).toBe("convert");
    expect(readSiteCampaign({ siteCampaign: campaign })).toEqual(campaign);
  });
});