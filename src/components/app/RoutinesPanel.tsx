import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  createRoutineFn,
  deleteRoutineFn,
  listRoutinesFn,
  updateRoutineFn,
  type RoutineView,
} from "@/lib/agent/routines.functions";
import {
  OWNER_PRESET_COPY,
  OWNER_ROUTINE_PRESETS,
  isOwnerRoutinePreset,
  scheduleLabel,
  type OwnerRoutinePreset,
} from "@/lib/agent/routine-presets";
import { relative } from "@/lib/format";

/**
 * JC-53: the owner's scheduled AI routines. Read-only presets only: a routine
 * reads the workspace and writes something for the owner; it never contacts
 * anyone. Members see the list; only the owner can add, pause or remove.
 */
export function RoutinesPanel({ organizationId, isOwner }: { organizationId: string; isOwner: boolean }) {
  const client = useQueryClient();
  const key = ["agent-routines", organizationId] as const;
  const [message, setMessage] = useState<string | null>(null);
  const list = useQuery({
    queryKey: key,
    queryFn: () => listRoutinesFn({ data: { organizationId } }),
    staleTime: 30_000,
  });
  const done = (result: { ok: true } | { ok: false; message: string }, success: string) => {
    setMessage(result.ok ? success : result.message);
    void client.invalidateQueries({ queryKey: key });
  };
  const onError = () => setMessage("Couldn't save that change. Try again.");
  const create = useMutation({
    mutationFn: (preset: OwnerRoutinePreset) => createRoutineFn({ data: { organizationId, preset } }),
    onSuccess: (r) => done(r, "Routine added."),
    onError,
  });
  const toggle = useMutation({
    mutationFn: (v: { routineId: string; enabled: boolean }) => updateRoutineFn({ data: { organizationId, ...v } }),
    onSuccess: (r, v) => done(r, v.enabled ? "Routine resumed." : "Routine paused."),
    onError,
  });
  const remove = useMutation({
    mutationFn: (routineId: string) => deleteRoutineFn({ data: { organizationId, routineId } }),
    onSuccess: (r) => done(r, "Routine removed."),
    onError,
  });

  if (list.isError && !list.data) {
    return (
      <QueryErrorNotice title="We couldn't load your routines." retry={() => list.refetch()} retrying={list.isFetching} />
    );
  }
  const routines: RoutineView[] = list.data?.routines ?? [];
  const taken = new Set(routines.map((r) => r.preset));
  const available = OWNER_ROUTINE_PRESETS.filter((p) => !taken.has(p));
  const busy = create.isPending || toggle.isPending || remove.isPending;

  return (
    <Panel aria-label="Routines" data-testid="routines-panel">
      <SectionHeading
        eyebrow="AI routines"
        title="Routines"
        description="Scheduled check-ins your AI does for you. They only read and write notes for you; nothing is sent to anyone."
      />
      {message ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      {list.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading routines…</p> : null}
      {routines.length > 0 ? (
        <ul className="mt-4 divide-y divide-border">
          {routines.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="routine-row">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium">{r.name}</p>
                <p className="text-[12px] text-muted-foreground">
                  {scheduleLabel({ frequency: r.frequency, weekday: r.weekday, monthDay: r.month_day, hour: r.hour, minute: r.minute })}
                  {r.enabled ? ` · next ${relative(r.next_run_at)}` : " · paused"}
                </p>
                {r.last_status ? (
                  <p className="text-[12px] text-muted-foreground">
                    Last run{r.last_run_at ? ` ${relative(r.last_run_at)}` : ""}: {r.last_status}
                  </p>
                ) : null}
              </div>
              {isOwner ? (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={r.enabled}
                    disabled={busy}
                    aria-label={r.enabled ? `Pause ${r.name}` : `Resume ${r.name}`}
                    onCheckedChange={(enabled) => toggle.mutate({ routineId: r.id, enabled })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Remove ${r.name}`}
                    onClick={() => remove.mutate(r.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {isOwner && available.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {available.filter(isOwnerRoutinePreset).map((preset) => (
            <div key={preset} className="rounded-lg border border-border p-3" data-testid="routine-preset">
              <p className="text-[14px] font-medium">{OWNER_PRESET_COPY[preset].label}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{OWNER_PRESET_COPY[preset].blurb}</p>
              <Button className="mt-2" variant="outline" size="sm" disabled={busy} onClick={() => create.mutate(preset)}>
                <Plus className="size-4" /> Turn on
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {!isOwner && routines.length === 0 && !list.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">No routines yet. The workspace owner can turn them on.</p>
      ) : null}
    </Panel>
  );
}
