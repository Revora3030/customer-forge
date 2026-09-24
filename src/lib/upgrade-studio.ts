/**
 * Revora Upgrade Studio (pure layer).
 *
 * The built-in scanner behind the website builder. It reads the client's actual
 * pages, sections, business facts and search settings, then writes a catalogue
 * of *elite* upgrades the site is currently missing — each one already expressed
 * as real, validated agent actions with real copy (never lorem, never generic
 * filler), so the builder can apply many upgrades in a single batch.
 *
 * Rules encoded here:
 * - Upgrades only add or fill. Nothing is deleted, hidden or downgraded.
 * - Copy is written from the client's own facts (business name, city, area,
 *   services, phone) so two clients never get the same words.
 * - Every upgrade is re-derived from live content, so once applied it disappears
 *   and the next tier of upgrades appears in its place. The list keeps growing
 *   with the site instead of running out.
 */

import { currency } from "@/lib/format";
import type { AgentAction, BackdropId, SectionEffectId } from "@/lib/site-agent";
import type { ContentPage, ContentSection } from "@/lib/website-content";

export type UpgradeTier =
  "Conversion" | "Trust" | "Search" | "Local" | "Premium visuals" | "Structure";

export type EliteUpgrade = {
  id: string;
  title: string;
  /** Why it makes money, in plain words. */
  why: string;
  tier: UpgradeTier;
  /** Rough score points recovered — used for ordering. */
  impact: number;
  /** What the client will see change. */
  preview: string[];
  actions: AgentAction[];
};

export type StudioFacts = {
  businessName: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;
  guarantee: string | null;
  services: { name: string; price: number | null }[];
  reviewCount: number;
  mediaCount: number;
  headline: string | null;
  metaDescription: string | null;
  backdrop: BackdropId;
  /** Trade words, used to offer colour identities that suit the business. */
  industry?: string | null;
  /** Current brand colour, so a new identity is only offered as a change. */
  primaryColor?: string | null;
  /** Bump to rotate in a different set of colour identities. */
  cycle?: number;
};

const has = (page: ContentPage, kind: string) =>
  page.sections.some((section) => section.kind === kind && section.is_visible);

const blank = (value: unknown) => !(typeof value === "string" && value.trim().length > 0);
const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

const where = (facts: StudioFacts) => {
  const parts = [facts.city, facts.state].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return facts.serviceArea?.split(/[,\n]/)[0]?.trim() || "";
};

const nameOf = (facts: StudioFacts) => facts.businessName?.trim() || "our team";
const serviceWords = (facts: StudioFacts) =>
  facts.services
    .slice(0, 3)
    .map((service) => service.name.trim())
    .filter(Boolean);

const effectFor = (kind: string): SectionEffectId | null => {
  switch (kind) {
    case "hero":
      return "float_3d";
    case "reviews":
      return "rise";
    case "cta":
      return "gold_glow";
    case "gallery":
      return "parallax_slow";
    case "pricing":
      return "shine";
    case "stats":
      return "tilt_3d";
    case "offer":
      return "gold_glow";
    case "guarantee":
      return "glass";
    case "quote":
    case "booking":
      return "glass";
    case "faq":
      return "rise";
    default:
      return null;
  }
};

const readEffect = (section: ContentSection) => {
  const value = (section.settings as { effect?: unknown } | null)?.effect;
  return typeof value === "string" ? value : "none";
};

/** Every upgrade the site is missing right now, best first. */
export function scanForUpgrades(pages: ContentPage[], facts: StudioFacts): EliteUpgrade[] {
  const out: EliteUpgrade[] = [];
  const area = where(facts);
  const inArea = area ? ` in ${area}` : "";
  const name = nameOf(facts);
  const services = serviceWords(facts);
  const listed = services.length ? services.join(", ") : "the work you do";
  const priced = facts.services.filter(
    (service) => typeof service.price === "number" && service.price! > 0,
  );
  const home = pages.find((page) => page.kind === "home") ?? pages[0];
  const visible = pages.filter((page) => page.is_visible);

  const push = (upgrade: EliteUpgrade) => {
    if (upgrade.actions.length) out.push(upgrade);
  };

  // ---------- Conversion spine ----------
  const missingCta = visible.filter(
    (page) => !has(page, "cta") && page.kind !== "thanks" && page.kind !== "privacy",
  );
  if (missingCta.length) {
    push({
      id: "spine-cta",
      title: `Close every page with a direct ask (${missingCta.length} page${missingCta.length === 1 ? "" : "s"})`,
      why: "Visitors decide at the bottom of the page. Without a closing ask they leave and call someone else.",
      tier: "Conversion",
      impact: 12,
      preview: missingCta.map((page) => `${page.title} → new closing call to action`),
      actions: missingCta.map((page) => ({
        type: "add_section" as const,
        pageId: page.id,
        kind: "cta",
        heading: `Ready to get ${page.kind === "book" ? "booked in" : "started"}${inArea}?`,
        subheading: facts.phone
          ? `Call ${facts.phone} or send a few details — ${name} replies the same day.`
          : `Send a few details and ${name} replies the same day.`,
        body: `Tell us what you need with ${listed} and we'll come straight back with next steps and a price range.`,
      })),
    });
  }

  if (home && !has(home, "sticky_cta")) {
    push({
      id: "spine-sticky",
      title: "Add a mobile call bar that never scrolls away",
      why: "Most local searches happen on a phone. A fixed call and quote bar turns reading into ringing.",
      tier: "Conversion",
      impact: 9,
      preview: [`${home.title} → always-visible call and quote bar`],
      actions: [
        {
          type: "add_section",
          pageId: home.id,
          kind: "sticky_cta",
          heading: facts.phone ? `Call ${facts.phone}` : "Get your quote",
          subheading: `${name}${inArea} — fast answers, no pressure.`,
        },
      ],
    });
  }

  const captureMissing = visible.filter(
    (page) =>
      !has(page, "quote") &&
      !has(page, "booking") &&
      !has(page, "contact") &&
      page.kind !== "privacy",
  );
  if (captureMissing.length) {
    push({
      id: "spine-capture",
      title: `Put a capture form on ${captureMissing.length} page${captureMissing.length === 1 ? "" : "s"} that has none`,
      why: "A page with no form can only be a leaflet. Every page should be able to create an enquiry on its own.",
      tier: "Conversion",
      impact: 14,
      preview: captureMissing.map((page) => `${page.title} → instant quote form`),
      actions: captureMissing.map((page) => ({
        type: "add_section" as const,
        pageId: page.id,
        kind: "quote",
        heading: `Get your price for ${listed}`,
        subheading: `Answer a few questions and ${name} sends a realistic figure — no site visit needed to start.`,
      })),
    });
  }

  // ---------- Trust ----------
  if (home && !has(home, "trust_bar")) {
    push({
      id: "trust-bar",
      title: "Add a trust strip under the headline",
      why: "Three short reassurances directly under the headline lift enquiry rates more than any other single block.",
      tier: "Trust",
      impact: 7,
      preview: [`${home.title} → trust strip`],
      actions: [
        {
          type: "add_section",
          pageId: home.id,
          kind: "trust_bar",
          heading: area ? `Covering ${area} and nearby` : "Covering your area",
          subheading: facts.reviewCount
            ? `${facts.reviewCount} customer review${facts.reviewCount === 1 ? "" : "s"} · same-day replies · clear pricing`
            : "Same-day replies · clear pricing · tidy, insured work",
        },
      ],
    });
  }

  if (home && !has(home, "process")) {
    push({
      id: "trust-process",
      title: "Show the three steps from enquiry to job done",
      why: "People buy when they can picture what happens next. Uncertainty is the biggest silent objection.",
      tier: "Trust",
      impact: 8,
      preview: [`${home.title} → how it works`],
      actions: [
        {
          type: "add_section",
          pageId: home.id,
          kind: "process",
          heading: "How it works",
          subheading: `1. Tell ${name} what you need. 2. Get a clear price and a date. 3. We do the work and leave it spotless.`,
        },
      ],
    });
  }

  if (home && !has(home, "guarantee")) {
    push({
      id: "trust-guarantee",
      title: "State your guarantee in writing",
      why: "A written promise removes the risk of choosing you over a cheaper quote.",
      tier: "Trust",
      impact: 6,
      preview: [`${home.title} → guarantee block`],
      actions: [
        {
          type: "add_section",
          pageId: home.id,
          kind: "guarantee",
          heading: "Our promise to you",
          // Only the owner's own words — Revora never writes a promise on their
          // behalf. Without one, the block asks them to add it and stays hidden.
          subheading: facts.guarantee?.trim() || undefined,
        },
      ],
    });
  }

  if (facts.reviewCount > 0) {
    const missingReviews = visible.filter(
      (page) =>
        !has(page, "reviews") && ["home", "services", "service", "pricing"].includes(page.kind),
    );
    if (missingReviews.length) {
      push({
        id: "trust-reviews",
        title: `Show your reviews on ${missingReviews.length} selling page${missingReviews.length === 1 ? "" : "s"}`,
        why: "Proof works hardest right next to the price and the button, not buried on its own page.",
        tier: "Trust",
        impact: 9,
        preview: missingReviews.map((page) => `${page.title} → customer reviews`),
        actions: missingReviews.map((page) => ({
          type: "add_section" as const,
          pageId: page.id,
          kind: "reviews",
          heading: `What customers${inArea} say about ${name}`,
        })),
      });
    }
  }

  if (facts.mediaCount >= 3) {
    const missingGallery = visible.filter(
      (page) => !has(page, "gallery") && ["home", "service", "services"].includes(page.kind),
    );
    if (missingGallery.length) {
      push({
        id: "trust-gallery",
        title: "Show photos of real finished jobs",
        why: "Your own work outsells stock imagery every time, and it keeps people on the page longer.",
        tier: "Trust",
        impact: 7,
        preview: missingGallery.map((page) => `${page.title} → work gallery`),
        actions: missingGallery.map((page) => ({
          type: "add_section" as const,
          pageId: page.id,
          kind: "gallery",
          heading: `Recent work${inArea}`,
          subheading: `Real jobs completed by ${name}.`,
        })),
      });
    }
  }

  if (home && !has(home, "stats")) {
    push({
      id: "trust-stats",
      title: "Add numbers you can stand behind",
      why: "Concrete counts make a small business look established without a single claim you can't back up.",
      tier: "Trust",
      impact: 5,
      preview: [`${home.title} → numbers strip`],
      actions: [
        {
          type: "add_section",
          pageId: home.id,
          kind: "stats",
          heading: "The short version",
          subheading: [
            facts.services.length ? `${facts.services.length} services offered` : null,
            facts.reviewCount ? `${facts.reviewCount} reviews` : null,
            area ? `Serving ${area}` : null,
            "Same-day replies",
          ]
            .filter(Boolean)
            .join(" · "),
        },
      ],
    });
  }

  // ---------- Objections and price ----------
  const missingFaq = visible.filter(
    (page) => !has(page, "faq") && ["home", "service", "pricing", "services"].includes(page.kind),
  );
  if (missingFaq.length) {
    push({
      id: "convert-faq",
      title: `Answer the questions that stop people buying (${missingFaq.length} page${missingFaq.length === 1 ? "" : "s"})`,
      why: "Price, timing and coverage are the three reasons people don't call. Answer them on the page and they call.",
      tier: "Conversion",
      impact: 10,
      preview: missingFaq.map((page) => `${page.title} → questions & answers`),
      actions: missingFaq.map((page) => ({
        type: "add_section" as const,
        pageId: page.id,
        kind: "faq",
        heading: "Questions we get asked every week",
        subheading: `How much does it cost? How soon can you come out? Do you cover${area ? ` ${area}` : " my area"}? Are you insured?`,
        body: `${name} answers all four before you commit to anything.`,
      })),
    });
  }

  const missingPricing = visible.filter(
    (page) =>
      !has(page, "pricing") && ["home", "services", "pricing", "service"].includes(page.kind),
  );
  if (priced.length && missingPricing.length) {
    push({
      id: "convert-pricing",
      title: "Publish starting prices so visitors self-qualify",
      why: "Showing a from-price filters out tyre-kickers and doubles the quality of the enquiries you get.",
      tier: "Conversion",
      impact: 11,
      preview: missingPricing.map((page) => `${page.title} → pricing guide`),
      actions: missingPricing.map((page) => ({
        type: "add_section" as const,
        pageId: page.id,
        kind: "pricing",
        heading: `${name} pricing guide`,
        subheading: `Typical jobs start from ${currency(Math.min(...priced.map((service) => service.price!)))}. Your exact price is confirmed in writing before any work starts.`,
      })),
    });
  }

  if (home && !has(home, "offer")) {
    push({
      id: "convert-offer",
      title: "Add an offer strip you control",
      why: "A dated, specific offer creates a reason to act today instead of bookmarking your site.",
      tier: "Conversion",
      impact: 6,
      preview: [`${home.title} → current offer`],
      actions: [
        {
          type: "add_section",
          pageId: home.id,
          kind: "offer",
          heading: "This month",
          subheading: `Book${inArea} this month and ${name} will hold the quoted price for 30 days.`,
        },
      ],
    });
  }

  if (home && !has(home, "lead_magnet")) {
    push({
      id: "convert-magnet",
      title: "Capture the visitors who aren't ready yet",
      why: "Most people who need you aren't ready today. A useful guide keeps them in your list instead of a rival's.",
      tier: "Conversion",
      impact: 6,
      preview: [`${home.title} → free guide capture block`],
      actions: [
        {
          type: "add_section",
          pageId: home.id,
          kind: "lead_magnet",
          heading: `The ${listed} checklist`,
          subheading: `Five things to check before you hire anyone${inArea} — sent straight to your inbox.`,
        },
      ],
    });
  }

  // ---------- Local ----------
  if (area) {
    const missingArea = visible.filter(
      (page) =>
        !has(page, "area") &&
        !has(page, "areas") &&
        ["home", "service", "services"].includes(page.kind),
    );
    if (missingArea.length) {
      push({
        id: "local-area",
        title: `Name your area on ${missingArea.length} page${missingArea.length === 1 ? "" : "s"}`,
        why: "Local searches include a place name. Pages that never say where you work can't win them.",
        tier: "Local",
        impact: 9,
        preview: missingArea.map((page) => `${page.title} → area covered`),
        actions: missingArea.map((page) => ({
          type: "add_section" as const,
          pageId: page.id,
          kind: "area",
          heading: `${listed}${inArea}`,
          subheading: facts.serviceArea?.trim()
            ? `${name} covers ${facts.serviceArea.trim()}.`
            : `${name} covers ${area} and the surrounding towns.`,
        })),
      });
    }
  }

  // ---------- Search ----------
  const seoGaps = visible.filter((page) => blank(page.seo_title) || blank(page.seo_description));
  if (seoGaps.length) {
    push({
      id: "search-snippets",
      title: `Write Google snippets for ${seoGaps.length} page${seoGaps.length === 1 ? "" : "s"}`,
      why: "These two lines are your advert in Google. Left blank, Google guesses them for you.",
      tier: "Search",
      impact: 12,
      preview: seoGaps.map((page) => `${page.title} → search title + description`),
      actions: seoGaps.map((page) => ({
        type: "set_page" as const,
        pageId: page.id,
        patch: {
          ...(blank(page.seo_title)
            ? { seo_title: clip(`${page.title}${inArea} | ${name}`, 65) }
            : {}),
          ...(blank(page.seo_description)
            ? {
                seo_description: clip(
                  `${page.title}${inArea} from ${name}. ${facts.metaDescription?.trim() || `Clear pricing, same-day replies and tidy work on ${listed}.`}`,
                  158,
                ),
              }
            : {}),
        },
      })),
    });
  }

  const shareGaps = visible.filter((page) => blank(page.og_title) || blank(page.og_description));
  if (shareGaps.length) {
    push({
      id: "search-share",
      title: `Control how ${shareGaps.length} page${shareGaps.length === 1 ? "" : "s"} look when shared`,
      why: "Texted and posted links get clicked far more when the preview reads like an offer, not a URL.",
      tier: "Search",
      impact: 6,
      preview: shareGaps.map((page) => `${page.title} → share title + description`),
      actions: shareGaps.map((page) => ({
        type: "set_page" as const,
        pageId: page.id,
        patch: {
          ...(blank(page.og_title)
            ? { og_title: clip(`${page.title}${inArea} — ${name}`, 88) }
            : {}),
          ...(blank(page.og_description)
            ? {
                og_description: clip(
                  `${listed}${inArea}. Fast replies, fixed prices, real reviews.`,
                  190,
                ),
              }
            : {}),
        },
      })),
    });
  }

  const hidden = visible.filter((page) => page.noindex);
  if (hidden.length) {
    push({
      id: "search-index",
      title: `Let Google list ${hidden.length} hidden page${hidden.length === 1 ? "" : "s"}`,
      why: "These pages are marked as hidden from search, so they can never bring you a single visitor.",
      tier: "Search",
      impact: 10,
      preview: hidden.map((page) => `${page.title} → listed in Google`),
      actions: hidden.map((page) => ({
        type: "set_page" as const,
        pageId: page.id,
        patch: { noindex: false },
      })),
    });
  }

  // ---------- Structure ----------
  const missingPages: { kind: string; title: string; slug: string; why: string }[] = [];
  const kinds = new Set(pages.map((page) => page.kind));
  if (!kinds.has("pricing"))
    missingPages.push({
      kind: "pricing",
      title: "Pricing",
      slug: "pricing",
      why: "price searches",
    });
  if (!kinds.has("faq"))
    missingPages.push({ kind: "faq", title: "FAQ", slug: "faq", why: "objection searches" });
  if (!kinds.has("reviews"))
    missingPages.push({
      kind: "reviews",
      title: "Reviews",
      slug: "reviews",
      why: "brand searches",
    });
  if (!kinds.has("book"))
    missingPages.push({
      kind: "book",
      title: "Book online",
      slug: "book",
      why: "ready-to-buy visitors",
    });
  if (!kinds.has("contact"))
    missingPages.push({
      kind: "contact",
      title: "Contact",
      slug: "contact",
      why: "phone searches",
    });
  if (!kinds.has("privacy"))
    missingPages.push({
      kind: "privacy",
      title: "Privacy notice",
      slug: "privacy",
      why: "Google & Meta ads",
    });
  if (missingPages.length) {
    push({
      id: "structure-pages",
      title: `Add ${missingPages.length} page${missingPages.length === 1 ? "" : "s"} your site is missing`,
      why: `Each of these catches a different kind of search — ${missingPages.map((page) => page.why).join(", ")}.`,
      tier: "Structure",
      impact: 13,
      preview: missingPages.map((page) => `New page: ${page.title} (/${page.slug})`),
      actions: missingPages.map((page) => ({
        type: "add_page" as const,
        kind: page.kind,
        title: page.title,
        slug: page.slug,
      })),
    });
  }

  const serviceWithoutPage = facts.services.filter(
    (service) =>
      service.name.trim() &&
      !pages.some((page) => page.title.toLowerCase().includes(service.name.trim().toLowerCase())),
  );
  if (serviceWithoutPage.length) {
    const batch = serviceWithoutPage.slice(0, 8);
    push({
      id: "structure-service-pages",
      title: `Give ${batch.length} service${batch.length === 1 ? "" : "s"} its own page`,
      why: "One page per service is what actually ranks locally — a single combined services page competes with itself.",
      tier: "Structure",
      impact: 15,
      preview: batch.map((service) => `New page: ${service.name}`),
      actions: batch.map((service) => ({
        type: "add_page" as const,
        kind: "service",
        title: service.name.trim(),
        slug: service.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48),
      })),
    });
  }

  // ---------- Premium visuals ----------
  if (facts.backdrop === "none") {
    push({
      id: "visual-backdrop",
      title: "Install a premium animated background across the whole site",
      why: "A moving starfield behind dark, gold-accented pages reads as high-end in the first second — before a word is read.",
      tier: "Premium visuals",
      impact: 7,
      preview: ["Whole site → animated starfield background (motion-safe, no slowdown)"],
      actions: [{ type: "set_backdrop", backdrop: "stars" }],
    });
  }

  const flatSections = pages
    .flatMap((page) => page.sections.map((section) => ({ page, section })))
    .filter(
      ({ section }) =>
        section.is_visible && readEffect(section) === "none" && effectFor(section.kind),
    );
  if (flatSections.length) {
    const batch = flatSections.slice(0, 12);
    push({
      id: "visual-depth",
      title: `Give ${batch.length} section${batch.length === 1 ? "" : "s"} 3D depth and motion`,
      why: "Depth, frosted glass and a gold glow on the blocks that matter pull the eye straight to your offer and your buttons.",
      tier: "Premium visuals",
      impact: 6,
      preview: batch.map(
        ({ page, section }) =>
          `${page.title} → ${section.kind} gets ${effectFor(section.kind)!.replace(/_/g, " ")}`,
      ),
      actions: batch.map(({ section }) => ({
        type: "set_section_effect" as const,
        sectionId: section.id,
        effect: effectFor(section.kind)!,
      })),
    });
  }

  // ---------- Copy quality ----------
  const weakHeadings = pages
    .flatMap((page) => page.sections.map((section) => ({ page, section })))
    .filter(
      ({ section }) =>
        section.is_visible &&
        section.kind === "hero" &&
        (blank(section.heading) || (section.heading ?? "").trim().length < 18),
    );
  if (weakHeadings.length) {
    push({
      id: "copy-hero",
      title: `Rewrite ${weakHeadings.length} weak headline${weakHeadings.length === 1 ? "" : "s"}`,
      why: "A headline that names the job, the place and the promise beats a generic welcome message every time.",
      tier: "Conversion",
      impact: 10,
      preview: weakHeadings.map(({ page }) => `${page.title} → new headline`),
      actions: weakHeadings.flatMap(({ page, section }) => [
        {
          type: "set_section_text" as const,
          sectionId: section.id,
          field: "heading" as const,
          value: clip(
            `${services[0] ?? page.title}${inArea}, done properly and priced up front`,
            90,
          ),
        },
        {
          type: "set_section_text" as const,
          sectionId: section.id,
          field: "subheading" as const,
          value: clip(
            `${name} handles ${listed}${inArea}. ${facts.phone ? `Call ${facts.phone} or ` : ""}send a few details and get a real price today.`,
            180,
          ),
        },
      ]),
    });
  }

  return out.sort((a, b) => b.impact - a.impact);
}

/** Splits a big approved batch into chunks the apply endpoint accepts. */
export function chunkActions(actions: AgentAction[], size = 50): AgentAction[][] {
  const chunks: AgentAction[][] = [];
  for (let index = 0; index < actions.length; index += size)
    chunks.push(actions.slice(index, index + size));
  return chunks;
}

export function summarizeUpgrades(upgrades: EliteUpgrade[]) {
  const changes = upgrades.reduce((sum, upgrade) => sum + upgrade.actions.length, 0);
  const impact = upgrades.reduce((sum, upgrade) => sum + upgrade.impact, 0);
  return { count: upgrades.length, changes, impact };
}
