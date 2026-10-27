import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CITY_DISTRICTS, activityFeed, ageLabel, type CitySnapshot, type CityWork, type DistrictId } from "@/lib/ai-city";

/** Newest-first recorded activity across all districts, searchable and narrowable by district. */
export function CityActivity({ snapshot, now, onOpen }: { snapshot: CitySnapshot | undefined; now: number; onOpen: (row: CityWork) => void }) {
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState<DistrictId | null>(null);
  const rows = useMemo(() => activityFeed(snapshot, { district, query, limit: 40 }), [snapshot, district, query]);
  const all = useMemo(() => activityFeed(snapshot, { limit: 10_000 }).length, [snapshot]);
  if (!snapshot) return <p role="alert" className="py-4 text-sm text-destructive">Activity is unavailable because the City records could not be read.</p>;
  return (
    <div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" aria-label="Search recorded activity" placeholder="Search title, model, status, source…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 pl-9" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by district">
        <Button size="sm" variant={district === null ? "secondary" : "ghost"} aria-pressed={district === null} onClick={() => setDistrict(null)}>All</Button>
        {CITY_DISTRICTS.map((d) => <Button key={d.id} size="sm" variant={district === d.id ? "secondary" : "ghost"} aria-pressed={district === d.id} onClick={() => setDistrict(d.id)}>{d.name}</Button>)}
      </div>
      <p role="status" className="mt-3 text-xs text-muted-foreground">Showing {rows.length} of {all} recorded entries (each source keeps its latest 100).</p>
      {rows.length ? (
        <ul className="mt-1 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id}>
              <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-1 py-2 text-left" onClick={() => onOpen(row)}>
                <span className="min-w-0"><span className="block break-words text-sm">{row.title}</span><span className="block text-[11px] text-muted-foreground">{CITY_DISTRICTS.find((d) => d.id === row.district)?.name} · {row.source} · {row.status}{row.model ? ` · ${row.model}` : ""}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{ageLabel(Math.max(0, now - Date.parse(row.at)))}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="py-4 text-sm text-muted-foreground">No recorded entries match.</p>}
    </div>
  );
}
