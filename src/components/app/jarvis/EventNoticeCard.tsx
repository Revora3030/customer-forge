import { useEffect, useState } from "react";
import { Bell, BellOff, ExternalLink, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventNotice } from "@/lib/jarvis-event-notice";

const RUN_LINK = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+/;
const STORE = "revora:jarvis-notices-dismissed";

/** Notices the owner dismissed on this device. The message itself stays in the history. */
function readDismissed(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(-300) : [];
  } catch { return []; }
}

export function EventNoticeCard({ id, notice, time, busy, onAsk }: { id: string; notice: EventNotice; time?: string; busy?: boolean; onAsk?: ((prompt: string) => void) | undefined }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(readDismissed().includes(id)); }, [id]);
  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(STORE, JSON.stringify([...readDismissed(), id].slice(-300))); } catch { /* storage unavailable */ }
  };
  const link = RUN_LINK.exec(notice.summary)?.[0];
  const text = notice.summary.replace(RUN_LINK, "").replace(/\s+/g, " ").trim();
  const ask = notice.prompt && onAsk ? (
    <Button type="button" size="sm" variant={notice.quiet ? "ghost" : "signal"} className="min-h-11" disabled={busy} data-jarvis-tap="" onClick={() => onAsk(notice.prompt!)}>
      <Sparkles className="size-4" aria-hidden /> {notice.quiet ? "Ask Jarvis anyway" : "Ask Jarvis to triage"}
    </Button>
  ) : null;
  if (hidden) return <p className="flex min-h-11 items-center text-xs text-muted-foreground">Dismissed: {notice.label} · {notice.subject}</p>;
  if (notice.quiet) {
    return (
      <aside aria-label={`System event: ${notice.label}`} className="flex min-w-0 flex-wrap items-center gap-x-2 rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
        <BellOff className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate" title={text}>{notice.label}: {text}</span>
        {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 underline-offset-2 hover:underline">Run <ExternalLink className="size-3" aria-hidden /></a> : null}
        {ask}
        <Button type="button" size="icon-sm" variant="ghost" className="size-11" onClick={dismiss}><X className="size-4" aria-hidden /><span className="sr-only">Dismiss</span></Button>
      </aside>
    );
  }
  return (
    <aside aria-label={`System event: ${notice.label}`} className="min-w-0 rounded-xl border border-gold/30 bg-gold/[0.04] p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <Bell className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">{notice.label}</p>
          <p className="break-words text-sm font-medium">{notice.subject}</p>
          {text ? <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{text}</p> : null}
        </div>
        <Button type="button" size="icon-sm" variant="ghost" className="-mr-1 -mt-1 size-11 shrink-0" onClick={dismiss}><X className="size-4" aria-hidden /><span className="sr-only">Dismiss</span></Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
        {ask}
        {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">Open the run <ExternalLink className="size-3" aria-hidden /></a> : null}
        <span className="text-xs text-muted-foreground">Nothing was changed or sent.</span>
        {time ? <span className="ml-auto text-xs text-muted-foreground">{time}</span> : null}
      </div>
    </aside>
  );
}
