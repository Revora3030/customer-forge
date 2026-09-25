/** Shared launch-readiness scoring for a client workspace. */

export type ReadinessInput = {
  profile:
    | {
        tagline?: string | null;
        description?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
        service_area?: string | null;
        logo_url?: string | null;
        hero_image_url?: string | null;
        primary_color?: string | null;
        hours?: unknown;
      }
    | null
    | undefined;
  settings:
    | {
        template?: string | null;
        seo?: unknown;
        custom_domain?: string | null;

        domain_status?: string | null;
        publish_state?: string | null;
        published?: boolean | null;
      }
    | null
    | undefined;
  servicesCount: number;
  bookableCount: number;
  mediaCount: number;
  quoteFormCount: number;
  analyticsCount: number;
};

export type ReadinessItem = {
  key: string;
  label: string;
  done: boolean;
  optional?: boolean;
  fix: string;
  to?: string;
};

const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;

export function readiness(input: ReadinessInput) {
  const p = input.profile;
  const s = input.settings;
  const seo = (s?.seo && typeof s.seo === "object" ? (s.seo as Record<string, unknown>) : {}) ?? {};
  const hours = p?.hours && typeof p.hours === "object" ? Object.keys(p.hours).length > 0 : false;

  const items: ReadinessItem[] = [
    {
      key: "business",
      label: "Business information",
      done: hasText(p?.tagline) && hasText(p?.description) && hasText(p?.city),
      fix: "Add a tagline, an about paragraph and your city.",
      to: "/app/website",
    },
    {
      key: "branding",
      label: "Branding",
      done: hasText(p?.logo_url) && hasText(p?.primary_color),
      fix: "Upload a logo and set your brand colour.",
      to: "/app/website",
    },
    {
      key: "services",
      label: "Services",
      done: input.servicesCount > 0,
      fix: "Add at least one service with a price.",
      to: "/app/services",
    },
    {
      key: "photos",
      label: "Photos",
      done: input.mediaCount > 0 || hasText(p?.hero_image_url),
      fix: "Add a hero image or a few gallery photos.",
      to: "/app/website",
    },
    {
      key: "contact",
      label: "Contact information",
      done:
        hasText(p?.phone) && hasText(p?.email) && (hasText(p?.address) || hasText(p?.service_area)),
      fix: "Add a phone number, email and address or service area.",
      to: "/app/website",
    },
    {
      key: "hours",
      label: "Business hours",
      done: hours,
      fix: "Set the hours you're open.",
      to: "/app/website",
    },
    {
      key: "booking",
      label: "Booking",
      done: input.bookableCount > 0,
      fix: "Mark at least one service as bookable online.",
      to: "/app/services",
    },
    {
      key: "leadcapture",
      label: "Lead capture",
      done: input.quoteFormCount > 0 || input.bookableCount > 0,
      fix: "Turn on the instant quote calculator or online booking.",
      to: "/app/services",
    },
    {
      key: "seo",
      label: "SEO",
      done: hasText(seo["meta_description"]) && hasText(seo["headline"]),
      fix: "Write a headline and a search description for the site.",
      to: "/app/website",
    },
    {
      // A published site always has a working platform address, so this item tracks
      // "the site has a working address" — it must not sit permanently
      // incomplete just because the owner hasn't bought a domain of their own.
      key: "domain",
      label: "Web address",
      done: s?.domain_status === "connected" || s?.domain_status === "ssl_active" || !!s?.custom_domain || !!org?.slug,
      fix: "Publish your site, or connect a domain you own.",
      to: "/app/launch",
    },

    {
      key: "analytics",
      label: "Analytics",
      done: input.analyticsCount > 0,
      fix: "Publish and share the site — traffic data starts collecting on the first visit.",
      to: "/app/analytics",
    },
    {
      key: "published",
      label: "Website published",
      done: s?.publish_state === "published",
      fix: "Publish the website to make it live.",
      to: "/app/launch",
    },
  ];

  const done = items.filter((i) => i.done).length;
  const score = Math.round((done / items.length) * 100);
  return { items, done, total: items.length, score, missing: items.filter((i) => !i.done) };
}

export const DOMAIN_STATES: Record<
  string,
  { label: string; tone: "signal" | "attention" | "info" | "neutral" | "danger"; help: string }
> = {
  not_connected: {
    label: "Not connected",
    tone: "neutral",
    help: "No custom domain has been added yet. The site runs on its free web address.",
  },
  dns_pending: {
    label: "DNS setup required",
    tone: "attention",
    help: "Your domain is saved. Add the records below at your domain provider, then press Check now.",
  },
  verifying: {
    label: "Checking DNS",
    tone: "info",
    help: "We spotted your changes and are confirming them. Domain changes can take a few hours to spread.",
  },
  connected: {
    label: "DNS detected — securing",
    tone: "signal",
    help: "Your domain points here. We're issuing the security certificate now.",
  },
  ssl_active: {
    label: "Live",
    tone: "signal",
    help: "Your domain is live and secure.",
  },
  error: {
    label: "Needs attention",
    tone: "danger",
    help: "Your domain isn't pointing here yet. Check the records below, then press Check now.",
  },
};

export const PUBLISH_STATES: Record<
  string,
  { label: string; tone: "signal" | "attention" | "info" | "neutral" | "danger"; help: string }
> = {
  draft: { label: "Draft", tone: "neutral", help: "Only your team can see this site." },
  preview: {
    label: "Preview",
    tone: "info",
    help: "Shareable with a preview link, hidden from search.",
  },
  published: { label: "Published", tone: "signal", help: "Live to the public and indexable." },
  unpublished: {
    label: "Unpublished",
    tone: "attention",
    help: "Taken offline. Visitors see a short notice.",
  },
};
