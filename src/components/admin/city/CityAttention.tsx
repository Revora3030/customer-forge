import { AlertTriangle, Clock3, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CITY_DISTRICTS, FAILURE_CAUSE_HINT, ageLabel, groupAttention, type AttentionItem, type CityWork, type FailureGroup } from "@/lib/ai-city";

/**
 * "Needs you": every failed or waiting record the City could read. Failures
 * that share a cause are one row ("100 failed · same cause"), with a one-tap
 * Jarvis triage draft and a dismiss that only hides failures recorded so far.
 * It only restates saved records; when the records could not be read it says so
 * instead of showing an empty, calm list.
 */
export function CityAttention({ items, available, onOpen, onClear, onTriage, onDismiss, limit = 6 }: { items: readonly AttentionItem[]; available: boolean; onOpen: (row: CityWork) => void; onClear?: () => void; onTriage?: (group: FailureGroup) => void; onDismiss?: (key: string) => void; limit?: number }) {
  if (!available) return <section aria-label="Needs you" className="rounded-md border border-border p-4"><h2 className="text-xs font-semibold uppercase">Needs you</h2><p role="status" className="mt-2 text-sm text-destructive">Records unavailable, so nothing can be ruled out.</p></section>;
  const failedItems = items.filter((item) => item.kind === "failed");
  const failed = failedItems.length;
  const groups = groupAttention(items);
  const waiting = items.filter((item) => item.kind === "waiting");
  const rowsShown = [
    ...groups.map((group) => ({ type: "group" as const, group })),
    ...waiting.map((item) => ({ type: "waiting" as const, item })),
  ];
  const summary = `${failed} failed${groups.length && groups.length < failed ? ` (${groups.length} cause${groups.length === 1 ? "" : "s"})` : ""} · ${waiting.length} waiting · last 48 hours`;
  return (
    <section aria-label="Needs you" className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase">Needs you</h2>
        <p className="text-xs text-muted-foreground">{items.length ? summary : "Nothing failed or waiting in the records read"}</p>
        {onClear && failed ? <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onClear}>Dismiss all failures seen so far</Button> : null}
      </div>
      {items.length ? (
        <ul className="mt-2 divide-y divide-border">
          {rowsShown.slice(0, limit).map((entry) => {
            if (entry.type === "waiting") {
              const item = entry.item;
              const district = CITY_DISTRICTS.find((d) => d.id === item.district);
              return (
                <li key={item.row.id}>
                  <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-1 py-2 text-left" onClick={() => onOpen(item.row)}>
                    <span className="flex min-w-0 items-start gap-2">
                      <Clock3 className="mt-0.5 size-4 shrink-0 text-gold" aria-label="Waiting" />
                      <span className="min-w-0"><span className="block break-words text-sm">{item.row.title}</span><span className="block text-[11px] text-muted-foreground">{district?.name} · {item.row.status}</span></span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ageLabel(item.ageMs)}</span>
                  </Button>
                </li>
              );
            }
            const { group } = entry;
            const district = CITY_DISTRICTS.find((d) => d.id === group.district);
            return (
              <li key={group.key} className="py-1">
                <Button variant="ghost" className="h-auto min-h-11 w-full justify-between gap-3 whitespace-normal px-1 py-2 text-left" onClick={() => onOpen(group.latest)}>
                  <span className="flex min-w-0 items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Failed" />
                    <span className="min-w-0">
                      <span className="block break-words text-sm">{group.count > 1 ? `${group.count}× ` : ""}{group.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{district?.name} · failed{group.count > 1 ? ` · newest ${ageLabel(group.ageMs)} ago` : ""}</span>
                      {group.cause ? <span className="mt-1 block text-[11px] text-muted-foreground">{FAILURE_CAUSE_HINT[group.cause]}</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ageLabel(group.ageMs)}</span>
                </Button>
                {onTriage || onDismiss ? (
                  <div className="flex flex-wrap gap-2 pl-6 pb-1">
                    {onTriage ? <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => onTriage(group)}><Sparkles className="size-4 text-gold" /> Triage with Jarvis</Button> : null}
                    {onDismiss ? <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => onDismiss(group.key)}><X className="size-4" /> Dismiss</Button> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {rowsShown.length > limit ? <p className="mt-2 text-[11px] text-muted-foreground">Showing the {limit} most urgent of {rowsShown.length}.</p> : null}
    </section>
  );
}
