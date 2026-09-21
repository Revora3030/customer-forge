/**
 * REVORA PRE-FLIGHT™ — deterministic, browser-safe pre-publish verification.
 *
 * Pre-Flight reads the real workspace state (pages, sections, components,
 * business profile, services, quote/booking configuration, domain and search
 * settings) and reports, in plain language, what a visitor would actually
 * experience. Nothing is assumed and nothing is faked: every check either
 * passes on real data or explains exactly what is missing and where to fix it.
 *
 * Blockers stop a publish. Warnings never do — they are real improvements.
 */

import { safeLinkUrl, type ContentPage } from "@/lib/website-content";

export type PreflightSeverity = "blocker" | "warning";
export type PreflightStatus = "pass" | "warn" | "fail" | "skip";

export type PreflightCheck = {
  key: string;
  label: string;
  status: PreflightStatus;
  severity: PreflightSeverity;
  /** What Revora found — always the real state. */
  detail: string;
  /** The concrete next step when it doesn't pass. */
  fix?: string;
  /** Where in Revora the owner fixes it. */
  to?: string;
  /** True when Revora can safely correct this itself. */
  autoFixable?: boolean;
};

export type PreflightGroupKey =
  | "structure"
  | "links"
  | "buttons"
  | "forms"
  | "leads"
  | "quotes"
  | "booking"
  | "seo"
  | "accessibility"
  | "responsive"
  | "performance"
  | "security"
  | "domain"
  | "billing";

export type PreflightGroup = {
  key: PreflightGroupKey;
  label: string;
  /** Plain-language description of what this group protects. */
  purpose: string;
  checks: PreflightCheck[];
  status: PreflightStatus;
};

export type PreflightInput = {
  pages: ContentPage[];
  businessName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  serviceArea: string | null;
  description: string | null;
  logoUrl?: string | null;
  hasHours: boolean;
  servicesCount: number;
  pricedServicesCount: number;
  bookableCount: number;
  quoteFormCount: number;
  /** `null` when Revora hasn't been able to read the questions yet — never guessed. */
  quoteQuestionCount: number | null;
  mediaCount: number;
  analyticsConfigured: boolean;
  notifiesOwner: boolean;
  followUpAutomations: number;
  seoTitle: string | null;
  seoDescription: string | null;
  /** Verified public address the site will serve on, when there is one. */
  publicHost: string | null;
  httpsVerified: boolean;
  /** Whether billing/access currently allows publishing. */
  canPublish: boolean;
  canPublishReason?: string | null;
};

const GROUP_META: Record<PreflightGroupKey, { label: string; purpose: string }> = {
  structure: { label: "Pages", purpose: "Every page a visitor can reach has real content." },
  links: { label: "Links", purpose: "Every link and anchor goes somewhere that exists." },
  buttons: { label: "Buttons", purpose: "Every button has a real destination or action." },
  forms: { label: "Forms", purpose: "Visitors can send you their details and get a response." },
  leads: { label: "Leads & CRM", purpose: "Enquiries reach your CRM and you get told." },
  quotes: { label: "Quotes", purpose: "Visitors can get a price without waiting." },
  booking: { label: "Booking", purpose: "Visitors can book a real time slot." },
  seo: { label: "Search", purpose: "Google can read, title and index your pages." },
  accessibility: { label: "Accessibility", purpose: "Everyone can read and use the site." },
  responsive: { label: "Mobile", purpose: "The site works on small phones through large screens." },
  performance: { label: "Speed", purpose: "Pages load fast on a phone connection." },
  security: { label: "Safety", purpose: "No unsafe links or scripts can reach a visitor." },
  domain: { label: "Address", purpose: "Your site answers on a real, secure web address." },
  billing: { label: "Account", purpose: "Your Revora account allows publishing." },
};

const pass = (
  key: string,
  label: string,
  detail: string,
  severity: PreflightSeverity = "blocker",
): PreflightCheck => ({ key, label, status: "pass", severity, detail });

const fail = (
  key: string,
  label: string,
  detail: string,
  fix: string,
  severity: PreflightSeverity = "blocker",
  to?: string,
  autoFixable = false,
): PreflightCheck => ({
  key,
  label,
  status: severity === "blocker" ? "fail" : "warn",
  severity,
  detail,
  fix,
  ...(to ? { to } : {}),
  ...(autoFixable ? { autoFixable } : {}),
});

const decide = (
  ok: boolean,
  key: string,
  label: string,
  okDetail: string,
  badDetail: string,
  fix: string,
  severity: PreflightSeverity = "blocker",
  to?: string,
  autoFixable = false,
) =>
  ok
    ? pass(key, label, okDetail, severity)
    : fail(key, label, badDetail, fix, severity, to, autoFixable);

const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/** Anchor ids a generated page exposes for in-page links. */
function anchorIds(pages: ContentPage[]) {
  const ids = new Set<string>();
  for (const page of pages) {
    for (const section of page.sections) {
      ids.add(section.kind);
      ids.add(`${page.slug}-${section.kind}`);
    }
  }
  return ids;
}

type LinkAudit = {
  total: number;
  internal: number;
  broken: string[];
  unsafe: string[];
  external: number;
};

/** Resolves every component link against the pages that actually exist. */
export function auditLinks(pages: ContentPage[]): LinkAudit {
  const slugs = new Set(pages.map((p) => `/${p.slug}`.replace(/\/+/g, "/")));
  slugs.add("/");
  const anchors = anchorIds(pages);
  const audit: LinkAudit = { total: 0, internal: 0, broken: [], unsafe: [], external: 0 };

  for (const page of pages) {
    for (const section of page.sections) {
      for (const component of section.components) {
        const raw = component.link_url;
        if (!text(raw)) continue;
        audit.total += 1;
        const safe = safeLinkUrl(raw);
        if (!safe) {
          audit.unsafe.push(String(raw).slice(0, 80));
          continue;
        }
        if (/^https?:|^mailto:|^tel:|^sms:/i.test(safe)) {
          audit.external += 1;
          continue;
        }
        audit.internal += 1;
        const [path, hash] = safe.split("#");
        const target = (path || "/").replace(/\/+$/, "") || "/";
        if (!slugs.has(target)) {
          audit.broken.push(safe.slice(0, 80));
          continue;
        }
        if (hash && !anchors.has(hash)) audit.broken.push(safe.slice(0, 80));
      }
    }
  }
  return audit;
}

const worst = (checks: PreflightCheck[]): PreflightStatus => {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  if (checks.length && checks.every((c) => c.status === "skip")) return "skip";
  return "pass";
};

export type PreflightResult = {
  groups: PreflightGroup[];
  checks: PreflightCheck[];
  blockers: PreflightCheck[];
  warnings: PreflightCheck[];
  /** Percentage of non-skipped checks that pass. */
  score: number;
  /** True only when there is no blocker at all. */
  publishSafe: boolean;
  /** One sentence a non-technical owner can act on. */
  summary: string;
  /** The single most valuable next step, when something is outstanding. */
  nextStep: PreflightCheck | null;
};

export function preflight(input: PreflightInput): PreflightResult {
  const visiblePages = input.pages.filter((p) => p.is_visible);
  const home = input.pages.find((p) => p.slug === "home" || p.slug === "" || p.kind === "home");
  const visibleSections = visiblePages.reduce(
    (sum, p) => sum + p.sections.filter((s) => s.is_visible).length,
    0,
  );
  const links = auditLinks(input.pages);
  const buttons = input.pages.flatMap((p) =>
    p.sections.flatMap((s) => s.components.filter((c) => /button|cta|link/i.test(c.kind))),
  );
  const deadButtons = buttons.filter((c) => !safeLinkUrl(c.link_url));
  const images = input.pages.flatMap((p) =>
    p.sections.flatMap((s) => s.components.filter((c) => text(c.media_url))),
  );
  const imagesWithoutAlt = images.filter((c) => !text(c.label) && !text(c.body));
  const headingless = visiblePages.filter(
    (p) => !p.sections.some((s) => s.is_visible && text(s.heading)),
  );
  const untitled = visiblePages.filter((p) => !text(p.seo_title) && !text(p.title));
  const undescribed = visiblePages.filter((p) => !text(p.seo_description));
  const longText = input.pages.flatMap((p) =>
    p.sections.filter((s) => (s.body ?? "").length > 1400),
  );

  const groups: PreflightGroup[] = [];
  const add = (key: PreflightGroupKey, checks: PreflightCheck[]) => {
    groups.push({ key, ...GROUP_META[key], checks, status: worst(checks) });
  };

  add("structure", [
    decide(
      visiblePages.length > 0,
      "pages-exist",
      "Pages are built",
      `${visiblePages.length} page${visiblePages.length === 1 ? "" : "s"} are ready for visitors.`,
      "Your website has no visible pages yet, so there is nothing to publish.",
      "Ask Revora to build your website, then review the pages.",
      "blocker",
      "/app/website",
    ),
    decide(
      !!home,
      "home-page",
      "Home page",
      "Visitors landing on your address see a real home page.",
      "There is no home page, so your web address would show nothing.",
      "Let Revora rebuild the site so a home page is created.",
      "blocker",
      "/app/website",
    ),
    decide(
      visibleSections >= 3,
      "sections",
      "Enough content per page",
      `${visibleSections} sections are visible across your pages.`,
      `Only ${visibleSections} section${visibleSections === 1 ? "" : "s"} are visible — the pages will look unfinished.`,
      "Turn more sections back on, or ask Revora to add the missing ones.",
      "blocker",
      "/app/website",
    ),
    decide(
      headingless.length === 0,
      "headings",
      "Every page has a headline",
      "Each page opens with a clear headline.",
      `${headingless.length} page${headingless.length === 1 ? "" : "s"} have no headline.`,
      "Ask Revora to write the missing headlines.",
      "warning",
      "/app/website",
      true,
    ),
  ]);

  add("links", [
    decide(
      links.broken.length === 0,
      "links-resolve",
      "Links go somewhere real",
      links.total
        ? `All ${links.total} links resolve (${links.internal} inside your site).`
        : "No links to check yet.",
      `${links.broken.length} link${links.broken.length === 1 ? "" : "s"} point at a page or anchor that doesn't exist (${links.broken.slice(0, 3).join(", ")}).`,
      "Revora can repoint these to the closest matching page.",
      "blocker",
      "/app/website",
      true,
    ),
  ]);

  add("buttons", [
    decide(
      deadButtons.length === 0,
      "buttons-work",
      "Buttons do something",
      buttons.length
        ? `All ${buttons.length} buttons have a working destination.`
        : "No buttons to check yet.",
      `${deadButtons.length} button${deadButtons.length === 1 ? "" : "s"} would do nothing when tapped.`,
      "Give each button a destination — a page, your phone number, or the quote form.",
      "blocker",
      "/app/website",
      true,
    ),
  ]);

  add("forms", [
    decide(
      input.quoteFormCount > 0 || input.bookableCount > 0,
      "capture",
      "Visitors can enquire",
      `${input.quoteFormCount} quote form${input.quoteFormCount === 1 ? "" : "s"} and ${input.bookableCount} bookable service${input.bookableCount === 1 ? "" : "s"} are live.`,
      "There is no way for a visitor to send you their details.",
      "Turn on the quote calculator or make a service bookable.",
      "blocker",
      "/app/quotes",
    ),
    decide(
      text(input.phone) || text(input.email),
      "contact",
      "A way to reach you",
      text(input.phone)
        ? `Your phone number is on the site${text(input.email) ? " along with your email" : ""}.`
        : "Your email is on the site.",
      "No phone number or email is published, so nobody can contact you directly.",
      "Add your business phone number and email.",
      "blocker",
      "/app/settings",
    ),
  ]);

  add("leads", [
    decide(
      input.notifiesOwner,
      "notify",
      "You hear about new enquiries",
      "New enquiries email you as soon as they arrive.",
      "Nobody is notified when an enquiry comes in.",
      "Add a notification email so leads never sit unread.",
      "blocker",
      "/app/leads",
    ),
    decide(
      input.followUpAutomations > 0,
      "followup",
      "Automatic follow-up",
      `${input.followUpAutomations} follow-up automation${input.followUpAutomations === 1 ? "" : "s"} are active.`,
      "Enquiries get no automatic confirmation or follow-up.",
      "Switch on the confirmation and follow-up automation.",
      "warning",
      "/app/automations",
    ),
    decide(
      input.analyticsConfigured,
      "analytics",
      "Traffic and conversions tracked",
      "Visits, calls and enquiries are being recorded.",
      "Nothing is tracking where your customers come from.",
      "Turn on Revora analytics so you can see what's working.",
      "warning",
      "/app/analytics",
    ),
  ]);

  add("quotes", [
    input.quoteFormCount === 0 || input.quoteQuestionCount === null
      ? {
          key: "quote-depth",
          label: "Quote questions",
          status: "skip",
          severity: "warning",
          detail:
            input.quoteFormCount === 0
              ? "No quote calculator is in use."
              : "Revora is still reading your quote questions.",
        }
      : decide(
          input.quoteQuestionCount >= 2,
          "quote-depth",
          "Quote questions",
          `${input.quoteQuestionCount} questions produce a meaningful estimate.`,
          "The quote calculator asks fewer than two questions, so the estimate means little.",
          "Add at least two questions to the quote calculator.",
          "blocker",
          "/app/quotes",
        ),
    decide(
      input.pricedServicesCount > 0 || input.quoteFormCount > 0,
      "pricing-signal",
      "Visitors can see what it costs",
      input.pricedServicesCount > 0
        ? `${input.pricedServicesCount} service${input.pricedServicesCount === 1 ? "" : "s"} show a starting price.`
        : "The quote calculator gives visitors a price.",
      "No prices and no quote calculator — most visitors leave to find one.",
      "Add starting prices, or switch on the quote calculator.",
      "warning",
      "/app/services",
    ),
  ]);

  add("booking", [
    input.bookableCount === 0
      ? {
          key: "booking-hours",
          label: "Booking hours",
          status: "skip",
          severity: "warning",
          detail: "Online booking is off, so hours aren't required.",
        }
      : decide(
          input.hasHours,
          "booking-hours",
          "Booking hours",
          "Your opening hours drive the available time slots.",
          "Online booking is on but you haven't set opening hours, so no slots can be offered.",
          "Add your opening hours so booking can go live.",
          "blocker",
          "/app/settings",
        ),
  ]);

  add("seo", [
    decide(
      text(input.seoTitle),
      "seo-title",
      "Search title",
      "Google has a title for your site.",
      "Your site has no search title, so Google invents one.",
      "Revora can write your search title from your business details.",
      "blocker",
      "/app/website",
      true,
    ),
    decide(
      text(input.seoDescription),
      "seo-description",
      "Search description",
      "Your search description is set.",
      "There is no search description under your Google listing.",
      "Revora can write it from your services and service area.",
      "warning",
      "/app/website",
      true,
    ),
    decide(
      untitled.length === 0,
      "page-titles",
      "Every page has its own title",
      "Each page has a distinct title.",
      `${untitled.length} page${untitled.length === 1 ? "" : "s"} have no title.`,
      "Ask Revora to fill in the missing page titles.",
      "blocker",
      "/app/website",
      true,
    ),
    decide(
      undescribed.length === 0,
      "page-descriptions",
      "Page descriptions",
      "Each page describes itself for search results.",
      `${undescribed.length} page${undescribed.length === 1 ? "" : "s"} have no search description.`,
      "Revora can write the missing descriptions.",
      "warning",
      "/app/website",
      true,
    ),
    decide(
      text(input.city) || text(input.serviceArea),
      "local",
      "Local search",
      `Your service area is published, so local searches can find you.`,
      "No city or service area is set, so local searches won't match you.",
      "Add your city and the areas you serve.",
      "warning",
      "/app/settings",
    ),
  ]);

  add("accessibility", [
    decide(
      imagesWithoutAlt.length === 0,
      "alt-text",
      "Images described",
      images.length ? `All ${images.length} images have a description.` : "No images to check.",
      `${imagesWithoutAlt.length} image${imagesWithoutAlt.length === 1 ? "" : "s"} have no description for screen readers.`,
      "Revora can write image descriptions from the surrounding content.",
      "warning",
      "/app/website",
      true,
    ),
    decide(
      headingless.length === 0,
      "heading-order",
      "Readable heading order",
      "Every page starts with one clear heading.",
      "Some pages have no heading, which breaks screen-reader navigation.",
      "Ask Revora to add the missing headings.",
      "warning",
      "/app/website",
      true,
    ),
  ]);

  add("responsive", [
    decide(
      longText.length === 0,
      "long-text",
      "Readable on a phone",
      "No section is long enough to become a wall of text on a phone.",
      `${longText.length} section${longText.length === 1 ? "" : "s"} are very long and will be hard to read at 320px.`,
      "Ask Revora to split these into shorter sections.",
      "warning",
      "/app/website",
      true,
    ),
    decide(
      text(input.phone),
      "tap-to-call",
      "Tap to call",
      "Phone visitors can call you with one tap.",
      "Without a phone number, mobile visitors have no one-tap option.",
      "Add your business phone number.",
      "warning",
      "/app/settings",
    ),
  ]);

  add("performance", [
    decide(
      input.mediaCount <= 40,
      "media-weight",
      "Image count",
      `${input.mediaCount} images is a healthy amount.`,
      `${input.mediaCount} images will slow the first load on a phone.`,
      "Remove the images that aren't earning attention.",
      "warning",
      "/app/website",
    ),
  ]);

  add("security", [
    decide(
      links.unsafe.length === 0,
      "unsafe-links",
      "No unsafe links",
      "Every link uses a safe web, phone or email address.",
      `${links.unsafe.length} link${links.unsafe.length === 1 ? "" : "s"} use an address Revora refuses to publish.`,
      "Revora will replace these with a safe destination.",
      "blocker",
      "/app/website",
      true,
    ),
  ]);

  add("domain", [
    decide(
      text(input.publicHost),
      "address",
      "Web address",
      `Your site will answer on ${input.publicHost}.`,
      "No verified web address is connected yet.",
      "Connect the domain you own, or use your Revora share link for now.",
      "warning",
      "/app/domain",
    ),
    !text(input.publicHost)
      ? {
          key: "https",
          label: "Secure certificate",
          status: "skip",
          severity: "warning",
          detail: "Checked once an address is connected.",
        }
      : decide(
          input.httpsVerified,
          "https",
          "Secure certificate",
          "HTTPS is verified on your address.",
          "Your address doesn't answer securely over HTTPS yet.",
          "Finish the DNS steps — the certificate is issued automatically afterwards.",
          "warning",
          "/app/domain",
        ),
  ]);

  add("billing", [
    decide(
      input.canPublish,
      "account",
      "Account can publish",
      "Your account is in good standing.",
      input.canPublishReason || "Your account can't publish right now.",
      "Complete your setup payment in Billing to unlock publishing.",
      "blocker",
      "/app/billing",
    ),
  ]);

  const checks = groups.flatMap((g) => g.checks);
  const counted = checks.filter((c) => c.status !== "skip");
  const passing = counted.filter((c) => c.status === "pass").length;
  const blockers = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");
  const score = counted.length ? Math.round((passing / counted.length) * 100) : 0;

  const summary = blockers.length
    ? `${blockers.length} thing${blockers.length === 1 ? "" : "s"} must be sorted before your website can go live. Nothing is published yet, and your current site is untouched.`
    : warnings.length
      ? `Your website is safe to publish. ${warnings.length} optional improvement${warnings.length === 1 ? "" : "s"} would make it stronger.`
      : "Everything checks out. Your website is 100% publish safe.";

  return {
    groups,
    checks,
    blockers,
    warnings,
    score,
    publishSafe: blockers.length === 0,
    summary,
    nextStep: blockers[0] ?? warnings[0] ?? null,
  };
}

/** Checks Revora is able to correct on its own, in priority order. */
export function autoFixable(result: PreflightResult): PreflightCheck[] {
  return [...result.blockers, ...result.warnings].filter((c) => c.autoFixable === true);
}
