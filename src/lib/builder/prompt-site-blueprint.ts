export type BlueprintGoal = 'calls' | 'quotes' | 'bookings' | 'consultations' | 'purchases';

export type PromptSiteInput = {
  businessName: string;
  industry: string;
  location?: string;
  goal: BlueprintGoal;
  services: string[];
  differentiator?: string;
  hasTestimonials: boolean;
};

export type BlueprintSection = {
  id: string;
  kind: 'hero' | 'proof' | 'services' | 'process' | 'faq' | 'cta' | 'contact';
  purpose: string;
  editable: true;
};

export type BlueprintPage = {
  slug: string;
  title: string;
  purpose: string;
  sections: BlueprintSection[];
};

export type PromptSiteBlueprint = {
  primaryCta: string;
  valueProposition: string;
  pages: BlueprintPage[];
  seo: { title: string; description: string; };
  requiresPreview: true;
  reversible: true;
};

const ctaFor: Record<BlueprintGoal, string> = {
  calls: 'Call now',
  quotes: 'Request a quote',
  bookings: 'Book now',
  consultations: 'Book a consultation',
  purchases: 'Shop now',
};

const actionNoun: Record<BlueprintGoal, string> = {
  calls: 'call', quotes: 'quote', bookings: 'booking', consultations: 'consultation', purchases: 'purchase',
};

function sections(goal: BlueprintGoal, hasTestimonials: boolean): BlueprintSection[] {
  const result: BlueprintSection[] = [
    { id: 'hero', kind: 'hero', purpose: 'State the customer outcome, differentiator, and primary action immediately.', editable: true },
    { id: 'proof', kind: 'proof', purpose: hasTestimonials ? 'Show authentic testimonials and practical trust signals near the first CTA.' : 'Reserve a trust area for verified credentials, process proof, or future testimonials.', editable: true },
    { id: 'services', kind: 'services', purpose: 'Make the primary offers easy to scan and choose.', editable: true },
    { id: 'process', kind: 'process', purpose: `Explain what happens after a visitor requests a ${actionNoun[goal]}.`, editable: true },
    { id: 'faq', kind: 'faq', purpose: 'Answer the highest-friction questions before the final decision.', editable: true },
    { id: 'cta', kind: 'cta', purpose: 'Repeat one clear conversion action with a low-friction next step.', editable: true },
  ];
  if (goal !== 'purchases') result.push({ id: 'contact', kind: 'contact', purpose: 'Provide a reliable contact route and local details.', editable: true });
  return result;
}

export function createPromptSiteBlueprint(input: PromptSiteInput): PromptSiteBlueprint {
  const place = input.location ? ` in ${input.location}` : '';
  const serviceSummary = input.services.filter(Boolean).slice(0, 3).join(', ') || 'the services your customers need';
  const differentiator = input.differentiator?.trim() || 'a clear, trustworthy experience';
  const primaryCta = ctaFor[input.goal];

  return {
    primaryCta,
    valueProposition: `${input.businessName} helps customers${place} with ${serviceSummary} through ${differentiator}.`,
    pages: [
      { slug: '/', title: 'Home', purpose: 'Turn first-time visitors into qualified next steps.', sections: sections(input.goal, input.hasTestimonials) },
      { slug: '/services', title: 'Services', purpose: 'Explain each service, outcome, and next step.', sections: [{ id: 'services', kind: 'services', purpose: 'Present service detail with decision-ready calls to action.', editable: true }, { id: 'cta', kind: 'cta', purpose: `Invite visitors to ${primaryCta.toLowerCase()}.`, editable: true }] },
      { slug: '/about', title: 'About', purpose: 'Establish legitimate expertise, values, and local relevance.', sections: [{ id: 'proof', kind: 'proof', purpose: 'Use verified story, people, and credibility signals.', editable: true }, { id: 'cta', kind: 'cta', purpose: 'Offer the primary next step without forcing a hard sell.', editable: true }] },
      { slug: '/contact', title: 'Contact', purpose: 'Remove friction from the final conversion step.', sections: [{ id: 'contact', kind: 'contact', purpose: 'Provide a clear form, phone path, location, and response expectation.', editable: true }] },
    ],
    seo: { title: `${input.businessName}${place} | ${serviceSummary}`, description: `${input.businessName} offers ${serviceSummary}${place}. ${primaryCta} to get started.` },
    requiresPreview: true,
    reversible: true,
  };
}
