/**
 * The AI team as shown on the public homepage. Browser-safe and deliberately
 * plain: what each part of the team is used for, and which models lead it. The
 * routing is chosen per task with automatic failover and can change, so the page
 * says "leads" and never promises a model for a given request. Every id is
 * checked against the roster and image configuration by a test.
 */
import { modelDisplayName } from "@/lib/ai/lovable-models";

export type TeamRole = {
  id: string;
  role: string;
  job: string;
  /** Model ids, strongest first. */
  models: readonly string[];
};

export const AI_TEAM_ROLES: readonly TeamRole[] = [
  {
    id: "direction",
    role: "Creative direction and layout",
    job: "Designs the look, the page structure and each section's layout from your business details.",
    models: ["openai/gpt-6.1-sol"],
  },
  {
    id: "copy",
    role: "Copywriting",
    job: "Writes headlines and service copy using only the facts you supply.",
    models: ["anthropic/claude-sonnet-5"],
  },
  {
    id: "images",
    role: "Photography",
    job: "Creates starter pictures where you have none. Your own photos are used where you supply them.",
    models: ["openai/gpt-image-2.5-sunburst", "openai/gpt-image-2.5-flare"],
  },
  {
    id: "review",
    role: "Independent review",
    job: "Checks claims, structure, accessibility and phone layout, and reads the whole site as one, before you publish.",
    models: ["openai/gpt-5.6-terra", "anthropic/claude-opus-5-5", "anthropic/claude-fable-5-1", "google/gemini-3.8-flash"],
  },
  {
    id: "metadata",
    role: "Search metadata",
    job: "Prepares page titles, descriptions and structured data for local search.",
    models: ["openai/gpt-5.6-luna", "openai/gpt-5.4-mini"],
  },
  {
    id: "intake",
    role: "Intake and checks",
    job: "Reviews the plan against your goals and checks that every way to contact you works.",
    models: ["openai/gpt-6-astra"],
  },
];

const IMAGE_NAMES: Record<string, string> = {
  "openai/gpt-image-2.5-sunburst": "GPT Image 2.5 Sunburst",
  "openai/gpt-image-2.5-flare": "GPT Image 2.5 Flare",
};

/** "openai/gpt-6.1-sol" -> "GPT 6.1 Sol"; picture models use their own names. */
export function teamModelName(id: string): string {
  return IMAGE_NAMES[id] ?? modelDisplayName(id);
}
