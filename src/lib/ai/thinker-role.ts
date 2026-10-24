/** Which Lovable AI role a builder thinking step runs on. Pure module. */
import type { CollectivePurpose } from "@/lib/ai/collective";

export type HallOfFameRole = "primary" | "design" | "fast" | "coding" | "vision";

/**
 * Which role a thinking purpose recruits from.
 *
 * Keep implementation work on the coding roster and visual inspection on the
 * vision roster. A purpose omitted here safely falls back to primary reasoning;
 * adding a new purpose should trigger an explicit routing decision in tests.
 */
export function roleForPurpose(purpose: CollectivePurpose): HallOfFameRole {
  switch (purpose) {
    case "visual_review":
    case "whole_site_review":
    case "site_consistency_audit":
    case "mobile_responsiveness_audit":
      return "vision";
    case "creative_direction":
    case "design_alternative":
      return "design";
    case "repair_plan":
    case "markup_review":
    case "accessibility_audit":
    case "performance_audit":
      return "coding";
    case "intent":
    case "extraction":
    case "classification":
    case "rewrite":
    case "small_edit":
    case "metadata":
    case "schema_markup":
    case "completeness_check":
      return "fast";
    default:
      return "primary";
  }
}
