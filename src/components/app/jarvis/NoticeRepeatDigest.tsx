import { useEffect, useState } from "react";
import { Bell, BellOff, ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventNoticeCard } from "./EventNoticeCard";
import { dismissNoticeIds, isNoticeDismissed } from "@/lib/jarvis-notice-dismiss";
import {
  repeatDigestLabel,
  repeatDigestMemberIds,
  type NoticeDigestMember,
} from "@/lib/jarvis-notice-digest";

/**
 * JC-47: one expandable row for repeat notices of the same rule on the same day.
 * Dismiss writes every member id into the existing localStorage store (no DB).
 */
export function NoticeRepeatDigest({
  members,
  busy,
  onAsk,
}: {
  members: NoticeDigestMember[];
  busy?: boolean | undefined;
  onAsk?: ((prompt: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const ids = repeatDigestMemberIds(members);
  const idsKey = ids.join("|");

  useEffect(() => {
    const current = idsKey ? idsKey.split("|") : [];
    setHidden(current.length > 0 && current.every((id) => isNoticeDismissed(id)));
  }, [idsKey]);

  if (members.length === 0) return null;
  if (members.length === 1) {
    const only = members[0]!;
    return <EventNoticeCard id={only.id} notice={only.notice} busy={busy} onAsk={onAsk} />;
  }

  const head = members[members.length - 1]!;
  const label = repeatDigestLabel(head.notice.label, members.length);
  const quiet = head.notice.quiet;

  const dismissAll = () => {
    setHidden(true);
    dismissNoticeIds(ids);
  };

  if (hidden) {
    return (
      <p className="flex min-h-11 items-center text-xs text-muted-foreground">
        Dismissed: {head.notice.label} · {members.length} today
      </p>
    );
  }

  return (
    <aside aria-label={label} className={quiet
      ? "min-w-0 rounded-lg border border-border/60 bg-muted/20"
      : "min-w-0 rounded-xl border border-gold/30 bg-gold/[0.04]"}>
      <div className="flex min-w-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          className={`flex h-auto min-h-11 min-w-0 flex-1 items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-muted/40 ${quiet ? "text-muted-foreground" : "text-foreground"}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {quiet ? <BellOff className="size-3.5 shrink-0" aria-hidden /> : <Bell className="size-3.5 shrink-0 text-gold" aria-hidden />}
          <span className="min-w-0 flex-1 font-medium">{label}</span>
          <span className="truncate text-muted-foreground">{head.notice.subject}</span>
          {open ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" className="size-11 shrink-0" onClick={dismissAll}>
          <X className="size-4" aria-hidden />
          <span className="sr-only">Dismiss all {members.length} notices</span>
        </Button>
      </div>
      {open ? (
        <ul className="space-y-1.5 border-t border-border/50 px-2 py-2">
          {members.map((row) => (
            <li key={row.id}>
              <EventNoticeCard id={row.id} notice={row.notice} busy={busy} onAsk={onAsk} />
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
