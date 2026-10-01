/**
 * REVORA BUILDER — TOP-TIER DESIGN GUIDANCE
 *
 * Purpose:
 * - Provides the AI team with specific, actionable design guidance for
 *   producing 10/10 premium websites across every industry.
 * - Covers hero composition, section variety, conversion paths, mobile-first
 *   patterns, visual hierarchy, and industry-specific best practices.
 * - Inspired by top-tier site builders (Lovable, Framer, Webflow) while
 *   preserving REVORA's truth-first, no-invented-facts principle.
 *
 * This module is guidance only — the AI team remains the creative authority.
 * Every recommendation here is a prompt, not a rule.
 */

export type IndustryPattern = {
  industry: string;
  heroStyle: string;
  recommendedSections: string[];
  conversionFocus: string;
  trustSignals: string[];
  imagery: string;
  colorMood: string;
};

/** Industry-specific patterns for the AI team to draw from. */
export const INDUSTRY_PATTERNS: IndustryPattern[] = [
  {
    industry: "auto_detailing",
    heroStyle: "Full-bleed before/after or glossy vehicle hero with bold value proposition overlay",
    recommendedSections: ["hero", "services_grid", "process_steps", "before_after_gallery", "pricing", "testimonials", "booking_cta", "faq", "service_area"],
    conversionFocus: "Book now — instant booking widget above the fold",
    trustSignals: ["Certified technician badges", "Before/after photos", "Google review count", "Years in business"],
    imagery: "High-contrast vehicle photography, dramatic lighting, water droplets on paint, ceramic coating gloss shots",
    colorMood: "Deep blacks, chrome silvers, accent gold or electric blue",
  },
  {
    industry: "landscaping",
    heroStyle: "Lush green lawn or hardscape project with seasonal colour",
    recommendedSections: ["hero", "services_grid", "project_gallery", "seasonal_services", "process_steps", "free_quote_cta", "service_area", "testimonials"],
    conversionFocus: "Free quote — multi-step form with property details",
    trustSignals: ["Licensed & insured", "Project photos", "Before/after", "Years serving the area"],
    imagery: "Wide-angle property shots, seasonal transformations, hardscape detail close-ups",
    colorMood: "Natural greens, earth tones, warm wood accents",
  },
  {
    industry: "cleaning",
    heroStyle: "Sparkling clean space or team in action with satisfaction guarantee",
    recommendedSections: ["hero", "services_grid", "checklist", "pricing", "recurring_discount", "booking_cta", "reviews", "faq"],
    conversionFocus: "Book recurring service — frequency selector with discount",
    trustSignals: ["Bonded & insured", "Background-checked team", "Satisfaction guarantee", "Eco-friendly products"],
    imagery: "Clean, bright interiors, satisfying before/after, team in uniform",
    colorMood: "Fresh blues, clean whites, mint or teal accents",
  },
  {
    industry: "hvac",
    heroStyle: "Comfort-focused family scene or technician with modern equipment",
    recommendedSections: ["hero", "services_grid", "maintenance_plans", "emergency_cta", "financing", "certifications", "reviews", "service_area"],
    conversionFocus: "Call now for emergency service + schedule maintenance online",
    trustSignals: ["Licensed HVAC contractor", "NATE certified", "BBB rating", "24/7 emergency service"],
    imagery: "Clean technician portraits, modern equipment, comfort lifestyle shots",
    colorMood: "Trustworthy blues, warm orange for heating, cool blue for AC",
  },
  {
    industry: "plumbing",
    heroStyle: "Professional plumber or modern bathroom/kitchen with fast response promise",
    recommendedSections: ["hero", "services_grid", "emergency_cta", "process_steps", "flat_rate_pricing", "reviews", "service_area", "faq"],
    conversionFocus: "Call for emergency + book online for non-urgent",
    trustSignals: ["Licensed master plumber", "Upfront pricing", "24/7 availability", "Guaranteed workmanship"],
    imagery: "Clean work areas, modern fixtures, technician in uniform",
    colorMood: "Professional blues, clean whites, trust-building navy",
  },
  {
    industry: "roofing",
    heroStyle: "Drone-style roof or completed project with warranty promise",
    recommendedSections: ["hero", "services_grid", "project_gallery", "warranty_info", "financing", "emergency_cta", "reviews", "service_area"],
    conversionFocus: "Free inspection — book online or call",
    trustSignals: ["Licensed & insured", "Manufacturer certified", "Warranty", "Before/after photos"],
    imagery: "Aerial roof shots, material close-ups, weather resilience",
    colorMood: "Strong, protective tones — slate greys, brick reds, confident blues",
  },
  {
    industry: "hair_stylists",
    heroStyle: "Stunning transformation or salon atmosphere with booking widget",
    recommendedSections: ["hero", "service_menu", "gallery", "stylist_bios", "booking_cta", "reviews", "hours_location"],
    conversionFocus: "Book appointment — online scheduling with stylist selection",
    trustSignals: ["Years of experience", "Certifications", "Before/after gallery", "Client reviews"],
    imagery: "Hair transformation shots, salon atmosphere, stylist portraits",
    colorMood: "Glamorous, warm tones — rose gold, deep burgundy, cream",
  },
  {
    industry: "fitness",
    heroStyle: "Athletic transformation or class in action with trial offer",
    recommendedSections: ["hero", "class_schedule", "programs", "trainer_bios", "pricing", "free_trial_cta", "testimonials", "schedule"],
    conversionFocus: "Free trial — no commitment signup",
    trustSignals: ["Certified trainers", "Member transformations", "Class variety", "Flexible hours"],
    imagery: "Action shots, transformation photos, community atmosphere",
    colorMood: "Energetic — electric blue, neon green, bold black",
  },
];

/** Fallback pattern for industries not in the list. */
export const DEFAULT_PATTERN: IndustryPattern = {
  industry: "general",
  heroStyle: "Full-bleed hero with clear value proposition, supporting proof, and one primary CTA",
  recommendedSections: ["hero", "services", "about", "process", "testimonials", "contact", "faq"],
  conversionFocus: "Primary CTA — contact, book, or get a quote",
  trustSignals: ["Credentials", "Reviews", "Experience", "Service area"],
  imagery: "Professional photography relevant to the business",
  colorMood: "Professional — brand-appropriate palette",
};

/**
 * Returns the industry-specific design pattern, or the default if not found.
 */
export function patternForIndustry(industry: string | null): IndustryPattern {
  if (!industry) return DEFAULT_PATTERN;
  const normalized = industry.toLowerCase().replace(/[\s-]+/g, "_");
  return (
    INDUSTRY_PATTERNS.find(
      (p) => p.industry === normalized || normalized.includes(p.industry),
    ) ?? DEFAULT_PATTERN
  );
}

/**
 * Produces a design guidance prompt for the AI team based on the industry
 * and business facts. This is appended to the AI plan prompt to help the
 * models produce top-tier, industry-appropriate designs.
 */
export function designGuidancePrompt(industry: string | null, businessName: string): string {
  const pattern = patternForIndustry(industry);
  return [
    `TOP-TIER DESIGN GUIDANCE for ${businessName}:`,
    ``,
    `Hero: ${pattern.heroStyle}`,
    `Recommended sections: ${pattern.recommendedSections.join(", ")}`,
    `Conversion focus: ${pattern.conversionFocus}`,
    `Trust signals to include (only if verified): ${pattern.trustSignals.join(", ")}`,
    `Imagery direction: ${pattern.imagery}`,
    `Colour mood: ${pattern.colorMood}`,
    ``,
    `PREMIUM DESIGN PRINCIPLES:`,
    `- Mobile-first: every section must look perfect at 375px before desktop.`,
    `- Visual hierarchy: one clear focal point per section, leading the eye to the CTA.`,
    `- Section variety: alternate between full-width, split, grid, and card layouts to create rhythm.`,
    `- Whitespace: generous padding (64px+ on desktop, 32px+ on mobile) between sections.`,
    `- Typography: max 2 font families — one for headings, one for body. Use weight, not colour, for hierarchy.`,
    `- Colour: stick to the theme palette. Use accent colour sparingly for CTAs and key elements.`,
    `- Imagery: every section should have visual interest — photos, illustrations, or subtle background textures.`,
    `- CTAs: one primary CTA per page above the fold. Secondary CTAs throughout. Never more than 3 per page.`,
    `- Social proof: place testimonials or trust badges near conversion points, not buried at the bottom.`,
    `- Performance: hero image under 200KB, lazy-load below-fold images, no layout shift.`,
    ``,
    `Remember: use only verified business facts. Never invent reviews, awards, or credentials.`,
  ].join("\n");
}

/**
 * Produces a mobile-first design checklist for the AI team.
 */
export function mobileFirstChecklist(): string {
  return [
    "MOBILE-FIRST CHECKLIST (verify at 375px viewport):",
    "- [ ] Hero text is readable without zooming (16px+ body, 24px+ heading)",
    "- [ ] CTA button is at least 44px tall and full-width or centered",
    "- [ ] No horizontal scroll — all content fits within 375px",
    "- [ ] Navigation collapses to a hamburger menu",
    "- [ ] Images are properly cropped (object-fit: cover) not stretched",
    "- [ ] Forms have appropriately sized inputs (44px+ touch targets)",
    "- [ ] Text doesn't overlap with images or other elements",
    "- [ ] Section padding is reduced on mobile (32px vs 64px desktop)",
    "- [ ] Sticky header doesn't cover content when scrolling",
    "- [ ] Footer is readable and organised, not crammed",
  ].join("\n");
}
