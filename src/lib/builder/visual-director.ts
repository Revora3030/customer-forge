export type VisualIndustry = 'home_services' | 'professional_services' | 'health_wellness' | 'hospitality' | 'retail' | 'creative' | 'general';
export type VisualMood = 'bold' | 'warm' | 'calm' | 'refined' | 'editorial';

export type VisualDirectorInput = {
  industry: VisualIndustry;
  mood?: VisualMood;
  conversionGoal: 'calls' | 'quotes' | 'bookings' | 'consultations' | 'purchases';
  businessName: string;
  location?: string;
  hasRealPhotography: boolean;
};

export type VisualAssetBrief = {
  placement: 'hero' | 'proof' | 'service' | 'cta';
  aspectRatio: '16:9' | '4:5' | '1:1';
  purpose: string;
  altTextGuidance: string;
  canvaPrompt: string;
};

export type VisualDirection = {
  mood: VisualMood;
  typeStyle: string;
  composition: string;
  heroTreatment: string;
  mobileRule: string;
  accessibilityRule: string;
  performanceRule: string;
  assetBriefs: VisualAssetBrief[];
};

const defaults: Record<VisualIndustry, Omit<VisualDirection, 'assetBriefs' | 'mood'>> = {
  home_services: { typeStyle: 'Confident display headline with highly readable utility-focused body text.', composition: 'Lead with workmanship or completed-project proof, then move quickly to services and a quote CTA.', heroTreatment: 'Use a real project or skilled team image with a high-contrast content panel and visible quote action.', mobileRule: 'Keep the primary service promise and quote action above the first scroll; stack proof cards vertically.', accessibilityRule: 'Use high contrast over imagery and descriptive alt text that identifies the work shown.', performanceRule: 'Use one responsive hero image and avoid autoplay media above the fold.' },
  professional_services: { typeStyle: 'Refined serif or high-legibility sans headline paired with restrained supporting text.', composition: 'Use generous whitespace, a precise promise, authority cues, and consultation-focused content blocks.', heroTreatment: 'Use a calm, credible workspace or professional portrait; avoid generic corporate stock imagery.', mobileRule: 'Prioritize credibility, service clarity, and consultation CTA before detailed credentials.', accessibilityRule: 'Avoid low-contrast editorial text treatments and preserve a logical heading sequence.', performanceRule: 'Prefer compressed still imagery and remove decorative assets that do not establish trust.' },
  health_wellness: { typeStyle: 'Warm, calm headline treatment with spacious, highly readable body copy.', composition: 'Balance care, credibility, process clarity, and appointment confidence without overstating outcomes.', heroTreatment: 'Use welcoming, authentic care imagery with an uncluttered appointment CTA and reassuring support text.', mobileRule: 'Keep booking access persistent and make phone/contact actions easy to reach.', accessibilityRule: 'Do not use color alone for health information; maintain generous text contrast and readable sizing.', performanceRule: 'Use optimized photos and honor reduced-motion preferences for all calming effects.' },
  hospitality: { typeStyle: 'Inviting display type with concise, sensory supporting copy.', composition: 'Put the experience first, followed by atmosphere, proof, location details, and reservation intent.', heroTreatment: 'Use an authentic high-quality environment or product image with a direct booking or visit CTA.', mobileRule: 'Show location, hours, and booking path early without forcing large image downloads.', accessibilityRule: 'Ensure menu, hours, and reservation controls remain readable over visual backgrounds.', performanceRule: 'Serve responsive image crops and defer galleries until after the first contentful view.' },
  retail: { typeStyle: 'Clear, energetic display type with scannable product-led content.', composition: 'Feature the offer, product categories, social proof, and a low-friction purchase path.', heroTreatment: 'Use a strong product or lifestyle image with direct shopping language and clear price/value context.', mobileRule: 'Keep product CTA and essential purchase details visible without horizontal scrolling.', accessibilityRule: 'Provide descriptive product imagery and do not hide essential information in hover-only states.', performanceRule: 'Optimize product images and load secondary product media progressively.' },
  creative: { typeStyle: 'Expressive headline typography balanced by calm, legible body copy.', composition: 'Show distinctive work early, then connect style, process, proof, and enquiry intent.', heroTreatment: 'Use original portfolio work with minimal overlay copy and a clear project or enquiry CTA.', mobileRule: 'Preserve portfolio impact with intentional crops and avoid dense layered effects.', accessibilityRule: 'Keep artistic presentation readable, keyboard navigable, and understandable without imagery.', performanceRule: 'Use modern compressed formats and defer nonessential animation or portfolio grids.' },
  general: { typeStyle: 'Modern, high-legibility headline and body typography with a clear visual scale.', composition: 'Start with the customer outcome, then establish trust, offer detail, and one primary action.', heroTreatment: 'Use authentic business imagery or a focused abstract visual with a visible CTA and readable contrast.', mobileRule: 'Make the core value proposition and next step understandable within the first mobile viewport.', accessibilityRule: 'Use semantic structure, contrast-safe overlays, and descriptive controls.', performanceRule: 'Favor responsive imagery, minimal scripts, and reduced-motion-safe visual effects.' },
};

const goalCopy: Record<VisualDirectorInput['conversionGoal'], string> = {
  calls: 'Invite visitors to call for a fast, confident next step.',
  quotes: 'Make requesting a tailored quote feel quick and low-friction.',
  bookings: 'Show availability and make booking the obvious next action.',
  consultations: 'Build authority first, then invite a focused consultation.',
  purchases: 'Clarify product value and move visitors directly into a confident purchase path.',
};

export function createVisualDirection(input: VisualDirectorInput): VisualDirection {
  const mood = input.mood ?? (input.industry === 'health_wellness' ? 'calm' : input.industry === 'creative' ? 'editorial' : 'refined');
  const base = defaults[input.industry];
  const location = input.location ? ` in ${input.location}` : '';
  const imageSource = input.hasRealPhotography ? 'authentic business photography' : 'a high-quality, non-generic visual direction pending approved photography';

  return {
    mood,
    ...base,
    assetBriefs: [
      { placement: 'hero', aspectRatio: '16:9', purpose: `${input.businessName}${location}: establish the offer and support the primary action. ${goalCopy[input.conversionGoal]}`, altTextGuidance: 'Describe the real people, service, product, or setting shown; do not use decorative filenames.', canvaPrompt: `Create a ${mood} 16:9 hero composition for ${input.businessName}${location}, using ${imageSource}. Leave calm negative space for a readable headline and CTA; avoid embedded text and misleading claims.` },
      { placement: 'proof', aspectRatio: '4:5', purpose: 'Make trust tangible through people, process, completed work, or credible environment details.', altTextGuidance: 'Explain the proof shown and why it is relevant to the customer decision.', canvaPrompt: `Create a premium 4:5 proof visual for ${input.businessName}. Emphasize authentic detail, credible craft, and natural light; no logos or text baked into the image.` },
      { placement: 'service', aspectRatio: '1:1', purpose: 'Support service cards with a consistent, scannable visual language.', altTextGuidance: 'Name the specific service or result represented by this image.', canvaPrompt: `Create a consistent square service visual for ${input.businessName} in a ${mood} style. Keep the focal point centered and leave room for responsive cropping; no embedded text.` },
    ],
  };
}
