/**
 * Real business contact details for a client site.
 *
 * Every visitor-facing surface (contact section, booking form, booking
 * confirmation) reads the same phone and email off the client's own business
 * profile, so a booking never dead-ends without a way to reach the business.
 */
import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emailDisplay, emailLink, phoneDisplay, phoneLink } from "@/lib/builder/presentation";

export type ContactInfo = {
  phone?: string | null;
  email?: string | null;
};

/**
 * `tel:` target for a validated number. A value that isn't a usable phone
 * number returns `#`, and callers hide the button instead of showing it.
 */
export const telHref = (phone: string) => phoneLink(phone) ?? "#";

/**
 * Only a real address ever reaches a `mailto:` href, so a saved business
 * "email" can never smuggle another scheme or markup into a public page.
 */
export const mailHref = (email: string) => emailLink(email) ?? "#";

/** Local semantic theme for an AI-authored working widget. */
export function widgetPresentationStyle(presentation?: WidgetPresentation): React.CSSProperties {
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
  set("--muted-foreground", theme.muted ?? theme.text);
  set("--border", theme.border);
  set("--input", theme.border);
  set("--primary", theme.action);
  set("--primary-foreground", theme.actionText);
  set("--accent", theme.selected ?? theme.action);
  set("--accent-foreground", theme.selectedText ?? theme.actionText);
  return vars as React.CSSProperties;
}

/** Short "prefer to talk?" strip used above forms. */
export function DirectContact({
  profile,
  businessName,
  label = "Prefer to talk to a person?",
  presentation,
}: {
  profile: ContactInfo | null | undefined;
  businessName: string;
  label?: string;
  presentation?: WidgetPresentation;
}) {
  // Validated, formatted values only — an unusable number or a broken address
  // is treated as missing so a visitor never taps a dead link.
  const phone = phoneDisplay(profile?.phone);
  const phoneHref = phoneLink(profile?.phone);
  const email = emailDisplay(profile?.email);
  const emailHref = emailLink(profile?.email);
  if (!phoneHref && !emailHref) return null;

  return (
    <div className="rounded-lg border border-border bg-elevated/60 p-3" style={widgetPresentationStyle(presentation)}>
      <p className="text-[14px] text-muted-foreground">{presentation?.contactLabel ?? label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {phone && phoneHref ? (
          <Button asChild size="sm" variant="outline">
            <a href={phoneHref} aria-label={`Call ${businessName} at ${phone}`} className="flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
              <Phone className="size-3.5" aria-hidden="true" /> {phone}
            </a>
          </Button>
        ) : null}
        {email && emailHref ? (
          <Button asChild size="sm" variant="outline">
            <a href={emailHref} aria-label={`Email ${businessName} at ${email}`} className="flex min-w-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
              <Mail className="size-3.5" aria-hidden="true" /> {email}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
