/**
 * Versioned, AI-authored website contract.
 *
 * New builds use this contract end-to-end:
 * Sol -> contract -> Terra review/repair -> safety validation -> materializer.
 *
 * It is intentionally open-ended on creative values. Security/accessibility
 * validators may reject unsafe output, but they never choose a replacement
 * aesthetic. Legacy AiDesignContract/fingerprint data remains readable only
 * for already-published sites.
 */

export const CREATIVE_SITE_CONTRACT_VERSION = 1 as const;
export const CREATIVE_SITE_AUTHORITY = "sol" as const;

export type CreativeComponent = {
  id: string;
  kind: string;
  label?: string | null;
  body?: string | null;
  linkLabel?: string | null;
  linkUrl?: string | null;
  mediaUrl?: string | null;
  settings?: Record<string, unknown>;
};

export type CreativeResponsiveState = {
  /** AI-authored order; no fixed mobile layout is inferred by the runtime. */
  order?: string[];
  /** Open visual/layout data. Runtime only applies safety constraints. */
  visual?: Record<string, unknown>;
  /** Open interaction data. */
  interactions?: Record<string, unknown>;
};

export type CreativeSection = {
  id: string;
  role: string;
  intent: string;
  content?: {
    heading?: string | null;
    subheading?: string | null;
    body?: string | null;
    components?: CreativeComponent[];
  };
  visual?: Record<string, unknown>;
  media?: {
    required?: boolean;
    assetId?: string | null;
    presentation?: Record<string, unknown>;
  };
  responsive?: Record<string, CreativeResponsiveState>;
  interactions?: Record<string, unknown>;
};

export type CreativePage = {
  id: string;
  slug: string;
  title: string;
  purpose: string;
  primaryAction?: string | null;
  sections: CreativeSection[];
  seo?: {
    title?: string | null;
    description?: string | null;
    imageUrl?: string | null;
  };
};

export type CreativeSiteContract = {
  version: typeof CREATIVE_SITE_CONTRACT_VERSION;
  revision: number;
  authority: typeof CREATIVE_SITE_AUTHORITY;
  directedBy: string;
  reviewedBy: string | null;
  complete: boolean;
  /** Continuation metadata for large plans; chunks are merged by stable ids. */
  continuation?: {
    chunkIndex: number;
    totalChunks?: number;
    cursor?: string | null;
    hasMore: boolean;
  };
  identity: {
    concept: string;
    typography?: Record<string, unknown>;
    color?: Record<string, unknown>;
    backgrounds?: unknown[];
    spacing?: Record<string, unknown>;
    grid?: Record<string, unknown>;
    navigation?: Record<string, unknown>;
    motion?: Record<string, unknown>;
    artDirection?: Record<string, unknown>;
  };
  pages: CreativePage[];
  global?: {
    conversion?: Record<string, unknown>;
    accessibility?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
};

const forbiddenKeys = new Set([
  "template",
  "templates",
  "templateid",
  "template_id",
  "preset",
  "presets",
  "presetid",
  "preset_id",
  "fallback",
  "defaultlayout",
  "default_layout",
]);

const unsafeMarkup = /<\/?(?:script|iframe|object|embed|style)\b|javascript:|data:text\/html/i;

function scan(value: unknown, path: string, violations: string[]) {
  if (typeof value === "string") {
    if (unsafeMarkup.test(value)) violations.push(`${path}: unsafe markup or URL`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, i) => scan(entry, `${path}[${i}]`, violations));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKeys.has(key.toLowerCase()))
      violations.push(`${path}.${key}: deterministic template authority is forbidden`);
    scan(entry, `${path}.${key}`, violations);
  }
}

export function validateCreativeSiteContract(contract: unknown): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return { valid: false, violations: ["contract must be an object"] };
  }

  const candidate = contract as Record<string, unknown>;
  if (candidate["version"] !== CREATIVE_SITE_CONTRACT_VERSION) violations.push("unsupported contract version");
  if (candidate["authority"] !== CREATIVE_SITE_AUTHORITY) violations.push("authority must be Sol");
  if (candidate["complete"] !== true) violations.push("contract is incomplete");
  if (!Number.isInteger(candidate["revision"]) || Number(candidate["revision"]) < 1) violations.push("revision must be a positive integer");
  if (!candidate["identity"] || typeof candidate["identity"] !== "object" || Array.isArray(candidate.identity)) {
    violations.push("identity is required");
  } else {
    const identity = candidate.identity as Record<string, unknown>;
    const concept = identity["concept"];
    if (typeof concept !== "string" || !concept.trim()) violations.push("identity.concept is required");
  }

  const pages = candidate["pages"];
  if (!Array.isArray(pages)) {
    violations.push("pages must be an array");
  } else if (!pages.length) {
    violations.push("at least one page is required");
  }

  const pageIds = new Set<string>();
  const slugs = new Set<string>();

  for (const rawPage of Array.isArray(pages) ? pages : []) {
    if (!rawPage || typeof rawPage !== "object" || Array.isArray(rawPage)) {
      violations.push("page must be an object");
      continue;
    }
    const page = rawPage as Record<string, unknown>;
    const pageId = typeof page["id"] === "string" ? page["id"] : "";
    const slug = typeof page["slug"] === "string" ? page["slug"] : "";
    if (!pageId || pageIds.has(pageId)) violations.push(`duplicate or missing page id: ${pageId || "(missing)"}`);
    pageIds.add(pageId);
    if (!slug || slugs.has(slug)) violations.push(`duplicate or missing page slug: ${slug || "(missing)"}`);
    slugs.add(slug);

    const sections = page["sections"];
    if (!Array.isArray(sections)) {
      violations.push(`page ${slug || "(unknown)"} sections must be an array`);
      continue;
    }
    if (!sections.length) violations.push(`page ${slug || "(unknown)"} has no sections`);
    const sectionIds = new Set<string>();

    for (const rawSection of sections) {
      if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) {
        violations.push(`page ${slug || "(unknown)"} section must be an object`);
        continue;
      }
      const section = rawSection as Record<string, unknown>;
      const sectionId = typeof section["id"] === "string" ? section["id"] : "";
      const role = typeof section["role"] === "string" ? section["role"] : "";
      const intent = typeof section["intent"] === "string" ? section["intent"] : "";
      if (!sectionId || sectionIds.has(sectionId))
        violations.push(`duplicate or missing section id on ${slug || "(unknown)"}: ${sectionId || "(missing)"}`);
      sectionIds.add(sectionId);
      if (!role.trim()) violations.push(`section ${sectionId || "(missing)"} has no role`);
      if (!intent.trim()) violations.push(`section ${sectionId || "(missing)"} has no intent`);
      const responsive = section["responsive"];
      if (responsive !== undefined && (responsive === null || typeof responsive !== "object" || Array.isArray(responsive))) {
        violations.push(`section ${sectionId || "(missing)"} responsive must be an object`);
      } else {
        for (const width of Object.keys((responsive ?? {}) as Record<string, unknown>)) {
          if (!/^\d{3,4}$/.test(width)) violations.push(`invalid responsive width ${width}`);
        }
      }
    }
  }

  scan(candidate, "contract", violations);
  return { valid: violations.length === 0, violations };
}

/** Merge continuation chunks without silently losing deliberate staged changes. */
export function mergeCreativeSiteContracts(
  base: CreativeSiteContract,
  chunk: CreativeSiteContract,
): CreativeSiteContract {
  if (base.version !== chunk.version) throw new Error("creative contract version mismatch");
  const pages = new Map(base.pages.map((page) => [page.id, page]));
  for (const incoming of chunk.pages) {
    const existing = pages.get(incoming.id);
    if (!existing) {
      pages.set(incoming.id, incoming);
      continue;
    }
    const sections = new Map(existing.sections.map((section) => [section.id, section]));
    for (const section of incoming.sections) sections.set(section.id, section);
    pages.set(incoming.id, { ...existing, ...incoming, sections: [...sections.values()] });
  }
  return {
    ...base,
    ...chunk,
    revision: Math.max(base.revision, chunk.revision),
    complete: chunk.continuation?.hasMore === false ? chunk.complete : base.complete && chunk.complete,
    pages: [...pages.values()],
  };
}
