/**
 * "Inspect changes" drawer under an applied request: what each changed section
 * said before and says now, red for removed and green for added, with a copy
 * button. Read-only. Owner roles only: a viewer gets nothing.
 *
 * Before = the restore point the apply saved first (matched by its version
 * number). After = the website as it is now, so a later edit shows here too;
 * the drawer says so. Nothing is fetched until it is opened.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canManage, useWorkspace } from "@/lib/use-tenant";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FullSnapshot } from "@/lib/site-restore";
import {
  diffApplied,
  diffLook,
  diffToText,
  snapshotFromVersionPages,
  groupRows,
  type ApplyDiffRow,
} from "@/lib/builder/apply-diff";

export type InspectState = "loading" | "error" | "no-restore-point" | "ready";

const toneFor = (side: "before" | "after") =>
  side === "before"
    ? "bg-red-500/10 text-red-200 border-red-500/30"
    : "bg-emerald-500/10 text-emerald-200 border-emerald-500/30";

/** Presentational list, so it renders the same in tests and in the app. */
export function InspectChangesView({
  state,
  rows,
  onCopy,
  copied = false,
}: {
  state: InspectState;
  rows: ApplyDiffRow[];
  onCopy?: (() => void) | undefined;
  copied?: boolean | undefined;
}) {
  if (state === "loading") return <p className="mt-2 text-sm text-muted-foreground">Comparing…</p>;
  if (state === "error")
    return <p className="mt-2 text-sm text-muted-foreground">Couldn&apos;t load the comparison right now. Close and open it to try again.</p>;
  if (state === "no-restore-point")
    return <p className="mt-2 text-sm text-muted-foreground">The restore point for this change isn&apos;t available, so there is nothing to compare.</p>;
  if (!rows.length)
    return <p className="mt-2 text-sm text-muted-foreground">No differences from the restore point. The website matches how it was before.</p>;
  const groups = groupRows(rows);
  return (
    <div className="mt-2" data-testid="inspect-changes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Compared with the restore point saved before this change and your website as it is now.
        </p>
        {onCopy ? (
          <Button size="sm" variant="outline" data-tap="primary" onClick={onCopy}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy changes"}
          </Button>
        ) : null}
      </div>
      <div className="mt-2 space-y-3">
        {groups.map((group) => (
          <section key={group.where} aria-label={group.where}>
            <h4 className="break-words text-xs font-medium text-foreground">{group.where}</h4>
            <ul className="mt-1 space-y-2">
              {group.rows.map((row, index) => (
                <li key={`${row.field}-${index}`} className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {row.field} <span className="uppercase">· {row.change}</span>
                  </p>
                  {row.before ? (
                    <pre className={`mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border px-2 py-1 text-xs ${toneFor("before")} ${row.format === "json" ? "font-mono" : "font-sans"}`}>
                      <span aria-hidden>- </span>
                      <span className="sr-only">Before: </span>
                      {row.before}
                    </pre>
                  ) : null}
                  {row.after ? (
                    <pre className={`mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border px-2 py-1 text-xs ${toneFor("after")} ${row.format === "json" ? "font-mono" : "font-sans"}`}>
                      <span aria-hidden>+ </span>
                      <span className="sr-only">After: </span>
                      {row.after}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function InspectChanges({
  organizationId,
  snapshotVersion,
}: {
  organizationId: string | undefined;
  /** Version number of the restore point saved by this apply. */
  snapshotVersion: number | undefined;
}) {
  const { data: ws } = useWorkspace();
  const allowed = canManage(ws?.workspace?.role);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const enabled = allowed && open && !!organizationId && !!snapshotVersion;
  // Only the one restore point this apply saved, not the whole version list.
  const versions = useQuery({
    queryKey: ["apply-restore-point", organizationId, snapshotVersion],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_versions")
        .select("version, pages, generation")
        .eq("organization_id", organizationId!)
        .eq("version", snapshotVersion!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const settings = useQuery({
    queryKey: ["apply-current-look", organizationId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_settings")
        .select("generation")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [current, setCurrent] = useState<{ snapshot: FullSnapshot | null; error: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setCurrent(null);
    // Loaded on demand so the chat bundle doesn't pull the server function in
    // until someone opens the drawer. Read-only: it only reads the website.
    import("@/lib/site-restore.functions")
      .then(({ captureSiteState }) => captureSiteState({ data: { organizationId: organizationId! } }))
      .then((result) => {
        if (!cancelled) setCurrent({ snapshot: result.snapshot, error: false });
      })
      .catch(() => {
        if (!cancelled) setCurrent({ snapshot: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId]);

  const restorePoint = versions.data ?? null;

  const { state, rows } = useMemo((): { state: InspectState; rows: ApplyDiffRow[] } => {
    if (versions.isError || settings.isError || current?.error) return { state: "error", rows: [] };
    if (versions.isPending || settings.isPending || !current) return { state: "loading", rows: [] };
    const before = restorePoint ? snapshotFromVersionPages(restorePoint.pages) : null;
    if (!restorePoint || !before) return { state: "no-restore-point", rows: [] };
    return {
      state: "ready",
      rows: [
        ...diffApplied(before, current.snapshot),
        // Look settings are only compared when the restore point stored them.
        ...(restorePoint.generation ? diffLook(restorePoint.generation, settings.data?.generation ?? null) : []),
      ],
    };
  }, [versions.isError, versions.isPending, settings.isError, settings.isPending, settings.data, current, restorePoint]);

  if (!allowed || !snapshotVersion) return null;

  return (
    <details
      className="group mt-1"
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
        <GitCompare className="size-4" aria-hidden /> Inspect changes
      </summary>
      {open ? (
        <InspectChangesView
          state={state}
          rows={rows}
          copied={copied}
          onCopy={() => {
            void navigator.clipboard?.writeText(diffToText(rows)).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              },
              () => undefined,
            );
          }}
        />
      ) : null}
    </details>
  );
}
