import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { actOnAgentSuggestionFn, listAgentSuggestionsFn } from "@/lib/agent/suggestions.functions";
import { evidenceLines } from "@/lib/agent/suggestion-evidence";

/**
 * PAI-21: up to 3 suggestions from the daily pass, each with its evidence.
 * "Do it" only asks for an approval; nothing runs or reaches a customer until
 * the owner approves it. Hidden when there's nothing to suggest or it can't load.
 */
export function SuggestionsCard({ organizationId }: { organizationId: string | undefined }) {
  const list = useServerFn(listAgentSuggestionsFn);
  const act = useServerFn(actOnAgentSuggestionFn);
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const key = ["agent-suggestions", organizationId];
  const { data } = useQuery({
    queryKey: key,
    enabled: !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: () => list({ data: { organizationId: organizationId! } }),
  });
  const m = useMutation({
    mutationFn: (v: { id: string; action: "do" | "dismiss" | "snooze" }) => act({ data: { organizationId: organizationId!, ...v } }),
    onSuccess: (res, v) => {
      if (!res.ok) { setNote(res.message); return; }
      setNote(v.action === "do" ? "Approval requested. Nothing happens until you approve it." : v.action === "snooze" ? "Snoozed for 7 days." : "Dismissed for 14 days.");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: () => setNote("That didn't go through. Try again."),
  });
  const items = data?.suggestions ?? [];
  if (!items.length && !note) return null;
  return (
    <Panel as="section" aria-label="Suggestions" data-testid="agent-suggestions" className="space-y-3">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Lightbulb className="size-4 text-primary" aria-hidden /> Suggestions
      </div>
      {items.map((s) => {
        const why = evidenceLines(s.signal, s.evidence ?? {});
        return (
          <div key={s.id} className="rounded-md border p-3 text-[13px]">
            <p className="font-medium">{s.title}</p>
            {s.body ? <p className="mt-0.5 text-muted-foreground">{s.body}</p> : null}
            {why.length ? (
              <ul className="mt-1 list-disc pl-5 text-[12px] text-muted-foreground">
                {why.map((w) => <li key={w}>{w}</li>)}
              </ul>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ id: s.id, action: "do" })}>Do it</Button>
              <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ id: s.id, action: "snooze" })}>Snooze</Button>
              <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ id: s.id, action: "dismiss" })}>Dismiss</Button>
            </div>
          </div>
        );
      })}
      {note ? <p role="status" className="text-[12px] text-muted-foreground">{note}</p> : null}
    </Panel>
  );
}
