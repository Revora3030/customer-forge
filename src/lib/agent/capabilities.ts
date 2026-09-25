/**
 * REVORA AGENT CAPABILITY REGISTRY.
 *
 * The agent is general purpose: the owner describes an outcome and the agent
 * works out the method. This registry is the honest map of what "the method"
 * can actually be inside a Revora workspace — every capability here is wired to
 * something the platform really does, so the planner is never told it can do
 * something the executor cannot.
 *
 * Pure data + pure helpers: no model, no database, no side effects.
 */

export type CapabilityId =
  | "pages"
  | "sections"
  | "copy"
  | "design"
  | "motion"
  | "seo"
  | "images"
  | "cta"
  | "capture"
  | "commerce"
  | "portal"
  | "analytics";

export type Capability = {
  id: CapabilityId;
  /** How the owner would describe this area. */
  label: string;
  /** What the agent is allowed to do here, handed to the planner verbatim. */
  guidance: string;
  /**
   * Set when the work lands outside the website content tree. The agent still
   * plans the website side, and reports where the rest is configured, instead
   * of pretending an action exists for it.
   */
  handoff?: { where: string; route: string };
};

export const CAPABILITIES: Capability[] = [
  {
    id: "pages",
    label: "pages and navigation",
    guidance:
      "Create, retitle, re-address, hide or de-index whole pages, and keep the menu order in the sequence a buyer decides in.",
  },
  {
    id: "sections",
    label: "page structure",
    guidance:
      "Add, remove, hide, restyle and reorder sections so each page has a deliberate top-to-bottom argument: promise, proof, detail, objection, next step.",
  },
  {
    id: "copy",
    label: "words",
    guidance:
      "Rewrite headlines, sub-headlines, body text and item text in plain, specific, benefit-first language, using only facts already in the workspace.",
  },
  {
    id: "design",
    label: "look and feel",
    guidance:
      "Change brand colours, accent colour, font preference, composition trees and direct section/component styles. Judge this yourself from the request's feeling words — never ask the owner to name a colour or a font.",
  },
  {
    id: "motion",
    label: "depth and motion",
    guidance:
      "Set a site backdrop and per-section depth effects when the request implies premium, modern, animated or three-dimensional. Keep it restrained: at most a couple of section effects per page so the site stays fast.",
  },
  {
    id: "seo",
    label: "search visibility",
    guidance:
      "Write a unique search title and description per page, keep the right pages indexable, and use the words real customers search for. Add service or location pages when the request implies more search coverage.",
  },
  {
    id: "images",
    label: "photos",
    guidance:
      "Place the workspace's existing photos where they support the claim being made. Never invent imagery that is not in the workspace.",
    handoff: { where: "Image Studio", route: "/app/website" },
  },
  {
    id: "cta",
    label: "buttons and enquiries",
    guidance:
      "Make one primary action unmissable on every page — call, book, or get a price — repeat it at the end of the page, and make button labels state the outcome.",
  },
  {
    id: "capture",
    label: "forms, quotes and booking",
    guidance:
      "Place the capture the request needs (contact, quote, booking) as real sections with the right buttons, so enquiries land somewhere the owner can act on.",
    handoff: { where: "Quotes and Booking setup", route: "/app/quotes" },
  },
  {
    id: "commerce",
    label: "payments and plans",
    guidance:
      "Present prices and plans only from figures already stored in the workspace. Payment collection itself is configured outside the website content.",
    handoff: { where: "Billing", route: "/app/billing" },
  },
  {
    id: "portal",
    label: "customer portal",
    guidance:
      "Link customers to the workspace's existing portal and account areas instead of inventing a second login.",
    handoff: { where: "Portal access", route: "/app/settings" },
  },
  {
    id: "analytics",
    label: "measurement",
    guidance:
      "Make the measurable action obvious on the page. Reporting itself lives in the workspace's analytics.",
    handoff: { where: "Analytics", route: "/app/analytics" },
  },
];

const BY_ID = new Map(CAPABILITIES.map((capability) => [capability.id, capability]));

export const isCapabilityId = (value: unknown): value is CapabilityId =>
  typeof value === "string" && BY_ID.has(value as CapabilityId);

export const capabilityOf = (id: CapabilityId) => BY_ID.get(id)!;

/** The capabilities every request gets, because almost every ask touches them. */
export const BASELINE_CAPABILITIES: CapabilityId[] = ["copy", "cta"];

/**
 * Renders the guidance for a set of capabilities, plus the honest handoff notes
 * for the parts that are configured outside the website content tree.
 */
export function capabilityBrief(ids: CapabilityId[]): { guidance: string[]; handoffs: string[] } {
  const unique = [...new Set(ids.filter(isCapabilityId))];
  const chosen = (unique.length ? unique : BASELINE_CAPABILITIES).map(capabilityOf);
  return {
    guidance: chosen.map((capability) => `${capability.label}: ${capability.guidance}`),
    handoffs: chosen
      .filter((capability) => capability.handoff)
      .map(
        (capability) =>
          `${capability.label} is finished off in ${capability.handoff!.where} (${capability.handoff!.route}) — plan the website side here and say so.`,
      ),
  };
}
