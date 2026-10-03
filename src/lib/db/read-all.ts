/**
 * Reads every row a query matches, page by page.
 *
 * Supabase/PostgREST returns at most 1,000 rows per request by default. The
 * builder read pages, sections and components without paging, so on a large
 * site it silently saw only part of the website: edits marked real sections as
 * "stale", and restore points and undo snapshots were missing rows.
 *
 * `build` must return a fresh query each call (the builder is consumed by
 * `.range`). Results keep the query's own ordering; add an `.order("id")` tie
 * breaker for a stable page boundary.
 */
export const READ_ALL_PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
type Ranged<T> = { range: (from: number, to: number) => Page<T> };

export async function readAll<T>(
  build: () => Ranged<T>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<{ data: T[]; error: unknown }> {
  const size = Math.max(1, options.pageSize ?? READ_ALL_PAGE);
  const max = options.maxRows ?? 50_000;
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) return { data: out, error };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return { data: out, error: null };
}
