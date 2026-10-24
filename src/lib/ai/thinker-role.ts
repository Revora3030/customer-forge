/** Which Lovable AI role a builder thinking step runs on. Pure module. */
import type { CollectivePurpose } from "@/lib/ai/collective";

export type HallOfFameRole = "primary" | "design" | "fast" | "coding" | "vision";

/**
 * Purpose routing is exhaustive by design. Adding a new CollectivePurpose
 * requires choosing a role here instead of silently falling into primary and
 * leaving a specialist roster unused.
 */
const PURPOSE_ROLE: Record<CollectivePurpose, HallOfFameRole> = {
  creative_direction: "design",
  information_architecture: "primary",
  conversion_architecture: "primary",
  content_strategy: "primary",
  content_strategy_targeted_revision: "primary",
  visual_review: "vision",
  repair_priority: "primary",
  quality_review: "primary",
  adversarial_review: "primary",
  synthesis: "primary",
  hard_request: "primary",
  second_opinion: "primary",
  page_planning: "design",
  seo_analysis: "primary",
  design_alternative: "design",
  specialist_review: "primary",
  repair_plan: "coding",
  plan_review: "primary",
  funnel_verification: "primary",
  site_consistency_audit: "vision",
  industry_gap_analysis: "primary",
  final_review: "primary",
  whole_site_review: "vision",
  markup_review: "coding",
  deep_conversion_audit: "primary",
  intent: "fast",
  extraction: "fast",
  classification: "fast",
  rewrite: "fast",
  small_edit: "fast",
  metadata: "fast",
  schema_markup: "fast",
  completeness_check: "fast",
  mobile_responsiveness_audit: "vision",
  performance_audit: "coding",
  conversion_friction_audit: "vision",
  accessibility_audit: "coding",
  content_quality_review: "primary",
};

export function roleForPurpose(purpose: CollectivePurpose): HallOfFameRole {
  return PURPOSE_ROLE[purpose];
}
