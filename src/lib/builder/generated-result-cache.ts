export const GENERATED_RESULT_QUERY_KEYS = [
  "website_content", "website_settings", "website_versions", "business_profile",
  "score_facts", "build_readiness", "notifications",
] as const;

/** Pull the actual generated rows into every customer surface at completion. */
export function refreshGeneratedResult(cache: { invalidateQueries: (filters: { queryKey: readonly string[] }) => Promise<unknown> }) {
  return Promise.all(GENERATED_RESULT_QUERY_KEYS.map((key) => cache.invalidateQueries({ queryKey: [key] })));
}