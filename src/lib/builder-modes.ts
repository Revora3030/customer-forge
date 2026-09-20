/**
 * Builder information architecture.
 *
 * One place that names the five builder modes and the high-value quick actions
 * shown in the AI workspace. Quick actions are plain-language instructions that
 * go through the existing site-agent pipeline (plan → approve → apply → verify),
 * so nothing here duplicates builder logic.
 */

export type BuilderModeKey = "build" | "design" | "pages" | "ai" | "launch";

export const BUILDER_MODES: { key: BuilderModeKey; label: string; hint: string }[] = [
  { key: "build", label: "Build", hint: "Ask, preview, edit anything" },
  { key: "design", label: "Design", hint: "Brand, layout and style" },
  { key: "pages", label: "Pages", hint: "Pages and sections" },
  { key: "ai", label: "AI", hint: "Requests, photos, voice" },
  { key: "launch", label: "Launch", hint: "Checks and going live" },
];

/** Older builder destinations keep working and land in the right mode. */
const MODE_ALIAS: Record<string, BuilderModeKey> = {
  overview: "build",
  canvas: "build",
  content: "build",
  build: "build",
  structure: "pages",
  pages: "pages",
  sections: "pages",
  design: "design",
  media: "design",
  effects: "design",
  ai: "ai",
  assistant: "ai",
  growth: "ai",
  audit: "ai",
  upgrades: "ai",
  launch: "launch",
  publish: "launch",
};

export function normalizeBuilderMode(key: string | undefined): BuilderModeKey {
  if (!key) return "build";
  return MODE_ALIAS[key] ?? "build";
}

export type BuilderQuickAction = { label: string; instruction: string };

/**
 * The seven outcomes a first-time owner actually wants, shown up front in the
 * request box. Each one is a real instruction for the same plan → approve →
 * apply pipeline; nothing here is decorative, and "Publish my site" routes
 * through the existing launch checks rather than bypassing them.
 */
export const BUILDER_PRIMARY_ACTIONS: BuilderQuickAction[] = [
  {
    label: "Improve my website",
    instruction:
      "Improve my whole website: clearer wording, tidier layout, consistent spacing and a stronger first screen. Keep all of my real business details exactly as they are.",
  },
  {
    label: "Get more leads",
    instruction:
      "Make it easier for customers to contact me: a clear call and quote button on every page, a short form high on the home page, and wording that says what happens next.",
  },
  {
    label: "Build a page",
    instruction:
      "Add the page my website is missing most, fill it with real sections, wording and a clear button, and link it from the menu.",
  },
  {
    label: "Make it look better",
    instruction:
      "Make my website look more premium: generous spacing, refined typography, calmer colours and larger imagery, without changing any of my real details.",
  },
  {
    label: "Improve Google search",
    instruction:
      "Improve how my website shows up in Google: a clear title and description for every page, headings that match what customers search for, and links between related pages.",
  },
  {
    label: "Fix problems",
    instruction:
      "Find and fix problems on my website: anything cut off or overlapping on a phone, missing buttons or links, empty sections, and text that is hard to read.",
  },
  {
    label: "Publish my site",
    instruction:
      "Run the final checks on my website, fix anything that would block going live, and tell me exactly what is left before I publish.",
  },
];

/**
 * Everyday requests in the owner's words. Each one is a real instruction the
 * assistant plans and executes — never a decorative button.
 */
export const BUILDER_QUICK_ACTIONS: BuilderQuickAction[] = [
  {
    label: "Improve design",
    instruction:
      "Improve the overall look of my website: consistent spacing, clearer headings, a tidy layout and a colour and button style that suits my industry. Keep all my real business details exactly as they are.",
  },
  {
    label: "Rewrite copy",
    instruction:
      "Rewrite the wording across my pages so it is shorter, clearer and easier to read, leading with what I actually do and where I work. Do not invent claims, prices, awards or reviews.",
  },
  {
    label: "Add a page",
    instruction:
      "Add the page my website is missing most, fill it with real sections, wording and a clear button, and link it from the menu.",
  },
  {
    label: "Improve search results",
    instruction:
      "Improve how my website shows up in search: a clear page title and description for every page, headings that match what customers search for, and internal links between related pages.",
  },
  {
    label: "Fix mobile",
    instruction:
      "Fix how my website looks on a phone: nothing cut off or overlapping, readable text sizes, tappable buttons, a working menu and comfortable spacing between sections.",
  },
  {
    label: "Get more enquiries",
    instruction:
      "Make it easier for customers to contact me: a clear call button and quote button visible on every page, a short form high on the home page, and wording that tells people exactly what happens next.",
  },
  {
    label: "Make it easy to book",
    instruction:
      "Add a booking section that uses my real services and availability, put a booking button in the menu and hero, and explain what happens after someone books.",
  },
  {
    label: "Add a gallery",
    instruction:
      "Add a photo gallery using the photos already in my workspace with a short introduction, and link it from the menu.",
  },
  {
    label: "Show my reviews",
    instruction:
      "Add a reviews section high on the home page using only the reviews already in my workspace.",
  },
  {
    label: "Answer common questions",
    instruction:
      "Add a questions and answers section covering the things my customers ask most about my services, area, pricing approach and timings, using only facts already in my workspace.",
  },
  {
    label: "Make it feel premium",
    instruction:
      "Make my website feel more premium: generous spacing, refined typography, calmer colours, larger imagery and a confident hero — without changing any of my real details.",
  },
  {
    label: "Make it less cluttered",
    instruction:
      "Simplify my website: fewer competing messages per section, shorter paragraphs, one clear action per section and a cleaner menu.",
  },
  {
    label: "Make it more professional",
    instruction:
      "Make my website read and look more professional and trustworthy: consistent tone, clear service explanations, visible contact details and a tidy, balanced layout.",
  },
  {
    label: "Make it bolder",
    instruction:
      "Give my website a bolder feel: stronger headline sizes, higher contrast buttons and more decisive section backgrounds, while keeping it readable.",
  },
  {
    label: "Put the important things first",
    instruction:
      "Reorder my home page so the most persuasive content comes first: what I do, why customers trust me, then services, then everything else.",
  },
];
