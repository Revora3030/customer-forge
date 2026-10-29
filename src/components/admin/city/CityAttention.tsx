import { AlertTriangle, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CITY_DISTRICTS, ageLabel, type AttentionItem, type CityWork } from "@/lib/ai-city";

/**
 * "Needs you": every failed or waiting record the City could read, failures
 * first and the longest-standing next. It only restates saved records; when the
 * records could not be read it says so instead of showing an empty, calm list.
 */
export function CityAttention({ items, available, onOpen, onClear, limit = 6 }: { items: readonly AttentionItem[]; available: boolean; onOpen: (row: CityWork) => void; onClear?: () => void; limit?: number }) {
  if (!available) return <section aria-label="Needs you" className="rounded-md border border-border p-4"><h2 className="text-xs font-semibold uppercase">Needs you</h2><p role="status" className="mt-2 text-sm text-destructive">Records unavailable, so nothing can be ruled out.</p></section>;
  const failed = items.filter((item) => item.kind === "failed").length;
  return (
    <section aria-label="Needs you" className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase">Needs you</h2>
        <p className="text-xs text-muted-foreground">{items.length ? `${failed} failed · ${items.length - failed} waiting · last 48 hours` : "Nothing failed or waiting in the records read"}</p>
        {onClear && items.length ? <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onClear}>Clear resolved alerts</Button> : null}
      </div>
      {items.length ? (
        <ul className="mt-2 divide-y divide-border">
          {items.slice(0, limit).map((item) => {
            const district = CITY_DISTRICTS.find((d) => d.id === item.district);
            return (
              <li key={item.row.id}>
                <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-1 py-2 text-left" onClick={() => onOpen(item.row)}>
                  <span className="flex min-w-0 items-start gap-2">
                    {item.kind === "failed" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Failed" /> : <Clock3 className="mt-0.5 size-4 shrink-0 text-gold" aria-label="Waiting" />}
                    <span className="min-w-0"><span className="block break-words text-sm">{item.row.title}</span><span className="block text-[11px] text-muted-foreground">{district?.name} · {item.row.status}</span></span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ageLabel(item.ageMs)}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {items.length > limit ? <p className="mt-2 text-[11px] text-muted-foreground">Showing the {limit} most urgent of {items.length}.</p> : null}
    </section>
  );
}
