import type { QueryClient } from "@tanstack/react-query";

const BUILDER_QUERY_KEYS = new Set([
  "generation_job", "website_settings", "website_versions",
  "website_content", "site_pages", "build_readiness", "notifications",
]);

export function isBuilderQueryKey(key: readonly unknown[]): boolean {
  return typeof key[0] === "string" && BUILDER_QUERY_KEYS.has(key[0]);
}

/** Re-read persisted state after Safari resumes; never enqueue or replay edits. */
export function installBuilderResumeSync(
  client: QueryClient,
  page: Window,
  doc: Document,
): () => void {
  let disposed = false;
  let pending = false;
  const refresh = () => {
    if (disposed || pending || doc.visibilityState === "hidden" || page.navigator.onLine === false) return;
    pending = true;
    void client.invalidateQueries({
      predicate: (query) => isBuilderQueryKey(query.queryKey),
      refetchType: "active",
    }).catch(() => {
      console.warn("[builder] Resume refresh failed; existing query retry policy remains active.");
    }).finally(() => { pending = false; });
  };
  doc.addEventListener("visibilitychange", refresh);
  page.addEventListener("focus", refresh);
  page.addEventListener("pageshow", refresh);
  page.addEventListener("online", refresh);
  return () => {
    disposed = true;
    doc.removeEventListener("visibilitychange", refresh);
    page.removeEventListener("focus", refresh);
    page.removeEventListener("pageshow", refresh);
    page.removeEventListener("online", refresh);
  };
}
