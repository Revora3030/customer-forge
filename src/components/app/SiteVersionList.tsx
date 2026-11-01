/**
 * Published versions of the owner's site, newest first: date, who, a one-line
 * summary of what changed, and a one-click "Restore this version" with a
 * confirm step. A restore republishes that saved copy to the live site as its
 * own new entry (nothing is deleted, and the restore can be undone). The
 * owner's draft is never changed.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2, Undo2 } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { dateShort, timeShort } from "@/lib/format";
import { recordPublishAndSmoke } from "@/lib/publish-records.functions";
import { listSiteVersions, restoreSiteVersion } from "@/lib/site-versions.functions";
import { restorableVersions } from "@/lib/site-versions";
import { friendlyError } from "@/lib/user-error";
import { toast } from "@/lib/ui/notify";

export function SiteVersionList({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const load = useServerFn(listSiteVersions);
  const restore = useServerFn(restoreSiteVersion);
  const smoke = useServerFn(recordPublishAndSmoke);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["site_versions", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => load({ data: { organizationId: organizationId! } }),
  });
  const versions = query.data?.versions ?? [];
  const canRestore = new Set(restorableVersions(versions).map((entry) => entry.id));

  const mutation = useMutation({
    mutationFn: (entry: { id: string; version: number }) =>
      restore({ data: { organizationId: organizationId!, versionId: entry.id } }).then((result) => ({
        ...result,
        source: entry.version,
      })),
    onSuccess: (result) => {
      setConfirmId(null);
      if (!result.activated) {
        toast.error(result.reason);
        return;
      }
      toast.success(`${result.reason} Your draft is unchanged.`);
      // Same live check as a normal publish.
      if (result.version)
        void smoke({ data: { organizationId: organizationId!, version: result.version, sourceVersion: result.source } })
          .then((check) => {
            if (check.status === "failed")
              toast.warning("The version is restored, but the live check found a problem. See Publish history.", {
                duration: 12_000,
              });
            return queryClient.invalidateQueries({ queryKey: ["publish_events", organizationId] });
          })
          .catch(() => undefined);
      for (const key of ["site_versions", "website_versions", "publish_events", "website_settings"])
        void queryClient.invalidateQueries({ queryKey: [key, organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't restore that version. Your live site is unchanged.")),
  });

  return (
    <Panel className="p-5" data-testid="site-version-list">
      <SectionHeading
        eyebrow="Versions"
        title="Your published versions"
        description="Every time you publish, a copy is saved. Restore any of the last 20 and your live site goes back to it. Nothing is deleted."
      />
      {query.isLoading ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Loading versions…</p>
      ) : query.isError ? (
        <p className="mt-3 text-[13px] text-destructive">Couldn't load your versions right now.</p>
      ) : versions.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No published versions yet. One is saved each time you publish.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {versions.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border/70 px-3 py-2 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Version {entry.version}</span>
                <span className="text-muted-foreground">
                  {dateShort(entry.date)} {timeShort(entry.date)} · {entry.who}
                </span>
                {entry.isLive ? <Pill tone="signal">Live now</Pill> : null}
                {entry.kind === "restore" ? (
                  <Pill tone="neutral">
                    <History className="mr-1 inline size-3" />
                    Restore of v{entry.restoredFrom}
                  </Pill>
                ) : null}
                {entry.verification ? (
                  <Pill tone={entry.verification === "passed" ? "signal" : "danger"}>
                    {entry.verification === "passed" ? "Live check passed" : "Live check failed"}
                  </Pill>
                ) : null}
              </div>
              <p className="mt-1 text-muted-foreground">{entry.summary}</p>
              {canManage && !entry.isLive && canRestore.has(entry.id) ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {confirmId === entry.id ? (
                    <>
                      <span className="text-muted-foreground">
                        Put version {entry.version} on your live site now? Visitors will see it right away.
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ id: entry.id, version: entry.version })}
                      >
                        {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                        Yes, restore it
                      </Button>
                      <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => setConfirmId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`restore-version-${entry.version}`}
                      onClick={() => setConfirmId(entry.id)}
                    >
                      <Undo2 className="size-4" />
                      Restore this version
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
