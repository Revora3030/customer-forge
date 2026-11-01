/**
 * JSON-LD VALIDATOR — publish-warning check for generated sites.
 *
 * Structured data must say exactly what the page says. This compares the
 * JSON-LD a generated site emits with the facts the owner gave (intake) and the
 * text a visitor can read, and reports each mismatch by name:
 *
 * - LocalBusiness (any subtype): name, telephone and address equal the intake
 *   facts, and every Service in its catalog is one of the owner's services.
 * - FAQPage: every Question/Answer is on the page word for word, and every
 *   visible FAQ entry is in the markup (one-to-one).
 * - Reviews: no Review, AggregateRating or rating of any kind unless the owner
 *   has verified (published) reviews, and never a count above that number.
 *
 * Deterministic, pure, no network. A finding is a publish WARNING, never a
 * blocker: it tells the owner exactly what differs so they can fix the source.
 * Rules are our own; schema-dts (types only) is used to type the fixtures.
 */

import { scrubPlaceholderText } from "@/lib/builder/placeholder-contact";

export type JsonLdFindingCode =
  | "business_name_mismatch"
  | "business_phone_mismatch"
  | "business_address_mismatch"
  | "service_name_mismatch"
  | "faq_not_on_page"
  | "faq_answer_mismatch"
  | "faq_missing_from_schema"
  | "review_schema_unverified"
  | "review_count_exceeds_verified";

export type JsonLdFinding = {
  code: JsonLdFindingCode;
  /** The exact mismatch, in plain words. */
  message: string;
  /** What the owner's facts or the visible page say. */
  expected: string;
  /** What the structured data says. */
  found: string;
};

export type JsonLdFacts = {
  /** Parsed JSON-LD documents the site emits (objects, arrays or @graph wrappers). */
  docs: readonly unknown[];
  /** The owner's intake facts. Null/empty means "not given". */
  business: {
    name: string | null;
    phone: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  /** The owner's active service names. */
  serviceNames: readonly string[];
  /** FAQ entries a visitor can read on the site. */
  visibleFaqs: readonly { q: string; a: string }[];
  /** Published reviews the owner can stand behind. */
  verifiedReviewCount: number;
};

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => !!value && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const squash = (value: string): string => value.replace(/\s+/g, " ").trim();
// Decode &amp; last so "&amp;nbsp;" stays the literal text "&nbsp;" (no double unescape).
const words = (value: string): string =>
  squash(value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&"))
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
const digits = (value: string): string => {
  const d = value.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};
const place = (value: string): string => words(value).replace(/\./g, "").replace(/,/g, "");

const typesOf = (node: Obj): string[] => {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
};

/** Every object in the documents, including @graph members and nested values. */
function allNodes(docs: readonly unknown[]): Obj[] {
  const out: Obj[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(value)) return value.forEach((item) => walk(item, depth + 1));
    if (!isObj(value)) return;
    out.push(value);
    for (const child of Object.values(value)) walk(child, depth + 1);
  };
  docs.forEach((doc) => walk(doc, 0));
  return out;
}

const NOT_A_BUSINESS = /^(FAQPage|Question|Answer|WebSite|WebPage|BreadcrumbList|ListItem|ItemList|ImageObject|PostalAddress|Offer|OfferCatalog|PriceSpecification|OpeningHoursSpecification|GeoCoordinates|Service|Review|AggregateRating|Rating|Person|Organization)$/;
const REVIEW_TYPES = /^(Review|AggregateRating|Rating|EmployerAggregateRating|CriticReview|UserReview)$/;

/** LocalBusiness or one of its subtypes (Plumber, Restaurant, ...): top-level nodes that carry business facts. */
function businessNodes(docs: readonly unknown[]): Obj[] {
  const tops: Obj[] = [];
  for (const doc of docs) {
    const list = Array.isArray(doc) ? doc : isObj(doc) && Array.isArray(doc["@graph"]) ? (doc["@graph"] as unknown[]) : [doc];
    for (const item of list) if (isObj(item)) tops.push(item);
  }
  return tops.filter((node) => {
    const types = typesOf(node);
    return types.length > 0 && types.some((t) => !NOT_A_BUSINESS.test(t)) && ("telephone" in node || "address" in node || "hasOfferCatalog" in node || "name" in node);
  });
}

export function validateJsonLd(facts: JsonLdFacts): JsonLdFinding[] {
  const findings: JsonLdFinding[] = [];
  const add = (finding: JsonLdFinding) => findings.push(finding);
  const biz = facts.business;

  for (const node of businessNodes(facts.docs)) {
    const label = typesOf(node).find((t) => !NOT_A_BUSINESS.test(t)) ?? "LocalBusiness";

    const name = squash(str(node["name"]));
    const wantName = squash(biz.name ?? "");
    if (name && wantName && words(name) !== words(wantName))
      add({
        code: "business_name_mismatch",
        expected: wantName,
        found: name,
        message: `${label} name is "${name}" but your business name is "${wantName}".`,
      });

    const phone = squash(str(node["telephone"]));
    if (phone) {
      const wantPhone = squash(biz.phone ?? "");
      if (!wantPhone)
        add({ code: "business_phone_mismatch", expected: "(no phone on your business details)", found: phone, message: `${label} telephone is "${phone}" but your business details have no phone number.` });
      else if (digits(phone) !== digits(wantPhone))
        add({ code: "business_phone_mismatch", expected: wantPhone, found: phone, message: `${label} telephone is "${phone}" but your phone number is "${wantPhone}".` });
    }

    const address = node["address"];
    if (isObj(address)) {
      const fields: [string, string, string | null][] = [
        ["streetAddress", "street address", biz.street],
        ["addressLocality", "city", biz.city],
        ["addressRegion", "state", biz.state],
        ["postalCode", "ZIP code", biz.zip],
      ];
      for (const [key, label2, want] of fields) {
        const got = squash(str(address[key]));
        if (!got) continue;
        const wanted = squash(want ?? "");
        if (!wanted || place(got) !== place(wanted))
          add({
            code: "business_address_mismatch",
            expected: wanted || `(no ${label2} on your business details)`,
            found: got,
            message: `${label} ${label2} is "${got}" but your business details say ${wanted ? `"${wanted}"` : `no ${label2}`}.`,
          });
      }
    }
  }

  // Service names anywhere in the markup must be services the owner actually has.
  const owned = new Set(facts.serviceNames.map((n) => words(n)));
  const seenService = new Set<string>();
  for (const node of allNodes(facts.docs)) {
    if (!typesOf(node).includes("Service")) continue;
    const name = squash(str(node["name"]));
    const key = words(name);
    if (!name || seenService.has(key)) continue;
    seenService.add(key);
    // site-head cuts service names at 120 characters, so a cut name still matches its owner.
    const isOwned = owned.has(key) || (key.length >= 100 && [...owned].some((own) => own.startsWith(key)));
    if (!isOwned)
      add({ code: "service_name_mismatch", expected: "one of your services", found: name, message: `Structured data lists the service "${name}", which is not one of your services.` });
  }

  // FAQPage one-to-one with the visible FAQ.
  const faqNodes = allNodes(facts.docs).filter((n) => typesOf(n).includes("FAQPage"));
  if (faqNodes.length) {
    const visible = facts.visibleFaqs.map((f) => ({ q: words(scrubPlaceholderText(f.q)), a: words(scrubPlaceholderText(f.a)), rawQ: squash(f.q) }));
    const schemaQs = new Set<string>();
    for (const faq of faqNodes) {
      const entities = ([] as unknown[]).concat(faq["mainEntity"] ?? []);
      for (const entity of entities) {
        if (!isObj(entity)) continue;
        const q = squash(str(entity["name"]));
        const answer = isObj(entity["acceptedAnswer"]) ? squash(str((entity["acceptedAnswer"] as Obj)["text"])) : "";
        schemaQs.add(words(q));
        const match = visible.find((v) => v.q === words(q));
        if (!match) add({ code: "faq_not_on_page", expected: "a question shown on the page", found: q, message: `FAQ question "${q}" is in the structured data but not on the page.` });
        else if (match.a !== words(answer))
          add({ code: "faq_answer_mismatch", expected: match.rawQ, found: q, message: `The answer to FAQ question "${q}" in the structured data differs from the answer shown on the page.` });
      }
    }
    for (const v of visible)
      if (v.q && v.a && !schemaQs.has(v.q)) add({ code: "faq_missing_from_schema", expected: v.rawQ, found: "(missing)", message: `FAQ question "${v.rawQ}" is on the page but not in the structured data.` });
  }

  // Reviews and ratings need verified reviews behind them.
  let reviewFlagged = false;
  for (const node of allNodes(facts.docs)) {
    const claimsReview = typesOf(node).some((t) => REVIEW_TYPES.test(t));
    const holdsReview = "aggregateRating" in node || "review" in node || "reviewRating" in node;
    if (!claimsReview && !holdsReview) continue;
    if (facts.verifiedReviewCount <= 0) {
      if (!reviewFlagged) {
        reviewFlagged = true;
        add({ code: "review_schema_unverified", expected: "no review or rating markup (0 verified reviews)", found: "review/rating markup present", message: "Structured data contains review or rating markup, but you have no verified reviews." });
      }
      continue;
    }
    if (typesOf(node).includes("AggregateRating")) {
      const claimed = Number(node["reviewCount"] ?? node["ratingCount"] ?? NaN);
      if (Number.isFinite(claimed) && claimed > facts.verifiedReviewCount)
        add({ code: "review_count_exceeds_verified", expected: String(facts.verifiedReviewCount), found: String(claimed), message: `Structured data claims ${claimed} reviews but you have ${facts.verifiedReviewCount} verified.` });
    }
  }

  return findings;
}
