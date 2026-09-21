/**
 * What Revora remembers about this website.
 *
 * Memory the owner cannot see or correct is not trustworthy, so everything the
 * builder recalls between sessions is listed here in the words it was recorded
 * in, and any note can be pinned (kept forever) or forgotten.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pin, PinOff, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { forgetSiteMemory, listSiteMemory, pinSiteMemory } from "@/lib/site-memory.functions";
import type { MemoryEntry, MemoryKind } from "@/lib/builder/session-memory";

const KIND_LABEL: Record<MemoryKind, string> = {
  rule: "Standing instruction",
  decision: "You asked for",
  outcome: "Already done",
  avoid: "Didn't work",
};

export function MemoryPanel({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const list = useServerFn(listSiteMemory);
  const forget = useServerFn(forgetSiteMemory);
  const pin = useServerFn(pinSiteMemory);
  const queryClient = useQueryClient();

  const memory = useQuery({
    queryKey: ["site-memory", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => list({ data: { organizationId: organizationId as string } }),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["site-memory", organizationId] });

  const forgetOne = useMutation({
    mutationFn: (entryId: string) =>
      forget({ data: { organizationId: organizationId as string, entryId } }),
    onSuccess: () => {
      toast.success("Forgotten — Revora won't use that again.");
      refresh();
    },
    onError: () => toast.error("That note couldn't be forgotten. Try again."),
  });

  const pinOne = useMutation({
    mutationFn: (input: { entryId: string; pinned: boolean }) =>
      pin({ data: { organizationId: organizationId as string, ...input } }),
    onSuccess: refresh,
    onError: () => toast.error("That note couldn't be updated. Try again."),
  });

  const entries = (memory.data ?? []) as MemoryEntry[];

  return (
    <section className="panel space-y-3 p-5">
      <div>
        <h3 className="text-sm font-semibold">What Revora remembers</h3>
        <p className="text-muted-foreground text-xs">
          Standing instructions, what you asked for and what was done — kept between sessions so
          you never have to repeat yourself. Your website itself is always checked before anything
          changes.
        </p>
      </div>

      {memory.isLoading ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nothing remembered yet. As you make requests, the important parts are kept here.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="bg-muted/40 flex items-start gap-2 rounded-lg border p-2.5"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <Badge variant="secondary" className="text-[10px]">
                  {KIND_LABEL[entry.kind]}
                </Badge>
                <p className="text-sm break-words">{entry.text}</p>
              </div>
              {canManage && entry.id ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={entry.pinned ? "Stop keeping this always" : "Keep this always"}
                    onClick={() =>
                      pinOne.mutate({ entryId: entry.id as string, pinned: !entry.pinned })
                    }
                  >
                    {entry.pinned ? (
                      <PinOff className="size-4" />
                    ) : (
                      <Pin className="size-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Forget this"
                    onClick={() => forgetOne.mutate(entry.id as string)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
