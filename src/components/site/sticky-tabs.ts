/** One action of the phone quick-action bar. */
export type StickyAction = { label: string; href: string; ariaLabel: string };

export type StickyIconKind = "phone" | "quote" | "pin" | "message";

/**
 * The tab bar's slots, in reading order: secondary | primary | tertiary, with
 * the primary highlighted. A slot whose action is missing (no phone, no
 * address) is simply left out; the bar never shows an empty or dead slot.
 */
export function stickyTabSlots(input: { primary: StickyAction; secondary?: StickyAction | undefined; tertiary?: StickyAction | undefined }): Array<{ role: "primary" | "secondary" | "tertiary"; action: StickyAction; highlight: boolean }> {
  const usable = (action: StickyAction | undefined): action is StickyAction => Boolean(action && action.label.trim() && action.href.trim());
  const slots: Array<{ role: "primary" | "secondary" | "tertiary"; action: StickyAction; highlight: boolean }> = [];
  if (usable(input.secondary)) slots.push({ role: "secondary", action: input.secondary, highlight: false });
  if (usable(input.primary)) slots.push({ role: "primary", action: input.primary, highlight: true });
  if (usable(input.tertiary)) slots.push({ role: "tertiary", action: input.tertiary, highlight: false });
  return slots;
}

export function stickyIconFor(href: string, role: string): StickyIconKind {
  if (/^tel:/i.test(href)) return "phone";
  if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps|^https:\/\/maps\.(google|apple)\.com/i.test(href)) return "pin";
  return role === "primary" ? "quote" : "message";
}

