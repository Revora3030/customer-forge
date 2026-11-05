import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listSiteSnapshotsFn,
  saveSiteSnapshotFn,
  startSiteFromSnapshotFn,
} from "@/lib/builder/site-snapshots.functions";

/** COMP-9 (platform admin): save this site as a trade starter, or start this site from one. */
export function SiteSnapshotPanel({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const [trade, setTrade] = useState("");
  const [name, setName] = useState("");
  const [pick, setPick] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["admin", "site-snapshots"],
    queryFn: () => listSiteSnapshotsFn(),
    staleTime: 30_000,
  });
  const save = useMutation({
    mutationFn: () => saveSiteSnapshotFn({ data: { organizationId, trade, name } }),
    onSuccess: (r) => {
      setNote(
        r.ok
          ? `Saved. ${r.pageCount} pages and ${r.sectionCount} sections, with this client's details removed.`
          : r.message,
      );
      if (r.ok) {
        setName("");
        void client.invalidateQueries({ queryKey: ["admin", "site-snapshots"] });
      }
    },
    onError: () => setNote("Couldn't save the snapshot. Try again."),
  });
  const start = useMutation({
    mutationFn: () => startSiteFromSnapshotFn({ data: { organizationId, snapshotId: pick } }),
    onSuccess: (r) => {
      setNote(
        r.ok
          ? `Started: ${r.pages} pages and ${r.sections} sections.${
              r.missing.length ? ` Still to fill in: ${r.missing.join(", ")}.` : ""
            }`
          : r.message,
      );
      if (r.ok) {
        void client.invalidateQueries({ queryKey: ["admin", "client", organizationId] });
      }
    },
    onError: () => setNote("Couldn't start from the snapshot. Nothing was changed."),
  });
  const snapshots = list.data?.snapshots ?? [];
  return (
    <Panel className="space-y-4" data-testid="site-snapshot-panel">
      <SectionHeading eyebrow="Starters" title="Trade snapshots" />
      {note ? (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="snap-trade">Trade</Label>
          <Input
            id="snap-trade"
            value={trade}
            maxLength={60}
            placeholder="e.g. cleaning"
            onChange={(e) => setTrade(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="snap-name">Snapshot name</Label>
          <Input
            id="snap-name"
            value={name}
            maxLength={120}
            placeholder="e.g. Clean and bright v1"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={save.isPending || !trade.trim() || !name.trim()}>
          Save as snapshot
        </Button>
      </form>
      <div className="space-y-2">
        <Label htmlFor="snap-pick">Start this site from a snapshot</Label>
        <div className="flex flex-wrap gap-2">
          <select
            id="snap-pick"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">
              {snapshots.length ? "Choose a snapshot" : "No snapshots saved yet"}
            </option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.trade}: {s.name} ({s.pageCount} pages)
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={start.isPending || !pick}
            onClick={() => start.mutate()}
          >
            Start from snapshot
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Only works on a site with no pages yet. Anything this client hasn't given us shows as an
          "[Add your ...]" marker.
        </p>
      </div>
    </Panel>
  );
}
