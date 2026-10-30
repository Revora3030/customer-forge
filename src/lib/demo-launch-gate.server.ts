import type { SupabaseClient } from "@supabase/supabase-js";
import { isHeroVideoCategory } from "@/lib/builder/hero-stock-video";
import { readProspectDemoMarker } from "@/lib/jarvis-demo-site";
import { screenClaims, type DnaFacts } from "@/lib/business-dna";
import { readSeo } from "@/lib/site-seo";
import { siteThemeStyle } from "@/lib/site-theme";
import { AA_NORMAL, contrastRatio } from "@/lib/readable-color";
import { MEDIA_BUCKET, isStoragePath } from "@/lib/media";
import { readComposition, type CompositionNode, type CompositionTree } from "@/lib/builder/composition-tree";
import { launchBlockers, type LaunchReviewPage } from "@/lib/builder/launch-review";
import { pageText, type CompletenessPage, type CompletenessService } from "@/lib/builder/content-completeness";

/**
 * Production gate for prospect demo outreach.
 *
 * Before a demo's preview link is sent to a real business (manual or
 * autopilot), the stored draft must hold up: the build finished and the demo
 * is unclaimed, no AI-generated picture is presented as proof of real work,
 * every picture on a visible page resolves from our own storage, body text
 * meets WCAG AA contrast from the site's stored colours, no unsupported claim
 * (the first-build truth screen) appears in the visible copy, and the existing
 * launch-review blockers (empty picture boxes, uncredited stock, placeholder
 * legal pages, priced services without inclusions, empty galleries) are clear.
 *
 * Deterministic: no AI. The only network calls are HEAD requests (with a
 * timeout) to this project's own storage. Blockers marked `safety` can never be
 * overridden; a manual send may override the others with `force`.
 */

export type DemoGateBlockerCode =
  | "demo_not_found"
  | "demo_claimed"
  | "build_not_finished"
  | "generated_image_as_proof"
  | "unsupported_claim"
  | "storage_error"
  | "image_unresolved"
  | "image_unverifiable"
  | "low_contrast"
  | "image_without_photo"
  | "stock_credit_missing"
  | "legal_placeholder"
  | "legal_too_thin"
  | "service_without_inclusions"
  | "gallery_without_images";

export type DemoGateBlocker = {
  code: DemoGateBlockerCode;
  message: string;
  /** Safety blockers can never be overridden, not even by a manual force send. */
  safety: boolean;
};

export type DemoGateResult = { ok: boolean; blockers: DemoGateBlocker[] };

const SAFETY_CODES = new Set<DemoGateBlockerCode>([
  "demo_not_found",
  "demo_claimed",
  "build_not_finished",
  "generated_image_as_proof",
  "unsupported_claim",
  "storage_error",
]);

const blocker = (code: DemoGateBlockerCode, message: string): DemoGateBlocker => ({ code, message, safety: SAFETY_CODES.has(code) });

/** True when every blocker may be overridden by an operator's manual force send. */
export function gateOverridable(result: DemoGateResult): boolean {
  return result.blockers.every((item) => !item.safety);
}

/** One line for prospect_outreach.reason details and the operator. */
export function gateSummary(result: DemoGateResult): string {
  return result.blockers.map((item) => item.message).join(" ");
}

/* ----------------------------- stored facts ----------------------------- */

export type DemoGateComponent = { id: string; sectionId: string; kind: string; mediaUrl: string | null; visible: boolean };
export type DemoGateSection = {
  id: string;
  pageId: string;
  kind: string;
  visible: boolean;
  heading: string | null;
  subheading: string | null;
  body: string | null;
  tree: CompositionTree | null;
  sortOrder: number;
};
export type DemoGatePage = { id: string; slug: string; title: string | null; visible: boolean };
export type DemoGateMedia = { url: string; source: string | null; category: string | null };

export type DemoGateFacts = {
  found: boolean;
  claimed: boolean;
  buildStatus: string | null;
  colors: { primary: string | null; secondary: string | null; accent: string | null };
  heroImage: string | null;
  seoCopy: string[];
  dna: DnaFacts;
  pages: DemoGatePage[];
  sections: DemoGateSection[];
  components: DemoGateComponent[];
  media: DemoGateMedia[];
  services: CompletenessService[];
};

const PROOF_SECTION = /(gallery|portfolio|before|after|work|project|case|testimonial|review|result|transformation|showcase)/i;
const PROOF_PAGE = /(^|[-_\s/])(gallery|portfolio|our-work|work|projects|results|reviews|testimonials)([-_\s/]|$)/i;
const PROOF_CATEGORY = new Set(["work", "before", "after"]);

function walk(node: CompositionNode, visit: (node: CompositionNode) => void) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
  for (const tab of node.tabs ?? []) for (const child of tab.children) walk(child, visit);
}

function visibleLayout(facts: DemoGateFacts) {
  const pages = facts.pages.filter((page) => page.visible);
  const pageIds = new Set(pages.map((page) => page.id));
  const sections = facts.sections.filter((section) => section.visible && pageIds.has(section.pageId)).sort((a, b) => a.sortOrder - b.sortOrder);
  const sectionIds = new Set(sections.map((section) => section.id));
  const components = facts.components.filter((component) => component.visible && sectionIds.has(component.sectionId));
  return { pages, sections, components };
}

/** Every picture a visitor can see: hero, block pictures and composition images (mediaRef resolved). */
export function visibleImageRefs(facts: DemoGateFacts): { ref: string; page: string; proof: boolean }[] {
  const { pages, sections, components } = visibleLayout(facts);
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const componentById = new Map(facts.components.map((component) => [component.id, component]));
  const out: { ref: string; page: string; proof: boolean }[] = [];
  const isProofPage = (page: DemoGatePage | undefined) => Boolean(page && PROOF_PAGE.test(`${page.slug} ${page.title ?? ""}`));
  if (facts.heroImage) out.push({ ref: facts.heroImage, page: "home", proof: false });
  for (const component of components) {
    if (!component.mediaUrl) continue;
    const section = sectionById.get(component.sectionId);
    const page = section ? pageById.get(section.pageId) : undefined;
    out.push({
      ref: component.mediaUrl,
      page: page?.slug ?? "home",
      proof: isProofPage(page) || PROOF_SECTION.test(section?.kind ?? "") || PROOF_SECTION.test(component.kind),
    });
  }
  for (const section of sections) {
    if (!section.tree) continue;
    const page = pageById.get(section.pageId);
    const sectionProof = isProofPage(page) || PROOF_SECTION.test(section.kind);
    const resolve = (image: { src?: string | undefined; mediaRef?: string | undefined } | undefined) => {
      if (!image) return null;
      if (image.mediaRef) return componentById.get(image.mediaRef)?.mediaUrl ?? null;
      return image.src?.trim() || null;
    };
    walk(section.tree.root, (node) => {
      const sliderProof = node.type === "before_after_slider";
      for (const image of [node, node.beforeImage, node.afterImage]) {
        const ref = resolve(image);
        if (ref) out.push({ ref, page: page?.slug ?? "home", proof: sectionProof || sliderProof });
      }
    });
  }
  const seen = new Set<string>();
  return out.filter((item) => {
    const key = `${item.ref}|${item.page}|${item.proof}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Visible words a prospect reads, for the claims screen. */
export function visibleCopy(facts: DemoGateFacts): string[] {
  const { pages, sections } = visibleLayout(facts);
  const lines = [...facts.seoCopy];
  for (const section of sections) lines.push(section.heading ?? "", section.subheading ?? "", section.body ?? "");
  for (const page of pages) {
    const trees = sections.filter((section) => section.pageId === page.id && section.tree).map((section) => section.tree!);
    if (trees.length) lines.push(pageText({ slug: page.slug, title: page.title, trees }));
  }
  return lines.map((line) => line.trim()).filter(Boolean);
}

/** WCAG AA pairs from the theme the site renders with its stored colours. */
export function contrastProblems(colors: DemoGateFacts["colors"]): string[] {
  const theme = (siteThemeStyle({ primaryColor: colors.primary, secondaryColor: colors.secondary, accentColor: colors.accent }) ?? {}) as Record<string, string>;
  const pairs: [string, string, string][] = [
    ["body text", theme["--foreground"] ?? "", theme["--background"] ?? ""],
    ["supporting text", theme["--muted-foreground"] ?? "", theme["--background"] ?? ""],
    ["button text", theme["--primary-foreground"] ?? "", theme["--primary"] ?? ""],
    ["accent text", theme["--accent-foreground"] ?? "", theme["--accent"] ?? ""],
  ];
  return pairs.map(([label, text, background]) => contrastPairProblem(label, text, background)).filter((item): item is string => item !== null);
}

/** One text/background pair against WCAG AA body text (4.5:1). Null when it passes. */
export function contrastPairProblem(label: string, text: string, background: string): string | null {
  const ratio = contrastRatio(text, background);
  // An unmeasurable pair (a CSS mix) is reported, never assumed readable.
  if (ratio === null) return `The ${label} colours couldn't be measured.`;
  return ratio < AA_NORMAL ? `The ${label} contrast is ${ratio.toFixed(2)}:1 (needs at least ${AA_NORMAL}:1).` : null;
}

/** Every deterministic check that needs no network. Image resolution is checked separately. */
export function assessDemoFacts(facts: DemoGateFacts): DemoGateBlocker[] {
  if (!facts.found) return [blocker("demo_not_found", "That demo site wasn't found.")];
  const out: DemoGateBlocker[] = [];
  if (facts.claimed) out.push(blocker("demo_claimed", "The business already claimed this demo, so it isn't prospect outreach any more."));
  if (facts.buildStatus !== "completed") out.push(blocker("build_not_finished", "The demo build hasn't finished, so there is no finished draft to show."));

  const generated = new Map<string, DemoGateMedia>();
  for (const row of facts.media) if ((row.source ?? "").trim().toLowerCase() === "generated") generated.set(row.url, row);
  const proofPages = new Set<string>();
  for (const image of visibleImageRefs(facts)) {
    const row = generated.get(image.ref);
    if (!row) continue;
    if (image.proof || PROOF_CATEGORY.has((row.category ?? "").trim().toLowerCase())) proofPages.add(image.page);
  }
  for (const page of proofPages)
    out.push(blocker("generated_image_as_proof", `The ${page} page shows an AI-generated picture where visitors expect real work (gallery, before/after or reviews).`));

  const claims = new Map<string, string>();
  for (const line of visibleCopy(facts))
    for (const issue of screenClaims(line, facts.dna)) if (!claims.has(issue.reason)) claims.set(issue.reason, issue.text);
  for (const [reason, text] of claims)
    out.push(blocker("unsupported_claim", `The draft makes an unsupported ${reason} (“${text}”) the business never supplied.`));

  for (const problem of contrastProblems(facts.colors)) out.push(blocker("low_contrast", problem));

  // The launch review's own blockers, from the same stored page tree.
  const { pages, sections } = visibleLayout(facts);
  const reviewPages: LaunchReviewPage[] = facts.pages.map((page) => ({
    slug: page.slug,
    visible: page.visible,
    sections: facts.sections
      .filter((section) => section.pageId === page.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((section) => ({
        kind: section.kind,
        visible: section.visible,
        components: facts.components
          .filter((component) => component.sectionId === section.id)
          .map((component) => ({ kind: component.kind, media_url: component.mediaUrl, visible: component.visible })),
      })),
  }));
  const completenessPages: CompletenessPage[] = pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    trees: sections.filter((section) => section.pageId === page.id && section.tree).map((section) => section.tree!),
  }));
  const seenReview = new Set<string>();
  for (const item of launchBlockers({
    pages: reviewPages,
    mediaSources: facts.media.map((row) => ({ url: row.url, source: row.source })),
    completeness: { pages: completenessPages, services: facts.services },
  })) {
    const key = `${item.code}|${item.page}`;
    if (seenReview.has(key)) continue;
    seenReview.add(key);
    out.push(blocker(item.code, item.detail));
  }
  return out;
}

/* ---------------------------- image resolution ---------------------------- */

export type ImageCheckOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** This project's storage origin (SUPABASE_URL). Only it is ever requested. */
  storageOrigin?: string | null;
  /** Signs private bucket paths; returns path -> URL (missing means unresolved). */
  sign?: (paths: string[]) => Promise<Map<string, string>>;
};

const MAX_IMAGE_CHECKS = 40;

async function headOk(url: string, fetcher: typeof fetch, timeoutMs: number): Promise<boolean> {
  try {
    let response = await fetcher(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 405) {
      response = await fetcher(url, { method: "GET", headers: { range: "bytes=0-0" }, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
      await response.body?.cancel().catch(() => undefined);
    }
    if (!response.ok) return false;
    const type = response.headers.get("content-type");
    return !type || type.toLowerCase().startsWith("image/") || type.toLowerCase().startsWith("application/octet-stream");
  } catch {
    return false;
  }
}

/** HEAD-checks every visible picture. Only same-origin storage URLs are fetched; anything else can't be verified. */
export async function imageBlockers(refs: { ref: string; page: string }[], options: ImageCheckOptions): Promise<DemoGateBlocker[]> {
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  let origin: string | null = null;
  try {
    origin = options.storageOrigin ? new URL(options.storageOrigin).origin : null;
  } catch {
    origin = null;
  }
  const unique = [...new Map(refs.map((item) => [item.ref, item])).values()];
  const out: DemoGateBlocker[] = [];
  const unverifiable = new Set<string>();
  const unresolved = new Set<string>();
  if (unique.length > MAX_IMAGE_CHECKS) {
    out.push(blocker("image_unverifiable", `The draft shows ${unique.length} pictures; only ${MAX_IMAGE_CHECKS} can be checked, so it needs a manual look.`));
  }
  const checked = unique.slice(0, MAX_IMAGE_CHECKS);
  const paths = checked.filter((item) => isStoragePath(item.ref)).map((item) => item.ref.replace(/^\/+/, ""));
  let signed = new Map<string, string>();
  if (paths.length) {
    try {
      signed = options.sign ? await options.sign(paths) : new Map();
    } catch {
      signed = new Map();
    }
  }
  const targets: { url: string; page: string }[] = [];
  for (const item of checked) {
    if (isStoragePath(item.ref)) {
      const url = signed.get(item.ref.replace(/^\/+/, ""));
      if (url) targets.push({ url, page: item.page });
      else unresolved.add(item.page);
      continue;
    }
    let parsed: URL | null = null;
    try {
      parsed = new URL(item.ref);
    } catch {
      parsed = null;
    }
    if (!parsed || !origin || parsed.origin !== origin || !parsed.pathname.startsWith("/storage/v1/")) {
      unverifiable.add(item.page);
      continue;
    }
    targets.push({ url: parsed.toString(), page: item.page });
  }
  for (let index = 0; index < targets.length; index += 6) {
    const batch = targets.slice(index, index + 6);
    const results = await Promise.all(batch.map((target) => headOk(target.url, fetcher, timeoutMs)));
    results.forEach((ok, offset) => {
      if (!ok) unresolved.add(batch[offset]!.page);
    });
  }
  for (const page of unresolved) out.push(blocker("image_unresolved", `A picture on the ${page} page doesn't load, so the prospect would see a broken image.`));
  for (const page of unverifiable)
    out.push(blocker("image_unverifiable", `A picture on the ${page} page is hosted outside this workspace's storage, so it can't be checked.`));
  return out;
}

/* ------------------------------- the gate ------------------------------- */

const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Reads the demo's stored site with the service-role client. Throws on a storage error. */
export async function loadDemoGateFacts(db: SupabaseClient, organizationId: string): Promise<DemoGateFacts> {
  const empty: DemoGateFacts = {
    found: false, claimed: false, buildStatus: null, colors: { primary: null, secondary: null, accent: null }, heroImage: null,
    seoCopy: [], dna: {}, pages: [], sections: [], components: [], media: [], services: [],
  };
  if (!ORG_ID.test(organizationId)) return empty;
  const [settings, org, profile, job, pages, sections, components, services, reviews, media] = await Promise.all([
    db.from("website_settings").select("generation, seo").eq("organization_id", organizationId).maybeSingle(),
    db.from("organizations").select("name, industry").eq("id", organizationId).maybeSingle(),
    db
      .from("business_profiles")
      .select("description, tagline, city, state, service_area, hero_image_url, certifications, awards, years_in_business, phone, email, primary_color, secondary_color, accent_color, testimonials")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    db.from("generation_jobs").select("status").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("website_pages").select("id, slug, title, is_visible").eq("organization_id", organizationId),
    db.from("website_sections").select("id, page_id, kind, is_visible, settings, sort_order, heading, subheading, body").eq("organization_id", organizationId),
    db.from("website_components").select("id, section_id, kind, media_url, is_visible").eq("organization_id", organizationId),
    db.from("services").select("name, description, price, starting_price").eq("organization_id", organizationId).eq("is_active", true),
    db.from("reviews").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_published", true),
    db.from("media").select("url, source, category").eq("organization_id", organizationId),
  ]);
  const failed = [settings, org, profile, job, pages, sections, components, services, media].find((response) => response.error);
  if (failed?.error) throw new Error(failed.error.message);

  const raw = (settings.data?.generation as Record<string, unknown> | null)?.["prospectDemo"];
  const marker = readProspectDemoMarker(raw);
  if (!marker || !org.data) return empty;
  const p = (profile.data ?? {}) as Record<string, unknown>;
  const seo = readSeo(settings.data?.seo) as Record<string, unknown>;
  const serviceRows = (services.data ?? []) as Array<{ name: string; description: string | null; price: number | null; starting_price: number | null }>;
  const testimonials = Array.isArray(p["testimonials"]) ? p["testimonials"].length : 0;
  const mediaRows = ((media.data ?? []) as Array<{ url: string | null; source: string | null; category: string | null }>).filter((row) => Boolean(row.url) && !isHeroVideoCategory(row.category));
  return {
    found: true,
    claimed: Boolean(str((raw as Record<string, unknown>)["claimedAt"])),
    buildStatus: str((job.data as { status?: unknown } | null)?.status),
    colors: { primary: str(p["primary_color"]), secondary: str(p["secondary_color"]), accent: str(p["accent_color"]) },
    heroImage: str(p["hero_image_url"]),
    seoCopy: ["headline", "subheadline", "meta_description", "primary_cta_label"].map((key) => str(seo[key]) ?? "").filter(Boolean),
    dna: {
      businessName: str(org.data.name),
      industry: str(org.data.industry),
      services: serviceRows.map((row) => row.name),
      description: str(p["description"]) ?? str(p["tagline"]),
      city: str(p["city"]),
      region: str(p["state"]),
      serviceArea: str(p["service_area"]),
      phone: str(p["phone"]),
      email: str(p["email"]),
      yearsInBusiness: Number(p["years_in_business"]) > 0 ? Number(p["years_in_business"]) : null,
      certifications: str(p["certifications"]),
      awards: str(p["awards"]),
      testimonialCount: (reviews.error ? 0 : reviews.count ?? 0) + testimonials,
      photoCount: mediaRows.length,
      hasPrices: serviceRows.some((row) => (row.price ?? 0) > 0 || (row.starting_price ?? 0) > 0),
    },
    pages: ((pages.data ?? []) as Array<{ id: string; slug: string; title: string | null; is_visible: boolean | null }>).map((row) => ({
      id: row.id, slug: row.slug, title: row.title, visible: row.is_visible !== false,
    })),
    sections: ((sections.data ?? []) as Array<{ id: string; page_id: string; kind: string; is_visible: boolean | null; settings: unknown; sort_order: number | null; heading?: string | null; subheading?: string | null; body?: string | null }>).map((row) => ({
      id: row.id,
      pageId: row.page_id,
      kind: String(row.kind),
      visible: row.is_visible !== false,
      heading: str(row.heading),
      subheading: str(row.subheading),
      body: str(row.body),
      tree: readComposition(row.settings),
      sortOrder: Number(row.sort_order ?? 0),
    })),
    components: ((components.data ?? []) as Array<{ id: string; section_id: string; kind: string; media_url: string | null; is_visible: boolean | null }>).map((row) => ({
      id: row.id, sectionId: row.section_id, kind: String(row.kind), mediaUrl: str(row.media_url), visible: row.is_visible !== false,
    })),
    media: mediaRows.map((row) => ({ url: row.url as string, source: row.source, category: row.category })),
    services: serviceRows.map((row) => ({ name: row.name, description: row.description, price: row.price, startingPrice: row.starting_price })),
  };
}

/**
 * The outreach quality gate. `ok` only when there are no blockers at all.
 * Callers: sendDemoOutreach (manual and autopilot) and the autopilot enqueue.
 * A storage error fails closed (a safety blocker), never open.
 */
export async function assessDemoForOutreach(
  db: SupabaseClient,
  organizationId: string,
  options: ImageCheckOptions = {},
): Promise<DemoGateResult> {
  let facts: DemoGateFacts;
  try {
    facts = await loadDemoGateFacts(db, organizationId);
  } catch {
    return { ok: false, blockers: [blocker("storage_error", "The demo couldn't be read to check it, so nothing is sent.")] };
  }
  const blockers = assessDemoFacts(facts);
  if (facts.found) {
    const sign =
      options.sign ??
      (async (paths: string[]) => {
        const map = new Map<string, string>();
        const { data } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 600);
        for (const entry of data ?? []) if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
        return map;
      });
    const storageOrigin = options.storageOrigin === undefined ? process.env["SUPABASE_URL"] ?? null : options.storageOrigin;
    blockers.push(...(await imageBlockers(visibleImageRefs(facts), { ...options, sign, storageOrigin })));
  }
  return { ok: blockers.length === 0, blockers };
}
