/**
 * "Is every change actually on my site?"
 *
 * One button that reads the owner's saved builder content and the real
 * visitor-facing site, then reports exactly which saved pieces a visitor can
 * see and which cannot — with the reason and the one fix for each.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { checkLiveSync, type LiveSyncResult } from "@/lib/live-sync.functions";
import { syncSummary } from "@/lib/builder/live-sync";
import { friendlyError } from "@/lib/user-error";

export function LiveSyncPanel({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const run = useServerFn(checkLiveSync);
  const [result, setResult] = useState<LiveSyncResult | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const check = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Open a workspace first.");
      return (await run({ data: { organizationId } })) as LiveSyncResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast[data.allLive ? "success" : "warning"](syncSummary(data));
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  return (
    <Panel>
      <SectionHeading
        title="Is every change on my site?"
        description="Checks your saved content against the site a visitor actually loads."
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => check.mutate()}
          disabled={!canManage || check.isPending || !organizationId}
        >
          {check.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Check my live site
        </Button>
        {result ? (
          <Pill tone={result.allLive ? "good" : "warn"}>
            {result.allLive ? "All changes live" : `${result.missing} not showing`}
          </Pill>
        ) : null}
      </div>

      {result ? (
        <div className="mt-4 space-y-3 text-sm">
          <p className="flex items-start gap-2 text-muted-foreground">
            {result.allLive ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
            )}
            <span>{syncSummary(result)}</span>
          </p>

          {result.issues.length ? (
            <ul className="space-y-2">
              {result.issues.map((issue, index) => (
                <li
                  key={`${issue.scope}-${index}`}
                  className="rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <p className="font-medium">
                    {issue.page} — {issue.label}
                  </p>
                  <p className="mt-1 text-muted-foreground">{issue.why}</p>
                  <p className="mt-1 text-muted-foreground">{issue.fix}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {result.hiddenNotes.length ? (
            <div>
              <button
                type="button"
                className="text-xs underline underline-offset-4 text-muted-foreground"
                onClick={() => setShowHidden((value) => !value)}
                aria-expanded={showHidden}
              >
                {showHidden ? "Hide" : "Show"} {result.hiddenNotes.length} switched-off{" "}
                {result.hiddenNotes.length === 1 ? "piece" : "pieces"}
              </button>
              {showHidden ? (
                <ul className="mt-2 space-y-2">
                  {result.hiddenNotes.map((note, index) => (
                    <li key={`hidden-${index}`} className="text-xs text-muted-foreground">
                      {note.page} — {note.label}. {note.fix}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
