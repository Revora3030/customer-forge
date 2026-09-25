/**
 * REVORA WEBSITE QUALITY ENGINE
 *
 * Code #6 — Production Quality Gate
 *
 * Deterministic quality evaluation for generated websites.
 *
 * Evaluates:
 * - business data integrity
 * - content safety
 * - generic/template copy
 * - page completeness
 * - navigation
 * - conversion paths
 * - SEO metadata
 * - accessibility evidence
 * - responsive evidence
   * - rendered browser evidence
 * - performance evidence
 * - technical completeness
 *
 * IMPORTANT:
 * A high score never overrides a blocker.
 *
 * GENERATE
 *   ↓
 * AUDIT
 *   ↓
 * DETECT WEAKNESSES
 *   ↓
 * FIX
 *   ↓
 * RE-AUDIT
 *   ↓
 * PUBLISH
 *
 * No external AI provider is required.
 * No paid AI credits are required.
 *
 * This module is intentionally pure.
 * It does not write to the database.
 * It does not call APIs.
 * It does not expose secrets.
 */

import {
  hasTemplateLeak,
  isUsableEmail,
  isUsablePhone,
  safeText,
} from "./presentation";

import { genericityIssues } from "./genericity";

import type { BusinessFacts } from "./facts";
import type { VisualReport } from "./visual";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type QualitySeverity = "blocker" | "advice";

export type QualityIssue = {
  /**
   * Stable machine-readable issue key.
   *
   * Keep keys stable because callers, tests, analytics and future
   * auto-fix routines may depend on them.
   */
  key: string;

  severity: QualitySeverity;

  /** Plain-language explanation suitable for the owner/admin. */
  detail: string;

  /** Concrete recommended next action. */
  fix: string;
};

export type QualityInput = {
  /**
   * Normalized business facts.
   */
  facts: BusinessFacts;

  /**
   * Raw values are retained so malformed values can be detected
   * instead of silently disappearing.
   */
  raw: {
    phone?: unknown;
    email?: unknown;
    hours?: unknown;
  };

  /**
   * Every visitor-visible page.
   */
  pages: {
    slug: string;
    title: unknown;
    sections: number;
  }[];

  /**
   * Every visitor-visible text value across the site.
   *
   * Objects are accepted because the quality gate needs to detect
   * when an object accidentally reaches a text renderer.
   */
  texts: unknown[];

  /**
   * Navigation labels in display order.
   */
  navLabels: unknown[];

  /**
   * Available conversion routes.
   */
  conversion: {
    hasPhone: boolean;
    hasBooking: boolean;
    hasQuote: boolean;
    hasContact: boolean;
  };

  /**
   * Real business-supplied social proof / portfolio counts.
   */
  reviewCount: number;
  galleryCount: number;

  /**
   * Whether the generated site is actually showing these sections.
   */
  showsReviews: boolean;
  showsGallery: boolean;

  /**
   * SEO metadata for each visitor-visible page.
   */
  metadata: {
    title: unknown;
    description: unknown;
  }[];

  /**
   * Optional Layer 2 browser-measured report.
   *
   * Layer 1 = stored content.
   * Layer 2 = actual rendered website.
   */
  visual?: VisualReport | null;
};

export type QualityCategory =
  | "data"
  | "content"
  | "visual"
  | "responsive"
  | "conversion"
  | "accessibility"
  | "seo"
  | "performance"
  | "navigation"
  | "technical";

export type QualityCategoryScore = {
  name: QualityCategory;
  weight: number;
  earned: number;
};

export type QualityReport = {
  /**
   * Overall score, 0–100.
   */
  score: number;

  /**
   * Content-only publish readiness.
   */
  ready: boolean;

  /**
   * Full production readiness.
   *
   * Requires:
   * - no blockers
   * - browser measurement
   * - accessibility evidence
   * - performance evidence
   * - rendered browser pass with accessibility/performance evidence
   */
  productionReady: boolean;

  /**
   * Score across categories that can be proven from stored content.
   */
  contentScore: number;

  /**
   * Whether browser measurement has been performed.
   */
  measured: boolean;

  categories: QualityCategoryScore[];

  issues: QualityIssue[];

  blockers: QualityIssue[];
};

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Category weights add up to exactly 100.
 */
export const CATEGORY_WEIGHTS: Record<
  QualityCategory,
  number
> = {
  data: 15,
  content: 10,
  visual: 15,
  responsive: 15,
  conversion: 10,
  accessibility: 10,
  seo: 10,
  performance: 5,
  navigation: 5,
  technical: 5,
};

/**
 * Stored-content findings are mapped to the category they damage.
 */
const CATEGORY_OF: Record<
  string,
  QualityCategory
> = {
  raw_object_text: "data",
  template_leak: "content",

  invalid_phone: "data",
  invalid_email: "data",
  unreadable_hours: "data",

  no_contact_route: "conversion",

  reviews_without_reviews: "content",
  gallery_without_photos: "content",

  generic_stock_phrase: "content",
  repeated_filler_copy: "content",

  nav_label_missing: "navigation",
  nav_duplicate: "navigation",
  nav_too_long: "navigation",

  empty_page: "technical",
  missing_page_title: "technical",
  duplicate_page_slug: "technical",
  missing_homepage: "technical",

  no_conversion: "conversion",

  duplicate_metadata: "seo",
  missing_description: "seo",
  metadata_count_mismatch: "seo",

  too_few_sections: "content",
};

/**
 * Browser-measured findings are mapped to their appropriate category.
 */
const VISUAL_CATEGORY: Record<
  string,
  QualityCategory
> = {
  horizontal_overflow: "responsive",
  element_overflow: "responsive",
  clipped_text: "responsive",

  small_tap_target: "accessibility",
  tiny_text: "accessibility",
  unreachable_control: "accessibility",

  broken_image: "visual",
  distorted_image: "visual",
  overlapping_content: "visual",
  narrow_column: "visual",

  menu_unusable: "navigation",

  no_visible_cta: "conversion",
  dead_control: "conversion",

  not_measured: "visual",
  page_not_measured: "visual",
  widths_not_measured: "responsive",

  zoom_blocked: "accessibility",
  image_missing_alt: "accessibility",
  unlabeled_control: "accessibility",
  unlabeled_input: "accessibility",
  heading_order: "accessibility",
  missing_main_landmark: "accessibility",
  missing_nav_landmark: "accessibility",
  keyboard_unreachable: "accessibility",
  low_contrast: "accessibility",

  missing_h1: "seo",
  multiple_h1: "seo",

  slow_main_content: "performance",
  layout_shift: "performance",
  slow_server_response: "performance",
  failed_requests: "performance",
  heavy_images: "performance",
  oversized_image: "performance",
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const issue = (
  key: string,
  severity: QualitySeverity,
  detail: string,
  fix: string,
): QualityIssue => ({
  key,
  severity,
  detail,
  fix,
});

const readable = (
  value: unknown,
): string | null => {
  const text = safeText(value);

  return text && text.trim()
    ? text.trim()
    : null;
};

const normalized = (
  value: unknown,
): string => {
  return (
    readable(value)
      ?.replace(/\s+/g, " ")
      .trim()
      .toLowerCase() ?? ""
  );
};

const positiveInteger = (
  value: unknown,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(value),
  );
};

/**
 * Adds a unique issue by key.
 */
function pushUnique(
  list: QualityIssue[],
  next: QualityIssue,
): void {
  if (
    !list.some(
      (existing) =>
        existing.key === next.key,
    )
  ) {
    list.push(next);
  }
}

/* -------------------------------------------------------------------------- */
/* CONTENT SAFETY                                                             */
/* -------------------------------------------------------------------------- */

function textIssues(
  texts: unknown[],
): QualityIssue[] {
  const found: QualityIssue[] = [];

  let objects = 0;
  let leaks = 0;

  for (const value of texts) {
    if (
      value !== null &&
      typeof value === "object"
    ) {
      objects += 1;
      continue;
    }

    if (
      typeof value === "string" &&
      hasTemplateLeak(value)
    ) {
      leaks += 1;
    }
  }

  if (objects > 0) {
    found.push(
      issue(
        "raw_object_text",
        "blocker",
        `${objects} block${
          objects === 1
            ? ""
            : "s"
        } would print stored data instead of readable website copy.`,
        "Normalize the stored value before rendering it, or rebuild the affected page.",
      ),
    );
  }

  if (leaks > 0) {
    found.push(
      issue(
        "template_leak",
        "blocker",
        `${leaks} block${
          leaks === 1
            ? " contains"
            : "s contain"
        } unfinished template text.`,
        "Replace unfinished template text with real business wording or remove the block.",
      ),
    );
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* BUSINESS DATA                                                              */
/* -------------------------------------------------------------------------- */

function contactIssues(
  input: QualityInput,
): QualityIssue[] {
  const found: QualityIssue[] = [];

  const rawPhone = safeText(
    input.raw.phone,
  );

  const rawEmail = safeText(
    input.raw.email,
  );

  if (
    rawPhone &&
    !isUsablePhone(input.raw.phone)
  ) {
    found.push(
      issue(
        "invalid_phone",
        "blocker",
        `“${rawPhone}” isn't a usable phone number, so visitors cannot reliably call it.`,
        "Add a complete phone number including the area code.",
      ),
    );
  }

  if (
    rawEmail &&
    !isUsableEmail(input.raw.email)
  ) {
    found.push(
      issue(
        "invalid_email",
        "blocker",
        `“${rawEmail}” isn't a usable email address, so enquiries may not reach the business.`,
        "Add the email address where customer enquiries should arrive.",
      ),
    );
  }

  /**
   * Hours may be absent.
   *
   * If supplied but rejected during normalization, report it.
   */
  if (
    input.raw.hours &&
    !input.facts.hours
  ) {
    found.push(
      issue(
        "unreadable_hours",
        "advice",
        "Opening hours were supplied but could not be safely displayed.",
        "Enter opening hours as readable text, for example “Mon–Sat 8am–6pm”.",
      ),
    );
  }

  /**
   * A website must have at least one meaningful conversion route.
   */
  if (
    !input.facts.phone &&
    !input.facts.email &&
    !input.conversion.hasBooking &&
    !input.conversion.hasQuote &&
    !input.conversion.hasContact
  ) {
    found.push(
      issue(
        "no_contact_route",
        "blocker",
        "There is no valid way for a visitor to contact or convert with this business.",
        "Add a phone number or email address, enable booking/quotes, or provide a contact page.",
      ),
    );
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* HONESTY / TRUST                                                            */
/* -------------------------------------------------------------------------- */

function honestyIssues(
  input: QualityInput,
): QualityIssue[] {
  const found: QualityIssue[] = [];

  if (
    input.showsReviews &&
    positiveInteger(
      input.reviewCount,
    ) === 0
  ) {
    found.push(
      issue(
        "reviews_without_reviews",
        "blocker",
        "A reviews/testimonials section is enabled, but no real customer reviews were supplied.",
        "Add verified customer reviews or hide the reviews section.",
      ),
    );
  }

  if (
    input.showsGallery &&
    positiveInteger(
      input.galleryCount,
    ) === 0
  ) {
    found.push(
      issue(
        "gallery_without_photos",
        "blocker",
        "A portfolio/work gallery is enabled, but no real business photos were supplied.",
        "Upload real business/work photos or hide the gallery section.",
      ),
    );
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* PAGE / NAVIGATION STRUCTURE                                                */
/* -------------------------------------------------------------------------- */

function structureIssues(
  input: QualityInput,
): QualityIssue[] {
  const found: QualityIssue[] = [];

  const labels = input.navLabels
    .map((label) =>
      readable(label),
    )
    .filter(
      (
        value,
      ): value is string =>
        !!value,
    );

  if (
    labels.length !==
    input.navLabels.length
  ) {
    found.push(
      issue(
        "nav_label_missing",
        "blocker",
        "A navigation item has no readable label.",
        "Give the page a clear navigation name.",
      ),
    );
  }

  const seenLabels =
    new Set<string>();

  let duplicateLabel = false;

  for (const label of labels) {
    const key =
      normalized(label);

    if (
      seenLabels.has(key)
    ) {
      duplicateLabel = true;
      break;
    }

    seenLabels.add(key);
  }

  if (duplicateLabel) {
    found.push(
      issue(
        "nav_duplicate",
        "advice",
        "The navigation contains duplicate page labels.",
        "Remove duplicate navigation entries or give each page a distinct purpose.",
      ),
    );
  }

  if (labels.length > 7) {
    found.push(
      issue(
        "nav_too_long",
        "advice",
        `${labels.length} primary navigation items may overwhelm visitors.`,
        "Keep the main navigation focused and move secondary destinations into the footer or grouped menus.",
      ),
    );
  }

  /* ------------------------------- PAGES -------------------------------- */

  const pages = Array.isArray(
    input.pages,
  )
    ? input.pages
    : [];

  const emptyPages =
    pages.filter(
      (page) =>
        positiveInteger(
          page.sections,
        ) === 0,
    );

  if (
    emptyPages.length > 0
  ) {
    found.push(
      issue(
        "empty_page",
        "blocker",
        `${emptyPages.length} page${
          emptyPages.length === 1
            ? ""
            : "s"
        } would open without any content.`,
        "Add meaningful sections to the page or remove it from the published site.",
      ),
    );
  }

  const missingTitles =
    pages.filter(
      (page) =>
        !readable(
          page.title,
        ),
    );

  if (
    missingTitles.length > 0
  ) {
    found.push(
      issue(
        "missing_page_title",
        "blocker",
        `${missingTitles.length} page${
          missingTitles.length === 1
            ? ""
            : "s"
        } have no readable title.`,
        "Give every visitor-visible page a clear title.",
      ),
    );
  }

  const seenSlugs =
    new Set<string>();

  let duplicateSlug = false;

  for (const page of pages) {
    const slug =
      normalized(page.slug);

    if (!slug) {
      continue;
    }

    if (
      seenSlugs.has(slug)
    ) {
      duplicateSlug = true;
      break;
    }

    seenSlugs.add(slug);
  }

  if (duplicateSlug) {
    found.push(
      issue(
        "duplicate_page_slug",
        "blocker",
        "Two visitor-visible pages use the same URL slug.",
        "Give each page a unique slug before publishing.",
      ),
    );
  }

  const hasHome =
    pages.some(
      (page) =>
        normalized(
          page.slug,
        ) === "" ||
        normalized(
          page.slug,
        ) === "home" ||
        normalized(
          page.slug,
        ) === "/",
    );

  if (
    pages.length > 0 &&
    !hasHome
  ) {
    found.push(
      issue(
        "missing_homepage",
        "blocker",
        "The site has visitor-visible pages but no identifiable homepage.",
        "Create or restore the homepage before publishing.",
      ),
    );
  }

  const thinPages =
    pages.filter(
      (page) =>
        positiveInteger(
          page.sections,
        ) > 0 &&
        positiveInteger(
          page.sections,
        ) < 2,
    );

  if (
    thinPages.length > 0
  ) {
    found.push(
      issue(
        "too_few_sections",
        "advice",
        `${thinPages.length} page${
          thinPages.length === 1
            ? ""
            : "s"
        } contain only one section.`,
        "Check whether the page needs supporting content, navigation context, a conversion path, or related information.",
      ),
    );
  }

  /* ---------------------------- CONVERSION ------------------------------ */

  const {
    hasPhone,
    hasBooking,
    hasQuote,
    hasContact,
  } = input.conversion;

  if (
    !hasPhone &&
    !hasBooking &&
    !hasQuote &&
    !hasContact
  ) {
    found.push(
      issue(
        "no_conversion",
        "blocker",
        "No page provides a meaningful visitor action.",
        "Add a contact route, booking flow, quote request, or valid phone number.",
      ),
    );
  }

  /* ----------------------------- METADATA -------------------------------- */

  const metadata =
    Array.isArray(
      input.metadata,
    )
      ? input.metadata
      : [];

  const titles = metadata
    .map((meta) =>
      normalized(
        meta.title,
      ),
    )
    .filter(Boolean);

  if (
    titles.length > 0 &&
    new Set(titles).size !==
      titles.length
  ) {
    found.push(
      issue(
        "duplicate_metadata",
        "advice",
        "Multiple pages share the same search-result title.",
        "Give important pages distinct SEO titles that describe their specific purpose.",
      ),
    );
  }

  const missingDescription =
    metadata.filter(
      (meta) =>
        !readable(
          meta.description,
        ),
    ).length;

  if (
    missingDescription > 0
  ) {
    found.push(
      issue(
        "missing_description",
        "advice",
        `${missingDescription} page${
          missingDescription === 1
            ? ""
            : "s"
        } have no search description.`,
        "Add a concise, accurate meta description based on the actual page content.",
      ),
    );
  }

  if (
    metadata.length !==
    pages.length
  ) {
    found.push(
      issue(
        "metadata_count_mismatch",
        "advice",
        "The number of SEO metadata records does not match the number of visitor-visible pages.",
        "Verify that every public page has its intended SEO metadata and that private/system routes are excluded.",
      ),
    );
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* VISUAL FINDING HELPERS                                                     */
/* -------------------------------------------------------------------------- */

function visualDamage(
  visual: VisualReport | null | undefined,
): Record<
  QualityCategory,
  number
> {
  const damage: Record<
    QualityCategory,
    number
  > = {
    data: 0,
    content: 0,
    visual: 0,
    responsive: 0,
    conversion: 0,
    accessibility: 0,
    seo: 0,
    performance: 0,
    navigation: 0,
    technical: 0,
  };

  for (const finding of
    visual?.findings ?? []) {
    const category =
      VISUAL_CATEGORY[
        finding.key
      ] ?? "visual";

    damage[category] +=
      finding.severity === "p0"
        ? 1
        : 0.25;
  }

  return damage;
}

/* -------------------------------------------------------------------------- */
/* CATEGORY SCORING                                                           */
/* -------------------------------------------------------------------------- */

function categoryShare(
  damage: number,
): number {
  return Math.max(
    0,
    1 - Math.min(1, damage),
  );
}

/**
 * Determine whether a category is actually proven.
 *
 * Accessibility and performance cannot receive full credit until the browser
 * actually measured them.
 */
function categoryIsProven(
  name: QualityCategory,
  visual: VisualReport | null | undefined,
): boolean {
  const coverage =
    visual?.coverage;

  if (
    name === "accessibility"
  ) {
    return !!coverage?.accessibility;
  }

  if (
    name === "performance"
  ) {
    return !!coverage?.performance;
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* MAIN AUDIT                                                                 */
/* -------------------------------------------------------------------------- */

export function auditWebsite(
  input: QualityInput,
): QualityReport {
  /* --------------------------- INPUT SAFETY ----------------------------- */

  const safeInput: QualityInput = {
    ...input,

    pages: Array.isArray(
      input.pages,
    )
      ? input.pages
      : [],

    texts: Array.isArray(
      input.texts,
    )
      ? input.texts
      : [],

    navLabels:
      Array.isArray(
        input.navLabels,
      )
        ? input.navLabels
        : [],

    metadata:
      Array.isArray(
        input.metadata,
      )
        ? input.metadata
        : [],

    visual:
      input.visual ?? null,
  };

  /* ----------------------------- FINDINGS -------------------------------- */

  const issues: QualityIssue[] =
    [
      ...textIssues(
        safeInput.texts,
      ),

      ...contactIssues(
        safeInput,
      ),

      ...honestyIssues(
        safeInput,
      ),

      ...structureIssues(
        safeInput,
      ),

      ...genericityIssues(
        safeInput.texts,
      ),
    ];

  const uniqueIssues: QualityIssue[] =
    [];

  for (const item of issues) {
    pushUnique(
      uniqueIssues,
      item,
    );
  }

  const blockers =
    uniqueIssues.filter(
      (item) =>
        item.severity ===
        "blocker",
    );

  /* ------------------------------ DAMAGE --------------------------------- */

  const damage: Record<
    QualityCategory,
    number
  > = {
    data: 0,
    content: 0,
    visual: 0,
    responsive: 0,
    conversion: 0,
    accessibility: 0,
    seo: 0,
    performance: 0,
    navigation: 0,
    technical: 0,
  };

  for (const item of
    uniqueIssues) {
    const category =
      CATEGORY_OF[
        item.key
      ] ?? "technical";

    damage[category] +=
      item.severity === "blocker"
        ? 1
        : 0.25;
  }

  const browserDamage =
    visualDamage(
      safeInput.visual,
    );

  for (const category of
    Object.keys(
      CATEGORY_WEIGHTS,
    ) as QualityCategory[]) {
    damage[category] +=
      browserDamage[
        category
      ];
  }

  /* ---------------------------- MEASUREMENT ------------------------------ */

  const measured =
    !!safeInput.visual &&
    safeInput.visual.widths.length >
      0;

  /* ---------------------------- CATEGORIES ------------------------------- */

  const categories: QualityCategoryScore[] =
    (
      Object.keys(
        CATEGORY_WEIGHTS,
      ) as QualityCategory[]
    ).map((name) => {
      const weight =
        CATEGORY_WEIGHTS[
          name
        ];

      /**
       * Visual and responsive scores require actual browser measurement.
       */
      if (
        !measured &&
        (
          name ===
            "visual" ||
          name ===
            "responsive"
        )
      ) {
        return {
          name,
          weight,
          earned: 0,
        };
      }

      const share =
        categoryShare(
          damage[name],
        );

      /**
       * Accessibility and performance receive at most half credit without
       * explicit browser evidence.
       */
      const proven =
        categoryIsProven(
          name,
          safeInput.visual,
        );

      const earned =
        proven
          ? weight * share
          : weight *
            Math.min(
              share,
              0.5,
            );

      return {
        name,
        weight,
        earned:
          Math.round(
            earned * 10,
          ) / 10,
      };
    });

  /* ------------------------------ SCORE ---------------------------------- */

  const rawScore =
    categories.reduce(
      (
        total,
        category,
      ) =>
        total +
        category.earned,
      0,
    );

  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        rawScore,
      ),
    ),
  );

  /* -------------------------- CONTENT SCORE ------------------------------ */

  const provable =
    categories.filter(
      (category) => {
        if (
          category.name ===
            "visual" ||
          category.name ===
            "responsive"
        ) {
          return false;
        }

        if (
          category.name ===
            "accessibility" &&
          !safeInput.visual
            ?.coverage
            ?.accessibility
        ) {
          return false;
        }

        if (
          category.name ===
            "performance" &&
          !safeInput.visual
            ?.coverage
            ?.performance
        ) {
          return false;
        }

        return true;
      },
    );

  const provableWeight =
    provable.reduce(
      (
        total,
        category,
      ) =>
        total +
        category.weight,
      0,
    );

  const provableEarned =
    provable.reduce(
      (
        total,
        category,
      ) =>
        total +
        category.earned,
      0,
    );

  const contentScore =
    provableWeight > 0
      ? Math.round(
          (
            provableEarned /
            provableWeight
          ) *
            100,
        )
      : 0;

  /* ---------------------------- READINESS -------------------------------- */

  /**
   * Content-ready means:
   * - no blockers
   * - content-only score >= 90
   *
   * Browser measurement is intentionally not required for this intermediate
   * state.
   */
  const contentReady =
    blockers.length === 0 &&
    contentScore >= 90;

  /**
   * Full production readiness is deliberately strict.
   */
  const productionReady =
    blockers.length === 0 &&
    measured &&
    !!safeInput.visual
      ?.passed &&
    !!safeInput.visual
      ?.coverage
      ?.accessibility &&
    !!safeInput.visual
      ?.coverage
      ?.performance;

  /* ------------------------------ RETURN --------------------------------- */

  return {
    score,

    ready:
      contentReady,

    productionReady,

    contentScore,

    measured,

    categories,

    issues: uniqueIssues,

    blockers,
  };
}

/* -------------------------------------------------------------------------- */
/* CONVENIENCE HELPERS                                                        */
/* -------------------------------------------------------------------------- */

/**
 * True when the quality report contains no blockers.
 */
export function hasQualityBlockers(
  report: QualityReport,
): boolean {
  return report.blockers.length > 0;
}

/**
 * True when the stored website content is ready for the next stage.
 */
export function isContentReady(
  report: QualityReport,
): boolean {
  return report.ready;
}

/**
 * True only for the strict production gate.
 */
export function isProductionReady(
  report: QualityReport,
): boolean {
  return report.productionReady;
}

/**
 * Returns the highest-priority issues first.
 */
export function prioritizedIssues(
  report: QualityReport,
): QualityIssue[] {
  return [
    ...report.issues.filter(
      (item) =>
        item.severity ===
        "blocker",
    ),
    ...report.issues.filter(
      (item) =>
        item.severity ===
        "advice",
    ),
  ];
}

/**
 * Returns a compact summary suitable for the builder's internal response.
 */
export function qualitySummary(
  report: QualityReport,
): string {
  if (
    report.productionReady
  ) {
    return `Quality check passed at ${report.score}/100.`;
  }

  if (
    report.blockers.length > 0
  ) {
    return `Quality check found ${report.blockers.length} blocker${
      report.blockers.length === 1
        ? ""
        : "s"
    }.`;
  }

  if (!report.measured) {
    return `Content quality is ${report.contentScore}/100. Browser measurement is still required before production readiness.`;
  }

  return `Quality check scored ${report.score}/100.`;
}