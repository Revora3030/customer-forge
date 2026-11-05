import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTodayBriefing, type BriefingItem } from "@/lib/ai-city-today-briefing";
import type { CitySnapshot } from "@/lib/ai-city";

/**
 * JC-19: Jarvis Tower "Today" briefing. Top three items that need the owner,
 * each with evidence from the city snapshot + approvals rows and a one-tap
 * triage draft. Nothing is sent until the owner submits the draft in Jarvis.
 */
export function TodayBriefing({ snapshot, now, onDraft }: { snapshot: CitySnapshot | undefined; now: number; onDraft: (draft: string) => void }) {
  const briefing = buildTodayBriefing(snapshot, now);
  return <TodayBriefingView briefing={briefing} onDraft={onDraft} />;
}

export function TodayBriefingView({
  briefing,
  onDraft,
}: {
  briefing: { available: boolean; items: readonly BriefingItem[] };
  onDraft: (draft: string) => void;
}) {
  if (!briefing.available) {
    return (
      <section aria-label="Today" className="mt-5">
        <h3 className="text-xs font-semibold uppercase">Today</h3>
        <p role="status" className="mt-2 text-xs text-destructive">City records unavailable, so nothing can be ruled out.</p>
      </section>
    );
  }
  return (
    <section aria-label="Today" className="mt-5">
      <h3 className="text-xs font-semibold uppercase">Today · needs you</h3>
      {briefing.items.length ? (
        <ol className="mt-2 space-y-2">
          {briefing.items.map((item, index) => (
            <li key={item.id} className="rounded-md border border-border p-3">
              <p className="text-[11px] uppercase text-muted-foreground">#{index + 1} · {kindLabel(item.kind)}</p>
              <p className="mt-1 break-words text-sm font-medium">{item.title}</p>
              <p className="mt-1 break-words text-[11px] text-muted-foreground">{item.evidence}</p>
              <Button type="button" size="sm" variant="outline" className="mt-2 min-h-11" onClick={() => onDraft(item.draft)}>
                <Sparkles className="size-4 text-gold" /> Ask Jarvis to triage
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Nothing in the city feeds needs you right now.</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Built from the city snapshot and approval queue only. Each tap opens a draft in Jarvis; nothing runs until you send it.</p>
    </section>
  );
}

function kindLabel(kind: BriefingItem["kind"]): string {
  if (kind === "approvals") return "Approvals";
  if (kind === "failures") return "Failed group";
  if (kind === "ci") return "CI";
  return "Stalled build";
}
