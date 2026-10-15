import { validateComposition, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";

export type AcquisitionWebsiteStatus = "website_not_listed" | "website_listed";
export type AcquisitionCandidate = {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  mapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  city: string;
  category: string;
  websiteStatus: AcquisitionWebsiteStatus;
  score: number;
  scoreReasons: string[];
  sourceCheckedAt: string;
};

export type AcquisitionConcept = {
  title: string;
  description: string;
  tree: CompositionTree;
  proposedServices: string[];
  factsToConfirm: string[];
  designNotes: string;
};

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

export function scoreAcquisitionOpportunity(input: {
  websiteListed: boolean;
  hasPhone: boolean;
  hasCategory: boolean;
  hasCity: boolean;
  reviewCount: number | null;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (!input.websiteListed) {
    score += 35;
    reasons.push("No website is listed on the checked business profile; this does not prove the business has no website and existence still needs confirmation.");
  } else {
    reasons.push("A website is listed; prioritize only if the owner wants a redesign.");
  }
  if (input.hasCategory) {
    score += 15;
    reasons.push("Business category is available to tailor a relevant concept.");
  }
  if (input.hasCity) {
    score += 10;
    reasons.push("City or service location is available for relevant local messaging.");
  }
  if (input.hasPhone) {
    score += 10;
    reasons.push("A public phone field is available; it is not itself marketing consent.");
  }
  if (typeof input.reviewCount === "number" && input.reviewCount > 0) {
    score += 10;
    reasons.push("The listing has activity signals; this is not proof of revenue or buying intent.");
  }
  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

const FORBIDDEN_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:5[\s-]?star|five[\s-]?star|award[\s-]?winning|top[\s-]?rated|#1\b|number one)\b/i,
  /\b(?:licensed|insured|bonded|certified|guaranteed|guarantee|warranty)\b/i,
  /\b(?:trusted by hundreds|thousands of happy customers|best in (?:town|city|the area)|years of experience)\b/i,
  /\b(?:customer testimonials?|client testimonials?|customer reviews?|review rating|star rating)\b/i,
  /\b\d{1,3}%\s+(?:satisfaction|success|increase|more leads|more revenue)\b/i,
];

function nodeTextValues(node: CompositionNode, out: string[] = []): string[] {
  if (typeof node.text === "string") out.push(node.text);
  if (typeof node.alt === "string") out.push(node.alt);
  for (const item of node.items ?? []) out.push(item);
  for (const tab of node.tabs ?? []) {
    out.push(tab.label);
    for (const child of tab.children) nodeTextValues(child, out);
  }
  for (const child of node.children ?? []) nodeTextValues(child, out);
  if (node.faqItems) {
    for (const item of node.faqItems) {
      out.push(item.question, item.answer);
    }
  }
  if (node.primaryCta) out.push(node.primaryCta.label);
  if (node.secondaryCta) out.push(node.secondaryCta.label);
  return out;
}

export function compositionSafetyIssues(tree: CompositionTree): string[] {
  const issues: string[] = [];
  const seen = new Set<CompositionNode>();
  const walk = (node: CompositionNode, depth: number) => {
    if (depth > 12) { issues.push("Composition is too deeply nested."); return; }
    if (seen.has(node)) { issues.push("Composition contains a cycle."); return; }
    seen.add(node);
    for (const value of [node.href, node.primaryCta?.href, node.secondaryCta?.href]) {
      if (!value) continue;
      if (!/^#(?:[a-z0-9_-]{1,60})$/i.test(value)) {
        issues.push("Only safe in-page links are allowed in an acquisition concept.");
      }
    }
    for (const src of [node.src, node.beforeImage?.src, node.afterImage?.src]) {
      if (!src) continue;
      let url: URL;
      try { url = new URL(src); } catch { issues.push("An image source is not a valid URL."); continue; }
      if (url.protocol !== "https:" || !["images.unsplash.com", "images.pexels.com"].includes(url.hostname.toLowerCase()) ||
          url.username || url.password || url.port) {
        issues.push("Images may only use HTTPS sources from approved public photo CDNs.");
      }
    }
    for (const child of node.children ?? []) walk(child, depth + 1);
    for (const tab of node.tabs ?? []) for (const child of tab.children) walk(child, depth + 1);
    seen.delete(node);
  };
  walk(tree.root, 0);

  for (const value of nodeTextValues(tree.root)) {
    if (FORBIDDEN_CLAIM_PATTERNS.some((pattern) => pattern.test(value))) {
      issues.push("Generated copy contains a claim, credential, review, or outcome that requires verified evidence.");
      break;
    }
  }
  return [...new Set(issues)];
}

export function readAcquisitionConcept(value: unknown): { ok: true; concept: AcquisitionConcept } | { ok: false; issues: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issues: ["AI output is not a structured site concept."] };
  }
  const raw = value as Record<string, unknown>;
  const title = clean(raw["title"], 160);
  const description = clean(raw["description"], 360);
  const designNotes = clean(raw["designNotes"], 1800);
  const proposedServices = (Array.isArray(raw["proposedServices"]) ? raw["proposedServices"] : [])
    .filter((entry): entry is string => typeof entry === "string" && !!entry.trim())
    .map((entry) => clean(entry, 100)).filter(Boolean).slice(0, 12);
  const factsToConfirm = (Array.isArray(raw["factsToConfirm"]) ? raw["factsToConfirm"] : [])
    .filter((entry): entry is string => typeof entry === "string" && !!entry.trim())
    .map((entry) => clean(entry, 180)).filter(Boolean).slice(0, 20);

  const validation = validateComposition(raw["tree"], { lenient: false });
  const issues = [
    ...(!title ? ["A business-specific concept title is required."] : []),
    ...(!description ? ["A short concept description is required."] : []),
    ...(!designNotes ? ["Design notes are required for review."] : []),
    ...(factsToConfirm.length === 0 ? ["At least one fact must be flagged for owner confirmation."] : []),
    ...(validation.ok ? [] : validation.issues.map((issue) => "Composition: " + issue.path + " — " + issue.problem)),
  ];
  if (!validation.ok) return { ok: false, issues: [...new Set(issues)] };

  const treeIssues = compositionSafetyIssues(validation.tree);
  if (treeIssues.length) issues.push(...treeIssues);
  if (issues.length) return { ok: false, issues: [...new Set(issues)] };
  return {
    ok: true,
    concept: {
      title,
      description,
      tree: validation.tree,
      proposedServices,
      factsToConfirm,
      designNotes,
    },
  };
}

export function candidateForUi(input: {
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  mapsUri?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  city?: string | null;
  category?: string | null;
  fetchedAt?: string | null;
}): AcquisitionCandidate {
  const placeId = clean(input.placeId, 300);
  const name = clean(input.name, 200);
  if (!placeId || !name) throw new Error("The business listing needs a place ID and a name before it can be saved.");
  const website = clean(input.website, 500) || null;
  const scoring = scoreAcquisitionOpportunity({
    websiteListed: Boolean(website),
    hasPhone: Boolean(clean(input.phone, 80)),
    hasCategory: Boolean(clean(input.category, 120)),
    hasCity: Boolean(clean(input.city, 120)),
    reviewCount: typeof input.reviewCount === "number" && Number.isFinite(input.reviewCount) ? input.reviewCount : null,
  });
  return {
    placeId,
    name,
    address: clean(input.address, 300) || null,
    phone: clean(input.phone, 80) || null,
    website,
    mapsUri: clean(input.mapsUri, 500) || null,
    rating: typeof input.rating === "number" && Number.isFinite(input.rating) ? input.rating : null,
    reviewCount: typeof input.reviewCount === "number" && Number.isFinite(input.reviewCount) ? input.reviewCount : null,
    city: clean(input.city, 120),
    category: clean(input.category, 120),
    websiteStatus: website ? "website_listed" : "website_not_listed",
    score: scoring.score,
    scoreReasons: scoring.reasons,
    sourceCheckedAt: clean(input.fetchedAt, 60) || new Date().toISOString(),
  };
}
