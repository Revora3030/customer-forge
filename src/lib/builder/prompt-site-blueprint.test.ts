import { describe, expect, it } from 'vitest';
import { createPromptSiteBlueprint } from './prompt-site-blueprint';

describe('createPromptSiteBlueprint', () => {
  it('creates an editable quote-focused blueprint with local SEO', () => {
    const blueprint = createPromptSiteBlueprint({ businessName: 'Northstar Roofing', industry: 'home services', location: 'Cleveland', goal: 'quotes', services: ['Roof repair', 'Roof replacement'], differentiator: 'honest local expertise', hasTestimonials: true });

    expect(blueprint.primaryCta).toBe('Request a quote');
    expect(blueprint.pages).toHaveLength(4);
    expect(blueprint.pages[0]?.sections.some((section) => section.kind === 'faq')).toBe(true);
    expect(blueprint.seo.title).toContain('Cleveland');
    expect(blueprint.requiresPreview).toBe(true);
    expect(blueprint.reversible).toBe(true);
  });

  it('keeps product sites focused without an unnecessary contact section on home', () => {
    const blueprint = createPromptSiteBlueprint({ businessName: 'Field Supply', industry: 'retail', goal: 'purchases', services: ['Work gloves'], hasTestimonials: false });

    expect(blueprint.pages[0]?.sections.some((section) => section.kind === 'contact')).toBe(false);
  });
});
