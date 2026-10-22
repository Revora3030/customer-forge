/** Which Lovable AI role a builder thinking step runs on. Pure module. */
import type { CollectivePurpose } from "@/lib/ai/collective";

export type HallOfFameRole = "primary" | "design" | "fast" | "coding" | "vision";

/**
 * Which pool a purpose recruits from. Heavy authoring and reasoning work
 * recruits from the primary pool, visual judgement from the vision pool, and
 * short high-volume work from the fast pool.
 */
export function roleForPurpose(purpose: CollectivePurpose): HallOfFameRole {
  switch (purpose) {
    case "visual_review":
      return "vision";
    case "creative_direction":
    case "design_alternative":
      return "design";
    case "intent":
    case "extraction":
    case "classification":
    case "rewrite":
    case "small_edit":
    case "metadata":
      return "fast";
    default:
      return "primary";
  }
}
