import type { CSSProperties } from "react";
import { emailLink, phoneLink } from "@/lib/builder/presentation";
import { readableOn } from "@/lib/readable-color";
import type { WidgetPresentation } from "@/lib/builder/composition-tree";

export const telHref = (phone: string) => phoneLink(phone) ?? "#";
export const mailHref = (email: string) => emailLink(email) ?? "#";

export function widgetPresentationStyle(presentation?: WidgetPresentation): CSSProperties {
  const theme = presentation?.theme;
  if (!theme) return {};
  const vars: Record<string, string> = {};
  const set = (name: string, value: string | undefined) => { if (value) vars[name] = value; };
  set("--background", theme.surface);
  set("--card", theme.surface);
  set("--elevated", theme.surface);
  set("--popover", theme.surface);
  set("--secondary", theme.surface);
  set("--muted", theme.surface);
  set("--foreground", theme.text);
  set("--card-foreground", theme.text);
  set("--popover-foreground", theme.text);
  set("--secondary-foreground", theme.text);
  // Helper, privacy and small print use the muted ink: whatever the AI chose,
  // it is pulled to AA (4.5:1) on the widget surface.
  const muted = theme.muted ?? theme.text;
  set("--muted-foreground", theme.surface && muted ? readableOn(muted, theme.surface) : muted);
  set("--border", theme.border);
  set("--input", theme.border);
  set("--primary", theme.action);
  set("--primary-foreground", theme.actionText);
  set("--accent", theme.selected ?? theme.action);
  set("--accent-foreground", theme.selectedText ?? theme.actionText);
  return vars as CSSProperties;
}
