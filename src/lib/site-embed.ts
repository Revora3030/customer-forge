/**
 * Embedded third-party tools on a customer website.
 *
 * A business often already uses a booking widget, a map or a video host, so the
 * builder can place that tool on a page. Nothing here accepts markup or script:
 * the only thing stored is a URL, and it is rendered in a sandboxed frame only
 * when its host is on the allowlist below. Anything else renders nothing, so a
 * builder edit or an AI action can never inject code into a visitor's browser.
 */

/** Hosts whose embed URLs may be framed, grouped for the plain-language label. */
export const EMBED_PROVIDERS: { label: string; hosts: string[] }[] = [
  { label: "Google Maps", hosts: ["google.com", "www.google.com", "maps.google.com"] },
  { label: "Google Forms", hosts: ["docs.google.com"] },
  { label: "Google Calendar", hosts: ["calendar.google.com"] },
  { label: "YouTube", hosts: ["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"] },
  { label: "Vimeo", hosts: ["player.vimeo.com"] },
  { label: "Calendly", hosts: ["calendly.com", "www.calendly.com"] },
  { label: "Cal.com", hosts: ["cal.com", "app.cal.com"] },
  { label: "Acuity Scheduling", hosts: ["app.acuityscheduling.com", "acuityscheduling.com"] },
  { label: "Square Appointments", hosts: ["squareup.com", "app.squareup.com", "book.squareup.com"] },
  { label: "TidyCal", hosts: ["tidycal.com"] },
  { label: "Setmore", hosts: ["booking.setmore.com"] },
  { label: "Housecall Pro", hosts: ["book.housecallpro.com"] },
  { label: "Jobber", hosts: ["clienthub.getjobber.com"] },
  { label: "OpenTable", hosts: ["www.opentable.com", "opentable.com"] },
  { label: "Spotify", hosts: ["open.spotify.com"] },
  { label: "Typeform", hosts: ["form.typeform.com"] },
  { label: "Tally", hosts: ["tally.so"] },
  { label: "Mailchimp", hosts: ["us1.list-manage.com", "mailchi.mp"] },
];

const ALLOWED_HOSTS = new Set(EMBED_PROVIDERS.flatMap((provider) => provider.hosts));

/** The provider's plain-language name, for the frame title and the editor. */
export function embedProviderLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return EMBED_PROVIDERS.find((provider) => provider.hosts.includes(host))?.label ?? null;
  } catch {
    return null;
  }
}

/**
 * The only URL shape that ever reaches an iframe: https, an allowlisted host,
 * no credentials, and no javascript:/data: trickery. Returns null otherwise.
 */
export function safeEmbedUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 600) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url.toString();
}

export type SiteEmbed = {
  url: string;
  title: string;
  /** Frame height in pixels, kept inside a sane range for phones and desktops. */
  height: number;
};

function embedHeight(value: unknown): number {
  const raw = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(raw)) return 460;
  return Math.min(1200, Math.max(200, Math.round(raw)));
}

/**
 * Reads the embed a section carries. The URL may be stored in the section's
 * settings (how the builder and the AI write it) or written in the section body
 * by a client pasting a share link. An unusable URL yields null, and the
 * renderer then shows nothing rather than a broken frame.
 */
export function readEmbed(section: { settings?: unknown; body?: string | null }): SiteEmbed | null {
  const settings =
    section.settings && typeof section.settings === "object"
      ? (section.settings as Record<string, unknown>)
      : {};
  const embed =
    settings["embed"] && typeof settings["embed"] === "object"
      ? (settings["embed"] as Record<string, unknown>)
      : settings;

  const bodyUrl = (section.body ?? "").trim().match(/https:\/\/\S+/)?.[0] ?? null;
  const url = safeEmbedUrl(embed["url"]) ?? safeEmbedUrl(embed["src"]) ?? safeEmbedUrl(bodyUrl);
  if (!url) return null;

  const rawTitle = typeof embed["title"] === "string" ? embed["title"].trim() : "";
  const provider = embedProviderLabel(url);
  const title = rawTitle || (provider ? `${provider} embed` : "Embedded tool");
  return { url, title, height: embedHeight(embed["height"]) };
}
