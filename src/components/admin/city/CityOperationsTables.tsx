import { Button } from "@/components/ui/button";
import type { CitySnapshot, CityWork } from "@/lib/ai-city";
import { activeRuns, districtCountRows, replayTableRows } from "@/lib/city-fallback";

const timeLabel = (at: number) => new Date(at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const cell = (value: number | null | undefined) => (value === null || value === undefined ? "Unavailable" : String(value));

/**
 * JC-17: the Operations view's text twin of the 3D scene. Same counts, one list
 * entry per running record (an avatar's worth), and the replay events as a table.
 */
export function CityOperationsTables({ snapshot, now, onOpen }: { snapshot: CitySnapshot | undefined; now: number; onOpen: (row: CityWork) => void }) {
  const counts = districtCountRows(snapshot, now);
  const runs = activeRuns(snapshot, now);
  const events = replayTableRows(snapshot, now);
  return (
    <section aria-label="City in text" className="space-y-4" data-testid="city-operations-tables">
      <table className="w-full text-left text-xs">
        <caption className="mb-1 text-left text-sm font-semibold">Districts</caption>
        <thead className="text-muted-foreground"><tr><th scope="col" className="py-1 pr-2">District</th><th scope="col" className="px-2">Running</th><th scope="col" className="px-2">Waiting</th><th scope="col" className="px-2">Failed</th><th scope="col" className="px-2">Records</th></tr></thead>
        <tbody>{counts.map((d) => <tr key={d.id} className="border-t border-border"><th scope="row" className="py-1 pr-2 font-medium">{d.name}</th><td className="px-2">{cell(d.counts?.running)}</td><td className="px-2">{cell(d.counts?.queued)}</td><td className="px-2">{cell(d.counts?.errors)}</td><td className="px-2">{cell(d.counts?.total)}</td></tr>)}</tbody>
      </table>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Running now ({snapshot ? runs.length : "unavailable"})</h3>
        {!snapshot ? <p className="text-xs text-muted-foreground">City records could not be read.</p> : runs.length === 0 ? <p className="text-xs text-muted-foreground">Nothing is running right now.</p> : <ul className="divide-y divide-border text-xs" aria-label="Running now">{runs.map((row) => <li key={row.id}><Button type="button" variant="ghost" className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal py-2 text-left" onClick={() => onOpen(row)}><span className="min-w-0 break-words">{row.title}</span><span className="shrink-0 text-muted-foreground">{row.district} · {row.source}</span></Button></li>)}</ul>}
      </div>
      <table className="w-full text-left text-xs">
        <caption className="mb-1 text-left text-sm font-semibold">Replay events, last 48h</caption>
        <thead className="text-muted-foreground"><tr><th scope="col" className="py-1 pr-2">When</th><th scope="col" className="px-2">Event</th><th scope="col" className="px-2">District</th><th scope="col" className="px-2">Record</th></tr></thead>
        <tbody>
          {!snapshot ? <tr><td colSpan={4} className="py-2 text-muted-foreground">Unavailable</td></tr> : events.length === 0 ? <tr><td colSpan={4} className="py-2 text-muted-foreground">No failures, approvals, publishes or CI events recorded in this window.</td></tr> : events.map((e) => <tr key={e.row.id} className="border-t border-border"><td className="py-1 pr-2 whitespace-nowrap">{timeLabel(e.at)}</td><td className="px-2">{e.label}</td><td className="px-2">{e.district}</td><td className="px-2"><button type="button" className="min-h-11 text-left underline" onClick={() => onOpen(e.row)}>{e.title}</button></td></tr>)}
        </tbody>
      </table>
    </section>
  );
}
