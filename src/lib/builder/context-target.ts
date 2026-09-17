import type { AgentContext } from "@/lib/site-agent.server";

export type SiteContextTarget = {
  pageId: string | null;
  pageTitle: string | null;
  sectionId: string | null;
  sectionKind: string | null;
  confidence: "explicit" | "fallback" | "none";
};

const clean = (value: string) => value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");

/** Resolve explicit page/section language to IDs already present in the tenant-scoped context. */
export function resolveSiteContextTarget(
  context: AgentContext,
  instruction: string,
): SiteContextTarget {
  const value = clean(instruction);
  const pages = context.pages;

  const page = pages.find((candidate) => {
    const title = clean(candidate.title);
    const slug = clean(candidate.slug);
    const kind = clean(candidate.kind);
    return (
      (title.length > 1 && value.includes(title)) ||
      (slug.length > 0 && value.includes(slug)) ||
      (kind.length > 1 && value.includes(`${kind} page`))
    );
  });

  const selectedPage = page ?? pages.find((candidate) => clean(candidate.kind) === "home") ?? null;
  if (!selectedPage) {
    return { pageId: null, pageTitle: null, sectionId: null, sectionKind: null, confidence: "none" };
  }

  const section = selectedPage.sections.find((candidate) => {
    const kind = clean(candidate.kind);
    return kind.length > 1 && (value.includes(`the ${kind}`) || value.includes(`${kind} section`));
  });

  return {
    pageId: selectedPage.id,
    pageTitle: selectedPage.title,
    sectionId: section?.id ?? null,
    sectionKind: section?.kind ?? null,
    confidence: page || section ? "explicit" : "fallback",
  };
}

/** Turn a resolved target into a short planning hint without exposing internal IDs. */
export function targetPlanningHint(target: SiteContextTarget): string {
  if (!target.pageTitle) return "Target scope: no page is currently available.";
  const section = target.sectionKind ? `, specifically the ${target.sectionKind} section` : "";
  const confidence = target.confidence === "explicit" ? "explicitly requested" : "defaulted to the existing homepage";
  return `Target scope: ${target.pageTitle}${section} (${confidence}).`;
}
