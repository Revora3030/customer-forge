/**
 * Point-and-click edit actions per element type (spec E/F).
 *
 * When the owner clicks a block in the preview, the chat offers the edits that
 * make sense for THAT kind of element instead of one generic list. Every
 * prompt is a request to the normal builder pipeline (restore point first,
 * fact gate, nothing published), and none of them asks the AI to invent
 * reviews, prices, credentials or other facts.
 */

export type ElementAction = { label: string; prompt: string };

export type ElementFamily =
  | "heading"
  | "text"
  | "button"
  | "image"
  | "gallery"
  | "form"
  | "navigation"
  | "footer"
  | "testimonial"
  | "pricing"
  | "faq"
  | "hero"
  | "section";

const FAMILY_PATTERNS: [ElementFamily, RegExp][] = [
  ["hero", /(^|[^a-z])hero([^a-z]|$)|banner/],
  ["navigation", /(^|[^a-z])nav|menu|header([^a-z]|$)/],
  ["footer", /footer/],
  ["form", /form|quote|booking|contact[_-]?form|calculator/],
  ["testimonial", /testimonial|review|quote[_-]?card/],
  ["pricing", /pricing|price|plan|package/],
  ["faq", /(^|[^a-z])faq|question/],
  ["gallery", /gallery|portfolio|grid[_-]?images|work/],
  ["image", /image|photo|picture|media|logo/],
  ["button", /button|cta|link/],
  ["heading", /heading|title|headline|^h[1-6]$/],
  ["text", /text|paragraph|body|copy|rich/],
];

/** Classifies a clicked element by its section/component kind. */
export function elementFamily(kind: string | null | undefined): ElementFamily {
  // Kinds use snake_case ("hero_split"), so word boundaries are matched on
  // any non-letter, not \b (which treats "_" as a word character).
  const key = String(kind ?? "").toLowerCase();
  for (const [family, pattern] of FAMILY_PATTERNS) if (pattern.test(key)) return family;
  return "section";
}

const ACTIONS: Record<ElementFamily, ElementAction[]> = {
  hero: [
    { label: "Stronger headline", prompt: "Rewrite the headline on this hero so it states what we do and where, clearly and without hype." },
    { label: "Replace image", prompt: "Replace the image on this hero with a better-fitting one for this business." },
    { label: "Clearer call to action", prompt: "Make the call-to-action buttons on this hero clearer and point them at the most useful page." },
    { label: "New layout", prompt: "Try a different layout for this hero that keeps the same wording." },
  ],
  heading: [
    { label: "Rewrite", prompt: "Rewrite this heading to be clearer and more specific to this business." },
    { label: "Shorter", prompt: "Make this heading shorter while keeping its meaning." },
    { label: "Bigger", prompt: "Make this heading more prominent." },
  ],
  text: [
    { label: "Rewrite", prompt: "Rewrite this text to be clearer and easier to scan, using only facts already on the site." },
    { label: "Shorter", prompt: "Make this text shorter and more concise." },
    { label: "Add bullets", prompt: "Turn this text into short bullet points." },
  ],
  button: [
    { label: "Better label", prompt: "Give this button a clearer, action-focused label." },
    { label: "Fix the link", prompt: "Make sure this button links to the right page of this site." },
    { label: "Make it stand out", prompt: "Make this button more visible without clashing with the brand colors." },
  ],
  image: [
    { label: "Replace image", prompt: "Replace this image with a better-fitting one for this business." },
    { label: "Better alt text", prompt: "Write accurate, descriptive alt text for this image." },
    { label: "Crop / focus", prompt: "Adjust how this image is framed so the subject is clearly visible on mobile and desktop." },
  ],
  gallery: [
    { label: "Reorder", prompt: "Reorder the pictures in this gallery so the strongest work comes first." },
    { label: "New layout", prompt: "Try a different layout for this gallery." },
    { label: "Alt text", prompt: "Write accurate alt text for every picture in this gallery." },
  ],
  form: [
    { label: "Fewer fields", prompt: "Simplify this form to only the fields needed to follow up with a lead." },
    { label: "Clearer labels", prompt: "Make this form's labels and button text clearer." },
    { label: "Check it works", prompt: "Check that this form submits to my lead inbox and shows a clear confirmation." },
  ],
  navigation: [
    { label: "Simplify menu", prompt: "Simplify this menu to the most important pages." },
    { label: "Add call button", prompt: "Add a clear call or quote button to the menu using my real phone number or quote page." },
    { label: "Fix links", prompt: "Make sure every link in this menu goes to a real page of this site." },
  ],
  footer: [
    { label: "Tidy footer", prompt: "Tidy this footer: contact details, service area and key links only." },
    { label: "Fix links", prompt: "Make sure every link in this footer goes to a real page of this site." },
  ],
  testimonial: [
    { label: "Use real reviews only", prompt: "Make sure this section only shows real reviews I have provided. Remove anything that isn't a real review." },
    { label: "New layout", prompt: "Try a different layout for this reviews section." },
  ],
  pricing: [
    { label: "Use my real prices", prompt: "Make sure this section only shows prices from my services list. Remove any price I haven't provided." },
    { label: "Clearer comparison", prompt: "Make this pricing easier to compare at a glance." },
  ],
  faq: [
    { label: "Answer clearly", prompt: "Make these answers clearer and shorter, using only facts already on the site." },
    { label: "Reorder", prompt: "Put the most common questions first." },
  ],
  section: [
    { label: "Rewrite copy", prompt: "Rewrite the copy on this block to be clearer and more compelling." },
    { label: "Replace image", prompt: "Replace the image on this block with a better-fitting one." },
    { label: "New layout", prompt: "Change the layout of this block to something more visually interesting." },
    { label: "Shorter", prompt: "Make this block shorter and more concise." },
  ],
};

/** The quick edit actions offered for a clicked element. */
export function actionsForElement(kind: string | null | undefined): ElementAction[] {
  return ACTIONS[elementFamily(kind)];
}
