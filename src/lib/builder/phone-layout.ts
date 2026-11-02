/**
 * Owner controls for how a page looks on a phone: hide a section on phones,
 * and move sections up or down on phones, without touching desktop or tablet.
 *
 * Nothing new is stored. A section's phone choices live in the same
 * `settings.style.mobile` layer the builder already uses (`hidden`, plus a
 * phone-only `order`), and `site-style.ts` publishes them as media-query CSS
 * that only applies at phone width. These helpers turn an owner's click into
 * the `settings` patches to save.
 *
 * Accessibility note (accepted for now): the phone reorder is done with CSS
 * `order` on a flex column (see `mobileOrderRules` in site-style.ts). CSS
 * `order` changes only what is painted. The keyboard Tab order and the screen
 * reader reading order still follow the DESKTOP order in the HTML. We accept
 * that for now because it keeps desktop, tablet and SEO markup untouched. If
 * phone order ever has to match for assistive tech, the sections would need to
 * be reordered in the markup itself.
 *
 * Lead capture guard: the enquiry / quote / booking section is the reason a
 * phone visitor becomes a lead, so a phone owner can neither hide it nor push
 * it further down than it sits on desktop. See `isLeadSection` and
 * `guardPhoneLayout`.
 */
import {
  MOBILE_ORDER_MAX,
  MOBILE_ORDER_REST,
  readBlockStyle,
  readDeviceLayer,
  writeBlockStyle,
} from "@/lib/site-style";

export type PhoneSectionInput = {
  id: string;
  /** Section type name, e.g. "contact". Used to recognise lead sections. */
  kind?: string | null;
  settings: unknown;
  /** Desktop position; used to place sections that have no phone position. */
  sort_order: number;
  is_visible?: boolean;
};

export type PhoneSectionState = {
  id: string;
  /** Hidden on phones (own choice, or inherited from a tablet-hidden section). */
  hiddenOnPhone: boolean;
  /** The owner gave this section a phone position. */
  hasPhoneOrder: boolean;
};

/** Section kinds that hold the lead form. Same set the quality gate's lead-capture check uses. */
export const LEAD_SECTION_KINDS: ReadonlySet<string> = new Set(["quote", "booking", "contact"]);
/** Working form widgets an AI-designed ("composition") section can carry. */
export const LEAD_WIDGETS: ReadonlySet<string> = new Set(["enquiry_form", "booking_form", "quote_calculator"]);

/** Why the controls are locked, shown as the tooltip on the disabled button. */
export const LEAD_HIDE_REASON = "Your enquiry form stays visible on phones so visitors can always contact you.";
export const LEAD_MOVE_REASON = "Your enquiry form can't be moved lower than it is on desktop, so visitors can always reach it.";

function hasLeadWidget(node: unknown, depth: number): boolean {
  if (depth > 40 || !node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((child) => hasLeadWidget(child, depth + 1));
  const record = node as Record<string, unknown>;
  if (record["type"] === "widget" && typeof record["text"] === "string" && LEAD_WIDGETS.has(record["text"])) return true;
  return Object.values(record).some((child) => hasLeadWidget(child, depth + 1));
}

/**
 * True for a section that takes enquiries: its kind is quote, booking or
 * contact, its stored role is one of those (an AI layout keeps the role), or
 * its AI layout places an enquiry, booking or quote widget.
 */
export function isLeadSection(section: { kind?: string | null; settings: unknown }): boolean {
  if (section.kind && LEAD_SECTION_KINDS.has(section.kind)) return true;
  const role = (section.settings as Record<string, unknown> | null)?.["role"];
  if (typeof role === "string" && LEAD_SECTION_KINDS.has(role)) return true;
  return hasLeadWidget(section.settings, 0);
}

export type SettingsPatch = { id: string; settings: Record<string, unknown> };

/** The phone's reading order: positioned sections first, the rest in desktop order. */
export function phoneOrder<T extends PhoneSectionInput>(sections: T[]): T[] {
  const desktop = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const position = (section: T) => readDeviceLayer(section.settings, "mobile").order ?? MOBILE_ORDER_REST;
  // Array.prototype.sort is stable, so ties keep desktop order.
  return desktop
    .map((section, index) => ({ section, index }))
    .sort((a, b) => position(a.section) - position(b.section) || a.index - b.index)
    .map((entry) => entry.section);
}

export function phoneState(section: PhoneSectionInput): PhoneSectionState {
  return {
    id: section.id,
    // A lead section is never hidden on phones, whatever is stored.
    hiddenOnPhone: !isLeadSection(section) && readBlockStyle(section.settings, "mobile").hidden === true,
    hasPhoneOrder: readDeviceLayer(section.settings, "mobile").order !== undefined,
  };
}

/** True when anything is customised for phones, so a reset has something to do. */
export function hasPhoneChanges(sections: PhoneSectionInput[]): boolean {
  return sections.some((section) => {
    const state = phoneState(section);
    return state.hasPhoneOrder || readDeviceLayer(section.settings, "mobile").hidden !== undefined;
  });
}

/** Hide or show one section on phones only. */
export function planPhoneHidden(section: PhoneSectionInput, hidden: boolean): SettingsPatch {
  // The lead section can't be hidden on phones: a "hide" request just keeps it shown.
  if (hidden && isLeadSection(section)) hidden = false;
  // A section the tablet layer hides is hidden on phones too, so showing it
  // again on phones needs an explicit `false` rather than clearing the layer.
  const tabletHidden = readDeviceLayer(section.settings, "tablet").hidden === true;
  const value = hidden ? true : tabletHidden ? false : null;
  return { id: section.id, settings: writeBlockStyle(section.settings, { hidden: value }, "mobile") };
}

/**
 * Move one section a step earlier or later on phones. Every section gets an
 * explicit phone position so the result is exactly what the owner sees, and
 * only the sections whose position changed are returned.
 */
export function planPhoneMove(
  sections: PhoneSectionInput[],
  id: string,
  direction: "up" | "down",
): SettingsPatch[] {
  const list = phoneOrder(sections);
  const from = list.findIndex((section) => section.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= list.length) return [];
  if (phoneMoveBlocked(sections, id, direction)) return [];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  const patches: SettingsPatch[] = [];
  next.forEach((section, index) => {
    const position = Math.min(index + 1, MOBILE_ORDER_MAX);
    if (readDeviceLayer(section.settings, "mobile").order === position) return;
    patches.push({ id: section.id, settings: writeBlockStyle(section.settings, { order: position }, "mobile") });
  });
  return patches;
}

/** Desktop reading order (by sort_order, ties by input order). */
function desktopOrder<T extends PhoneSectionInput>(sections: T[]): T[] {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => a.section.sort_order - b.section.sort_order || a.index - b.index)
    .map((entry) => entry.section);
}

/** Ids of lead sections that sit lower on phones than they do on desktop. */
function leadsPushedDown<T extends PhoneSectionInput>(sections: T[], phone: T[]): string[] {
  const desktop = desktopOrder(sections);
  return phone
    .filter((section) => isLeadSection(section))
    .filter((section) => phone.findIndex((s) => s.id === section.id) > desktop.findIndex((s) => s.id === section.id))
    .map((section) => section.id);
}

/**
 * The "out of reach" rule. A lead section may sit anywhere at or above its
 * desktop position on phones, but never lower than on desktop. Moving it down,
 * or moving another section from below it to above it, would push it lower, so
 * both are refused. (The footer is outside the page `<main>` that CSS `order`
 * works in, so nothing can ever be placed after it.) Returns the reason the
 * move is refused, or null when it is fine.
 */
export function phoneMoveBlocked(
  sections: PhoneSectionInput[],
  id: string,
  direction: "up" | "down",
): string | null {
  const list = phoneOrder(sections);
  const from = list.findIndex((section) => section.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= list.length) return null;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  const before = new Set(leadsPushedDown(sections, list));
  // Only a move that newly pushes a lead section down is refused, so an
  // already-low layout can still be improved.
  const worse = leadsPushedDown(sections, next).some((leadId) => {
    if (!before.has(leadId)) return true;
    return next.findIndex((s) => s.id === leadId) > list.findIndex((s) => s.id === leadId);
  });
  return worse ? LEAD_MOVE_REASON : null;
}

/**
 * Apply the lead guard to what is stored, so a hidden flag or a phone order
 * saved earlier, by the chat, or by hand, can never take lead capture away on
 * phones. Used when the page is rendered and when the panel lists sections.
 * - A lead section is never hidden on phones (a tablet-hidden lead section is
 *   explicitly shown again at phone width).
 * - If the saved phone order would put a lead section lower than on desktop,
 *   all saved phone positions on that page are ignored (desktop order shows).
 * Sections come back unchanged (same objects) when nothing needs fixing.
 */
export function guardPhoneLayout<T extends PhoneSectionInput>(sections: T[]): T[] {
  let changed = false;
  let out = sections.map((section) => {
    if (!isLeadSection(section)) return section;
    const mobileHidden = readDeviceLayer(section.settings, "mobile").hidden;
    const tabletHidden = readDeviceLayer(section.settings, "tablet").hidden === true;
    const needs = mobileHidden === true || (tabletHidden && mobileHidden !== false);
    if (!needs) return section;
    changed = true;
    const value = tabletHidden ? false : null;
    return { ...section, settings: writeBlockStyle(section.settings, { hidden: value }, "mobile") };
  });
  if (leadsPushedDown(out, phoneOrder(out)).length) {
    out = out.map((section) => {
      if (readDeviceLayer(section.settings, "mobile").order === undefined) return section;
      changed = true;
      return { ...section, settings: writeBlockStyle(section.settings, { order: null }, "mobile") };
    });
  }
  return changed ? out : sections;
}

/** Put phones back to following the desktop/tablet layout: no phone order, no phone hiding. */
export function planPhoneReset(sections: PhoneSectionInput[]): SettingsPatch[] {
  const patches: SettingsPatch[] = [];
  for (const section of sections) {
    const layer = readDeviceLayer(section.settings, "mobile");
    if (layer.order === undefined && layer.hidden === undefined) continue;
    patches.push({
      id: section.id,
      settings: writeBlockStyle(section.settings, { order: null, hidden: null }, "mobile"),
    });
  }
  return patches;
}
