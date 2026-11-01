/**
 * Owner controls for how a page looks on a phone: hide a section on phones,
 * and move sections up or down on phones, without touching desktop or tablet.
 *
 * Nothing new is stored. A section's phone choices live in the same
 * `settings.style.mobile` layer the builder already uses (`hidden`, plus a
 * phone-only `order`), and `site-style.ts` publishes them as media-query CSS
 * that only applies at phone width. These helpers turn an owner's click into
 * the `settings` patches to save.
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
    hiddenOnPhone: readBlockStyle(section.settings, "mobile").hidden === true,
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
