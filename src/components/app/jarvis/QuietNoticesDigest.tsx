import { useState } from "react";
import { BellOff, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventNoticeCard } from "./EventNoticeCard";
import { quietDigestLabel, type QuietDigestRow } from "@/lib/jarvis-quiet-digest";

/**
 * JC-46: one collapsible "N quiet notices" row for adjacent quiet system events
 * (Dependabot and any future quiet rules). Expands to the individual muted cards.
 */
export function QuietNoticesDigest({
  rows,
  busy,
  onAsk,
}: {
  rows: QuietDigestRow[];
  busy?: boolean;
  onAsk?: ((prompt: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  if (rows.length === 1) {
    const only = rows[0]!;
    return <EventNoticeCard id={only.id} notice={only.notice} busy={busy} onAsk={onAsk} />;
  }
  const label = quietDigestLabel(rows.length);
  return (
    <aside aria-label={label} className="min-w-0 rounded-lg border border-border/60 bg-muted/20">
      <Button
        type="button"
        variant="ghost"
        className="flex h-auto min-h-11 w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BellOff className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-medium">{label}</span>
        {open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
      </Button>
      {open ? (
        <ul className="space-y-1.5 border-t border-border/50 px-2 py-2">
          {rows.map((row) => (
            <li key={row.id}>
              <EventNoticeCard id={row.id} notice={row.notice} busy={busy} onAsk={onAsk} />
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
