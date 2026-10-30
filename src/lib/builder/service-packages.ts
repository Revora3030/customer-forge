/**
 * When a saved service has a name and no description, the card still needs
 * something true to say. These lines are the shape of the work for that kind
 * of business — not a price, not a review, and not a second service.
 */
import { archetypeFor, playbookFor } from "@/lib/builder/industry-playbook";

const SCOPE: Record<string, readonly string[]> = {
  plumbing: ["Find what is wrong", "Repair it without a mess", "Confirm it holds"],
  hvac: ["Diagnose the system", "Install or repair it cleanly", "Confirm the comfort"],
  electrical: ["Trace the fault", "Make the repair to code", "Test before leaving"],
  roofing: ["Inspect the roof", "Prepare the surface", "Finish it weather-tight"],
  landscaping: ["Walk the property", "Do the agreed work", "Leave the site clear"],
  cleaning: ["Agree the scope", "Clean through that scope", "Walk the result with you"],
  "exterior-cleaning": ["See the surface", "Clean it in place", "Rinse and review"],
  painting: ["Prepare the surface", "Apply the finish", "Review the edges"],
  contracting: ["Plan the work", "Build it in order", "Hand it over finished"],
  "home-services": ["Confirm the visit", "Do the agreed work", "Leave it ready to use"],
  "precision-craft": ["Measure the job", "Do the craft", "Check the finish"],
  "auto-detailing": ["See the vehicle", "Work through the agreed scope", "Review the finish with you"],
  "auto-repair": ["Diagnose the vehicle", "Do the agreed repair", "Confirm it is safe to drive"],
  "salons-barbers": ["Talk through the visit", "Perform the service", "Review the result with you"],
  "med-spa": ["Consultation first", "The agreed treatment", "Aftercare and timeline"],
  "medical-wellness": ["Consultation first", "The agreed treatment", "Aftercare you can follow"],
  dentist: ["Welcome and examination", "The agreed treatment", "Your next visit planned"],
  "gyms-fitness": ["Meet the coach", "Train the session", "Plan your next class"],
  "pressure-washing": ["See the surface", "Wash it at the right pressure", "Rinse and review"],
  "clinical-trust": ["Consultation first", "The agreed care", "Clear next steps"],
  restaurants: ["The offering", "How it is prepared", "How you order or book"],
  "hospitality-lifestyle": ["The welcome", "The experience", "How to reserve"],
  "professional-services": ["Understand the brief", "Do the agreed work", "Report what happened"],
  "law-firms": ["Confidential case review", "The agreed representation", "Clear next steps"],
  "real-estate": ["Understand your goals", "Market and show the home", "Guide you to closing"],
  "tech-growth": ["Understand the goal", "Do the agreed work", "Show what changed"],
  "photo-creative": ["Agree the brief", "Make the work", "Deliver the files"],
  education: ["See where you start", "The session itself", "What to practice next"],
  "emergency-dispatch": ["Call and describe it", "A technician is sent", "The job is finished on site"],
  general: ["What is included", "How the visit works", "What happens next"],
};

/** Three concrete lines for a service that was saved without a description. */
export function packageScope(industry: string | null | undefined, hints: string | null | undefined = null): readonly string[] {
  const key = playbookFor(industry)?.key ?? archetypeFor(industry, hints)?.key ?? "general";
  return SCOPE[key] ?? SCOPE["general"]!;
}

/** Scroll-chapter labels for this trade. Prompt and chrome copy only — never a price. */
export function chapterLabels(industry: string | null | undefined, hints: string | null | undefined = null): readonly string[] {
  const guide = playbookFor(industry);
  if (guide) return guide.storyArc;
  return archetypeFor(industry, hints)?.storyArc ?? ["The work", "How it happens", "Book"];
}
