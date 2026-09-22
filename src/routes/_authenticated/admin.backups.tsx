import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, History, RotateCcw, ShieldCheck } from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getBackupOverview,
  listBackups,
  restoreFromBackup,
  runBackup,
} from "@/lib/backup.functions";

export const Route = createFileRoute("/_authenticated/admin/backups")({
  head: () => ({
    meta: [
      { title: "Backups & restore — Revora admin" },
      {
        name: "description",
        content: "Automated client data backups with a verified point-in-time restore.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminBackups,
});

const bytes = (value: number) =>
  value > 1_000_000
    ? `${(value / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(value / 1000))} KB`;

const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "—";

function BackupHistory({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(listBackups);
  const create = useServerFn(runBackup);
  const restore = useServerFn(restoreFromBackup);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["admin-backups", organizationId],
    queryFn: () => load({ data: { organizationId } }),
  });

  const backupNow = useMutation({
    mutationFn: () => create({ data: { organizationId, label: "Manual backup" } }),
    onSuccess: (row) => {
      setNotice(
        `Snapshot saved — ${row.rowCounts["total_rows"] ?? 0} rows, ${bytes(row.sizeBytes)}.`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-backups", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-backup-overview"] });
    },
  });

  const runRestore = useMutation({
    mutationFn: (backupId: string) => restore({ data: { backupId, confirm: confirmText } }),
    onSuccess: (result) => {
      setNotice(
        `Restored. Website: ${result.website.pages} pages, ${result.website.sections} sections. A safety snapshot of the previous state was saved first.`,
      );
      setConfirmId(null);
      setConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["admin-backups", organizationId] });
    },
  });

  const rows = history.data ?? [];

  return (
    <Panel>
      <SectionHeading
        title="Restore points"
        description="Every snapshot holds this workspace's profile, services, website, CRM and history."
        action={
          <Button
            size="sm"
            variant="signal"
            onClick={() => backupNow.mutate()}
            disabled={backupNow.isPending}
          >
            {backupNow.isPending ? "Backing up…" : "Back up now"}
          </Button>
        }
      />
      {notice ? <p className="mb-3 text-[13px] text-gold">{notice}</p> : null}
      {backupNow.error ? <ErrorNote message={(backupNow.error as Error).message} /> : null}
      {runRestore.error ? <ErrorNote message={(runRestore.error as Error).message} /> : null}
      {history.isLoading ? <LoadingRows /> : null}
      {history.error ? <ErrorNote message={(history.error as Error).message} /> : null}
      {!history.isLoading && !rows.length ? (
        <EmptyState
          icon={<DatabaseBackup className="size-5" />}
          title="No snapshots yet"
          description="Scheduled backups run daily. You can also take one right now."
        />
      ) : null}
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="product-tile sm:flex sm:items-center sm:justify-between sm:gap-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{when(row.createdAt)}</span>
                <Pill tone={row.kind === "scheduled" ? "info" : "signal"}>{row.kind}</Pill>
                {row.restoredAt ? <Pill tone="attention">restored</Pill> : null}
              </div>
              <p className="truncate text-muted-foreground">
                {row.totalRows} rows · {bytes(row.sizeBytes)}
                {row.label ? ` · ${row.label}` : ""}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-2 sm:mt-0">
              {confirmId === row.id ? (
                <>
                  <Input
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    placeholder="Type RESTORE"
                    className="h-9 w-36"
                    aria-label="Type RESTORE to confirm"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={
                      runRestore.isPending || confirmText.trim().toUpperCase() !== "RESTORE"
                    }
                    onClick={() => runRestore.mutate(row.id)}
                  >
                    {runRestore.isPending ? "Restoring…" : "Confirm"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConfirmId(row.id);
                    setConfirmText("");
                    setNotice(null);
                  }}
                >
                  <RotateCcw className="mr-1.5 size-3.5" /> Restore
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AdminBackups() {
  const load = useServerFn(getBackupOverview);
  const overview = useQuery({ queryKey: ["admin-backup-overview"], queryFn: () => load({}) });
  const [selected, setSelected] = useState<string | null>(null);

  const orgs = useMemo(() => overview.data?.organizations ?? [], [overview.data]);
  const stats = useMemo(() => {
    const dayAgo = Date.now() - 86_400_000;
    return {
      workspaces: orgs.length,
      covered: orgs.filter(
        (org) => org.lastBackupAt && new Date(org.lastBackupAt).getTime() >= dayAgo,
      ).length,
      snapshots: orgs.reduce((sum, org) => sum + org.backups, 0),
    };
  }, [orgs]);

  const activeId = selected ?? orgs[0]?.id ?? null;

  return (
    <div className="product-page">
      <SectionHeading
        title="Backups & restore"
        description="Daily automated snapshots per client, with a confirmed point-in-time restore that always saves the current state first."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Client workspaces" value={String(stats.workspaces)} />
        <MetricCard label="Backed up in last 24h" value={String(stats.covered)} />
        <MetricCard label="Snapshots stored" value={String(stats.snapshots)} />
      </div>

      <Panel>
        <SectionHeading title="Coverage" description="Newest snapshot per client workspace." />
        {overview.isLoading ? <LoadingRows /> : null}
        {overview.error ? <ErrorNote message={(overview.error as Error).message} /> : null}
        <div className="space-y-2">
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => setSelected(org.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-[13px] transition-colors ${
                activeId === org.id
                  ? "border-gold/60 bg-gold/5"
                  : "border-border bg-card/40 hover:border-gold/40"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{org.name}</span>
                <span className="block truncate text-muted-foreground">
                  Last backup {when(org.lastBackupAt)} · {org.backups} stored
                </span>
              </span>
              <Pill tone={org.lastBackupAt ? "signal" : "danger"}>
                {org.lastBackupAt ? "protected" : "no backup"}
              </Pill>
            </button>
          ))}
        </div>
      </Panel>

      {activeId ? <BackupHistory organizationId={activeId} /> : null}
    </div>
  );
}
