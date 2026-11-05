/** In-memory stand-in for the Supabase query builder, for business memory tests. */
export type Row = { id?: unknown; organization_id?: unknown; status?: unknown; action?: unknown; deleted_at?: unknown; memory_id?: unknown; [column: string]: unknown };
type Tables = { business_memory: Row[]; business_memory_events: Row[]; business_memory_embeddings: Row[]; website_memory: Row[] } & Record<string, Row[]>;

/** Tiny in-memory stand-in for the Supabase query builder: insert, select, update, eq, is, in, order, limit. */
export function fakeDb(seed: Record<string, Row[]> = {}, rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const tables: Tables = { business_memory: [], business_memory_events: [], business_memory_embeddings: [], website_memory: [], ...seed };
  let counter = 0;
  const builder = (name: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row = {};
    let max = Infinity;
    const run = () => {
      const table = (tables[name] ??= []);
      if (mode === "insert") {
        const row: Row = { id: `id-${++counter}`, status: "proposed", deleted_at: null, superseded_by: null, confirmed_by: null, confirmed_at: null, created_at: new Date(1_000_000 + counter).toISOString(), updated_at: "now", source_quote: null, fetched_at: null, ...payload };
        table.push(row);
        return [row];
      }
      if (mode === "upsert") {
        const at = table.findIndex((row) => row.memory_id === payload.memory_id);
        if (at >= 0) table[at] = { ...table[at], ...payload };
        else table.push({ ...payload });
        return [payload];
      }
      const hits = table.filter((row) => filters.every((f) => f(row)));
      if (mode === "update") hits.forEach((row) => Object.assign(row, payload));
      return hits.slice(0, max).map((row) => ({ ...row }));
    };
    const api: Record<string, unknown> = {
      insert: (row: Row) => { mode = "insert"; payload = row; return api; },
      upsert: (row: Row) => { mode = "upsert"; payload = row; return api; },
      update: (row: Row) => { mode = "update"; payload = row; return api; },
      select: () => api,
      eq: (col: string, value: unknown) => { filters.push((row) => row[col] === value); return api; },
      is: (col: string, value: unknown) => { filters.push((row) => (row[col] ?? null) === value); return api; },
      in: (col: string, values: unknown[]) => { filters.push((row) => values.includes(row[col])); return api; },
      order: (col: string, opts?: { ascending?: boolean }) => {
        const prev = run;
        const sorted = () => {
          const out = prev();
          out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (opts?.ascending === false ? -1 : 1));
          return out;
        };
        (api as { _run: () => Row[] })._run = sorted;
        return api;
      },
      limit: (n: number) => { max = n; return api; },
      single: () => { const out = ((api as { _run?: () => Row[] })._run ?? run)(); return Promise.resolve(out[0] ? { data: out[0], error: null } : { data: null, error: { message: "no rows" } }); },
      maybeSingle: () => { const out = ((api as { _run?: () => Row[] })._run ?? run)(); return Promise.resolve({ data: out[0] ?? null, error: null }); },
      then: (resolve: (value: unknown) => unknown) => resolve({ data: ((api as { _run?: () => Row[] })._run ?? run)(), error: null }),
    };
    return api;
  };
  const db = {
    from: (name: string) => builder(name),
    rpc: (name: string, args: Record<string, unknown>) => Promise.resolve(rpc ? rpc(name, args) : { data: [], error: null }),
  };
  return { db: db as never, tables };
}

