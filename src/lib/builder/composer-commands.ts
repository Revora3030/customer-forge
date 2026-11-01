/**
 * Pure logic for the builder chat composer: the "/" command menu, the "@"
 * scope chips, and the layout-only image-drop instruction. No React here, so
 * every rule is unit-tested. The UI lives in builder-chat/ComposerMenu.tsx.
 */

export type ComposerCommandId = "page" | "theme" | "seo" | "revert" | "lead-test";
export type ComposerMentionId = "pages" | "forms" | "brand";

export type ComposerItem =
  | {
      kind: "command";
      id: ComposerCommandId;
      label: string;
      hint: string;
      /** Text dropped into the box for the owner to finish. Absent for commands that run an action. */
      template?: string;
    }
  | { kind: "mention"; id: ComposerMentionId; label: string; hint: string };

export const COMPOSER_COMMANDS: ComposerItem[] = [
  { kind: "command", id: "page", label: "/page", hint: "Add or change a page", template: "Add a new page for " },
  { kind: "command", id: "theme", label: "/theme", hint: "Change colours, fonts or the look", template: "Change the look of the site: " },
  { kind: "command", id: "seo", label: "/seo", hint: "Improve titles, descriptions and local search wording", template: "Improve the SEO of this page: " },
  { kind: "command", id: "revert", label: "/revert", hint: "Open history to undo or restore" },
  { kind: "command", id: "lead-test", label: "/lead-test", hint: "Send a clearly labelled test lead to your own inbox" },
];

export const COMPOSER_MENTIONS: ComposerItem[] = [
  { kind: "mention", id: "pages", label: "@Pages", hint: "The pages of your site" },
  { kind: "mention", id: "forms", label: "@Forms", hint: "Your contact and quote forms" },
  { kind: "mention", id: "brand", label: "@Brand", hint: "Your name, logo, colours and tone" },
];

/** What an @ chip tells the planner. It narrows the request; it adds no facts. */
const MENTION_SCOPE: Record<ComposerMentionId, string> = {
  pages: "the site's pages",
  forms: "the site's forms (contact, quote and booking forms)",
  brand: "the brand (name, logo, colours, fonts and tone of voice)",
};

export type Trigger = { kind: "command" | "mention"; query: string; start: number; end: number };

/**
 * Finds an open trigger at the caret: "/" only at the very start of the box,
 * "@" at the start of a word. Returns null once a space ends the token.
 */
export function findTrigger(value: string, caret: number): Trigger | null {
  const upto = value.slice(0, caret);
  const slash = /^\/([a-z-]*)$/i.exec(upto);
  if (slash) return { kind: "command", query: slash[1]!.toLowerCase(), start: 0, end: caret };
  const at = /(^|\s)@([a-z]*)$/i.exec(upto);
  if (at) {
    const query = at[2]!.toLowerCase();
    return { kind: "mention", query, start: caret - query.length - 1, end: caret };
  }
  return null;
}

export function itemsFor(trigger: Trigger): ComposerItem[] {
  const pool = trigger.kind === "command" ? COMPOSER_COMMANDS : COMPOSER_MENTIONS;
  return pool.filter((item) => item.label.slice(1).toLowerCase().startsWith(trigger.query));
}

/** Replaces the trigger text with the item's insertion. Returns the new box text and caret. */
export function applyItem(value: string, trigger: Trigger, item: ComposerItem): { value: string; caret: number } {
  const before = value.slice(0, trigger.start);
  const after = value.slice(trigger.end);
  const space = after.startsWith(" ") ? "" : " ";
  const insert = item.kind === "mention" ? `${item.label}${space}` : (item.template ?? "");
  const next = `${before}${insert}${after}`;
  const skip = item.kind === "mention" && space === "" ? 1 : 0;
  return { value: next, caret: before.length + insert.length + skip };
}

/**
 * Turns "@Pages" style chips in a message into one plain scope line the
 * planner can follow. Unknown @words are left exactly as typed.
 */
export function expandMentions(text: string): string {
  const seen: ComposerMentionId[] = [];
  for (const match of text.matchAll(/(^|\s)@(pages|forms|brand)\b/gi)) {
    const id = match[2]!.toLowerCase() as ComposerMentionId;
    if (!seen.includes(id)) seen.push(id);
  }
  if (!seen.length) return text;
  return `[Scope: only touch ${seen.map((id) => MENTION_SCOPE[id]).join(" and ")}.] ${text}`;
}

/**
 * Put in the box when an image of a website is dropped. The owner can read and
 * edit it before sending, so nothing is hidden. It asks for structure only.
 */
export const LAYOUT_ONLY_INSTRUCTION =
  "Use the attached picture as a layout reference only: follow its section order, spacing and overall structure. Do not copy any of its words, logos, photos or brand names. Write every word from my business facts.";

/** Only still images count as a "picture of a site"; video and audio are not layout references. */
export function isLayoutImage(file: { type: string }): boolean {
  return /^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type);
}

/** Adds the layout-only instruction once, never over words the owner already typed. */
export function withLayoutInstruction(current: string): string {
  if (current.includes(LAYOUT_ONLY_INSTRUCTION)) return current;
  return current.trim() ? `${current.trim()}\n\n${LAYOUT_ONLY_INSTRUCTION}` : LAYOUT_ONLY_INSTRUCTION;
}
