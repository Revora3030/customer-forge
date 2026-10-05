/**
 * Choose which saved version to publish, and see each publish's live check
 * (spec F).
 *
 * Selecting a version restores it into the draft (after saving the current
 * draft as its own version). Publishing still happens through the normal
 * launch button, so payment, readiness and role gates always apply.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Rocket } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { dateShort } from "@/lib/format";
import { listPublishEvents, selectVersionForPublish } from "@/lib/publish-records.functions";
import { useWebsiteVersions } from "@/lib/site-engine.hooks";
import { friendlyError } from "@/lib/user-error";
import { toast } from "@/lib/ui/notify";

export function PublishVersionPanel({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: versions } = useWebsiteVersions(organizationId);
  const select = useServerFn(selectVersionForPublish);
  const loadEvents = useServerFn(listPublishEvents);
  const [versionId, setVersionId] = useState("");
  const events = useQuery({
    queryKey: ["publish_events", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => loadEvents({ data: { organizationId: organizationId! } }),
  });
  const choose = useMutation({
    mutationFn: () => select({ data: { organizationId: organizationId!, versionId } }),
    onSuccess: (result) => {
      toast.success(
        `Version ${result.selectedVersion} is now your draft. Your previous draft was saved as version ${result.backupVersion}. Press Publish to take it live.`,
      );
      for (const key of ["website_content", "website_versions", "website_settings"])
        void queryClient.invalidateQueries({ queryKey: [key, organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't select that version.")),
  });

  const list = versions ?? [];
  const history = events.data?.events ?? [];

  return (
    <Panel className="p-5">
      <SectionHeading
        eyebrow="Publish"
        title="Publish a specific version"
        description="Pick any saved version to make it your draft, review it, then publish. Your current draft is saved first."
      />
      {canManage && list.length ? (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-56 flex-1 space-y-1.5 text-[12px] text-muted-foreground">
            Version to publish
            <select
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-[13px] text-foreground"
            >
              <option value="">Choose a version…</option>
              {list.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.version} · {version.label ?? dateShort(version.created_at)}
                  {version.published_at ? " · was live" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" disabled={!versionId || choose.isPending} onClick={() => choose.mutate()}>
            {choose.isPending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            Make this my draft
          </Button>
        </div>
      ) : null}

      <h3 className="mt-5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Publish history</h3>
      {history.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">No publishes recorded yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {history.map((event) => {
            const failed = event.smokeReport.checks?.filter((check) => !check.ok) ?? [];
            return (
              <li key={event.id} className="rounded-lg border border-border/70 px-3 py-2 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Version {event.version}</span>
                  <span className="text-muted-foreground">{dateShort(event.createdAt)}</span>
                  <Pill
                    tone={event.smokeStatus === "passed" ? "signal" : event.smokeStatus === "failed" ? "danger" : "neutral"}
                  >
                    {event.smokeStatus === "passed"
                      ? "Live check passed"
                      : event.smokeStatus === "failed"
                        ? "Live check failed"
                        : event.smokeStatus === "skipped"
                          ? "Not checked"
                          : "Checking"}
                  </Pill>
                </div>
                {failed.length ? (
                  <ul className="mt-1 text-destructive">
                    {failed.map((check) => (
                      <li key={check.path}>
                        {check.path}: {check.problem}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
