import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getCityMemoryHealth } from "@/lib/ai-city-panels.functions";
import { countLabel, type MemoryHealth as MemoryHealthData } from "@/lib/ai-city-panels";

/**
 * JC-27: how healthy the saved owner notes are. Counts only; nothing is edited
 * or removed here. Review opens the memory manager (JC-41) once it exists.
 */
export function MemoryHealth() {
  const load = useServerFn(getCityMemoryHealth);
  const query = useQuery({ queryKey: ["admin-city-memory-health"], queryFn: () => load(), refetchInterval: 300_000 });
  return <MemoryHealthView data={query.data} loading={query.isLoading} failed={query.isError} />;
}

export function MemoryHealthView({ data, loading, failed }: { data: MemoryHealthData | undefined; loading: boolean; failed: boolean }) {
  if (loading) return <p className="mt-2 text-xs text-muted-foreground">Loading memory health…</p>;
  if (failed || !data) return <p role="alert" className="mt-2 text-xs text-destructive">Memory health unavailable.</p>;
  return (
    <div className="mt-2 space-y-2">
      <ul className="grid grid-cols-3 gap-2 text-center" aria-label="Memory counts">
        <li className="rounded-md border border-border p-2">
          <p className="font-display text-lg font-semibold">{countLabel(data.saved)}</p>
          <p className="text-xs text-muted-foreground">Saved</p>
        </li>
        <li className="rounded-md border border-border p-2">
          <p className="font-display text-lg font-semibold">—</p>
          <p className="text-xs text-muted-foreground">Contradictions</p>
          <p className="text-xs text-muted-foreground">not recorded</p>
        </li>
        <li className="rounded-md border border-border p-2">
          <p className="font-display text-lg font-semibold">{countLabel(data.stale)}</p>
          <p className="text-xs text-muted-foreground">Stale · {data.staleDays}d+</p>
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        {data.replaced === null ? "Replaced-by-newer notes: not readable yet." : `${data.replaced} note${data.replaced === 1 ? "" : "s"} replaced by a newer one.`}
      </p>
      {data.managerRoute ? (
        <Link to={data.managerRoute} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm">Review</Link>
      ) : (
        <button type="button" disabled aria-describedby="memory-review-note" className="inline-flex min-h-11 cursor-not-allowed items-center rounded-md border border-border px-3 text-sm text-muted-foreground opacity-60">Review</button>
      )}
      {data.managerRoute ? null : <p id="memory-review-note" className="text-xs text-muted-foreground">The memory manager (JC-41) isn't built yet, so there is nothing to open. No contradiction check records anything yet.</p>}
      <p className="text-xs text-muted-foreground">Read-only: nothing is edited, merged or deleted from here. Stale means not updated in {data.staleDays} days.</p>
    </div>
  );
}
