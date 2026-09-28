/**
 * Industry playbook — industry-specific content and structure guidance.
 */

export type IndustryPlaybook = {
  industry: string;
  defaultSections: string[];
  recommendedPages: string[];
  trustSignals: string[];
  ctaLabels: string[];
  photoSuggestions: string[];
};

const PLAYBOOKS: Record<string, IndustryPlaybook> = {
  automotive: {
    industry: "automotive",
    defaultSections: ["hero", "services", "gallery", "about", "testimonials", "contact"],
    recommendedPages: ["Home", "Services", "Gallery", "About", "Contact"],
    trustSignals: ["years in business", "certified technicians", "warranty"],
    ctaLabels: ["Book Now", "Get a Quote", "Schedule Service"],
    photoSuggestions: ["vehicle detailing", "garage interior", "team at work", "before/after"],
  },
  dental: {
    industry: "dental",
    defaultSections: ["hero", "services", "about", "testimonials", "contact"],
    recommendedPages: ["Home", "Services", "About", "Patients", "Contact"],
    trustSignals: ["board certified", "years of experience", "patient reviews"],
    ctaLabels: ["Book Appointment", "Request Consultation", "Call Now"],
    photoSuggestions: ["clinic interior", "team", "patient smile", "technology"],
  },
  default: {
    industry: "default",
    defaultSections: ["hero", "services", "about", "testimonials", "contact"],
    recommendedPages: ["Home", "Services", "About", "Contact"],
    trustSignals: ["years in business", "customer reviews", "licensed"],
    ctaLabels: ["Get Started", "Contact Us", "Learn More"],
    photoSuggestions: ["team", "workspace", "work samples", "location"],
  },
};

export function playbookFor(industry: string): IndustryPlaybook {
  const normalized = industry.toLowerCase();
  for (const [key, playbook] of Object.entries(PLAYBOOKS)) {
    if (normalized.includes(key) || key.includes(normalized)) return playbook;
  }
  return PLAYBOOKS["default"]!;
}
