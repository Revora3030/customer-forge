/**
 * Runs the builder's real prompt code (page architect + reviewer, section
 * copywriter + reviewer) against one fixture with a swappable model function.
 * Stubbed in CI (stub-model.ts); real in the optional live run.
 */
import { deriveCandidateArchitecture } from "@/lib/builder/ai-page-architecture";
import { proposePageArchitecture, type PageArchitectureOutcome } from "@/lib/builder/ai-page-architecture.server";
import { refineSectionWordingWithCollective, type SectionWording, type SectionWordingOutcome } from "@/lib/builder/collective-sections.server";
import type { DnaFacts } from "@/lib/business-dna";
import type { PromptFixture } from "./fixtures";
import { setActiveRun, type ModelFn, type RecordedCall } from "./thinker-route";

export { routeThinker } from "./thinker-route";

export type Run = {
  fixture: PromptFixture;
  calls: RecordedCall[];
  architecture: PageArchitectureOutcome;
  sections: SectionWording[];
  wording: SectionWordingOutcome;
};

export function candidateFor(fixture: PromptFixture) {
  const cta = fixture.conversionGoal;
  const material = fixture.thin
    ? [
        { slug: "home", title: "Home", kind: "home", sections: [{ kind: "hero" }, { kind: "intro" }, { kind: "quote" }, { kind: "contact" }] },
        { slug: "about", title: "About", kind: "about", sections: [{ kind: "intro" }, { kind: "cta" }] },
        { slug: "contact", title: "Contact", kind: "contact", sections: [{ kind: "contact" }] },
      ]
    : [
        { slug: "home", title: "Home", kind: "home", sections: [{ kind: "hero" }, { kind: "services" }, { kind: "benefits" }, { kind: "faq" }, { kind: "quote" }, { kind: "contact" }, { kind: "cta" }] },
        { slug: "services", title: "Services", kind: "services", sections: [{ kind: "services" }, { kind: "quote" }] },
        { slug: "about", title: "About", kind: "about", sections: [{ kind: "intro" }, { kind: "cta" }] },
        { slug: "contact", title: "Contact", kind: "contact", sections: [{ kind: "contact" }] },
      ];
  return deriveCandidateArchitecture(material, cta);
}

export function factsFor(fixture: PromptFixture): DnaFacts {
  return {
    businessName: fixture.businessName,
    industry: fixture.industry,
    services: fixture.services,
    description: fixture.description || null,
    city: fixture.city,
    region: fixture.region,
    country: "US",
    serviceArea: fixture.serviceArea,
    phone: fixture.phone,
    email: fixture.email,
    yearsInBusiness: fixture.yearsInBusiness,
    hasPrices: fixture.prices.length > 0,
    conversionGoal: fixture.conversionGoal,
    goals: ["quote", "call"],
  };
}

/** Builds the section list the wording pass would receive from a planned site. */
export function sectionsFromArchitecture(architecture: NonNullable<PageArchitectureOutcome["architecture"]>): SectionWording[] {
  return architecture.flatMap((page) =>
    page.sections.map((section, index) => ({
      id: `${page.slug}-${section.role}-${index}`,
      page: page.slug,
      kind: section.role,
      heading: section.heading ?? null,
      subheading: section.subheading ?? null,
      body: section.body ?? null,
    })),
  );
}

export async function runFixture(fixture: PromptFixture, model: ModelFn): Promise<Run> {
  const calls: RecordedCall[] = [];
  setActiveRun({ fixture, model, calls });
  try {
    const architecture = await proposePageArchitecture({
      organizationId: "org-prompt-regression",
      businessName: fixture.businessName,
      industry: fixture.industry,
      conversionGoal: fixture.conversionGoal,
      candidate: candidateFor(fixture),
      description: fixture.description || null,
      services: fixture.services,
      serviceArea: fixture.serviceArea,
      contact: { phone: true, email: true },
    });
    const sections = architecture.architecture ? sectionsFromArchitecture(architecture.architecture) : [];
    const wording = await refineSectionWordingWithCollective({
      organizationId: "org-prompt-regression",
      facts: factsFor(fixture),
      sections,
    });
    return { fixture, calls, architecture, sections, wording };
  } finally {
    setActiveRun(null);
  }
}
