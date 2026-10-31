import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bot, Play, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MAX_AUTOPILOT_TARGETS,
  MAX_DAILY_BUILD_CAP,
  changedAutopilotFields,
  syncAutopilotDraft,
  type AutopilotDraft,
  type AutopilotDraftState,
  type AutopilotTarget,
} from "@/lib/prospect-autopilot";
import {
  getProspectAutopilotFn,
  listAutopilotRunsFn,
  runProspectAutopilotNowFn,
  saveProspectAutopilotFn,
} from "@/lib/prospect-autopilot.functions";
import {
  ROTATION_COOLDOWN_DAYS,
  ROTATION_METROS,
  ROTATION_STATES,
  ROTATION_TRADES,
  type RotationSettings,
} from "@/lib/prospect-rotation";

const KEY = ["jarvis", "prospect-autopilot"] as const;

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

const chip = (pressed: boolean) =>
  [
    "min-h-11 rounded-md border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    pressed ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
  ].join(" ");

/**
 * Rotation settings: walk the built-in trades across metros after the
 * explicit targets. An empty selection means all of them.
 */
function RotationFields({ rotation, onChange }: { rotation: RotationSettings; onChange: (next: RotationSettings) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="flex min-h-11 w-full items-center justify-between gap-2 text-xs font-medium">
        <span>Rotate through trades and metros</span>
        <Switch
          id="autopilot-rotation"
          aria-label="Rotate through trades and metros"
          checked={rotation.enabled}
          onCheckedChange={(enabled) => onChange({ ...rotation, enabled })}
        />
      </legend>
      <p className="text-xs text-muted-foreground">
        After your targets, searches one trade in one metro at a time, each pair at most once every {ROTATION_COOLDOWN_DAYS} days,
        inside the shared daily Google search budget. Leave a list empty to use all of it.
      </p>
      {rotation.enabled ? (
        <>
          <details className="rounded-md border border-border p-2">
            <summary className="min-h-11 cursor-pointer content-center text-xs">
              Trades: {rotation.trades.length ? `${rotation.trades.length} selected` : "all"}
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ROTATION_TRADES.map((trade) => (
                <button
                  key={trade}
                  type="button"
                  aria-pressed={rotation.trades.includes(trade)}
                  className={chip(rotation.trades.includes(trade))}
                  onClick={() => onChange({ ...rotation, trades: toggle(rotation.trades, trade) })}
                >
                  {trade}
                </button>
              ))}
            </div>
          </details>
          <details className="rounded-md border border-border p-2">
            <summary className="min-h-11 cursor-pointer content-center text-xs">
              States: {rotation.states.length ? rotation.states.join(", ") : "all 50"}
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ROTATION_STATES.map((state) => (
                <button
                  key={state}
                  type="button"
                  aria-pressed={rotation.states.includes(state)}
                  aria-label={`${state}: ${(ROTATION_METROS[state] ?? []).join(", ")}`}
                  title={(ROTATION_METROS[state] ?? []).join(", ")}
                  className={chip(rotation.states.includes(state))}
                  onClick={() => onChange({ ...rotation, states: toggle(rotation.states, state).sort() })}
                >
                  {state}
                </button>
              ))}
            </div>
          </details>
        </>
      ) : null}
    </fieldset>
  );
}
const EMPTY_TARGET = { niche: "", city: "", state: "" };

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/**
 * Operations panel: the prospect autopilot. Finds businesses with no website
 * on a schedule, builds free demo sites up to a daily limit and sends the
 * preview link where the outreach rules allow. Off until switched on here or
 * through a Jarvis proposal.
 */
export function ProspectAutopilotCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getProspectAutopilotFn);
  const runsFn = useServerFn(listAutopilotRunsFn);
  const saveFn = useServerFn(saveProspectAutopilotFn);
  const runFn = useServerFn(runProspectAutopilotNowFn);
  const settings = useQuery({ queryKey: [...KEY, "settings"], queryFn: () => getFn() });
  const runs = useQuery({ queryKey: [...KEY, "runs"], queryFn: () => runsFn() });
  const [form, setForm] = useState<AutopilotDraftState>(null);
  const draft = form?.draft ?? null;
  const [target, setTarget] = useState(EMPTY_TARGET);

  // Newer settings (a Jarvis-approved change, another tab) replace the form unless it has local edits.
  useEffect(() => {
    setForm((current) => syncAutopilotDraft(current, settings.data));
  }, [settings.data, settings.dataUpdatedAt]);

  const save = useMutation({
    mutationFn: (patch: ReturnType<typeof changedAutopilotFields>) => saveFn({ data: patch }),
    onSuccess: (saved) => {
      setForm(syncAutopilotDraft(null, saved));
      toast.success(saved.enabled ? "Autopilot saved. It runs every hour." : "Autopilot saved. It is off.");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (result) => {
      if (result.status === "disabled") toast.message("Autopilot is off, so nothing ran. Turn it on and save first.");
      else if (result.status === "busy") toast.message("An autopilot run is already going.");
      else if (result.status === "failed") toast.error(`The run stopped: ${result.error ?? "unknown error"}`);
      else toast.success(`Found ${result.found}, built ${result.built}, emailed ${result.emailed}, texted ${result.texted}${result.legacyChecked ? `, re-checked ${result.legacyChecked} older email${result.legacyChecked === 1 ? "" : "s"} (${result.legacyWritten} updated)` : ""}.`);
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ["jarvis", "prospect-demos"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = (patch: Partial<AutopilotDraft>) =>
    setForm((current) => (current ? { ...current, draft: { ...current.draft, ...patch }, dirty: true } : current));
  const addTarget = () => {
    if (!draft) return;
    const next: AutopilotTarget = { niche: target.niche.trim(), city: target.city.trim(), state: target.state.trim() || null };
    if (next.niche.length < 3 || next.city.length < 2) {
      toast.error("Enter the kind of business and the city.");
      return;
    }
    update({ targets: [...draft.targets, next] });
    setTarget(EMPTY_TARGET);
  };

  return (
    <section aria-labelledby="prospect-autopilot-title" className={["space-y-3 rounded-lg border border-border p-3", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <h3 id="prospect-autopilot-title" className="flex items-center gap-1.5 text-sm font-semibold">
          <Bot className="size-4" aria-hidden />Prospect autopilot
        </h3>
        {draft ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="autopilot-enabled" className="text-xs">{draft.enabled ? "On" : "Off"}</Label>
            <Switch id="autopilot-enabled" checked={draft.enabled} onCheckedChange={(enabled) => update({ enabled })} />
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Every hour: searches your targets for businesses with no website, builds free demo sites (Lovable AI) up to
        the daily limit, and emails the preview link only to an address the business published and that passed
        verification (real mailbox domain, not a role address, not opted out). Texts only go to numbers that opted in.
      </p>

      {settings.error ? (
        <p role="alert" className="text-xs text-destructive">{settings.error instanceof Error ? settings.error.message : "Couldn't load autopilot."}</p>
      ) : !draft ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">Loading…</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!form) return;
            // Only what was edited here, so a newer server change isn't reverted.
            const patch = changedAutopilotFields(form.base, form.draft);
            if (Object.keys(patch).length) save.mutate(patch);
            else toast.message("Nothing changed.");
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">Search targets</legend>
            {draft.targets.length ? (
              <ul className="space-y-1">
                {draft.targets.map((item, index) => (
                  <li key={`${item.niche}-${item.city}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 text-sm">
                    <span className="min-w-0 break-words py-2">{item.niche} in {[item.city, item.state].filter(Boolean).join(", ")}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-11 shrink-0"
                      aria-label={`Remove ${item.niche} in ${item.city}`}
                      onClick={() => update({ targets: draft.targets.filter((_, i) => i !== index) })}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No targets yet. Add a kind of business and a city.</p>
            )}
            {draft.targets.length < MAX_AUTOPILOT_TARGETS ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_auto]">
                <Input aria-label="Kind of business" placeholder="Mobile detailing" value={target.niche} onChange={(event) => setTarget((t) => ({ ...t, niche: event.target.value }))} />
                <Input aria-label="City" placeholder="Raleigh" value={target.city} onChange={(event) => setTarget((t) => ({ ...t, city: event.target.value }))} />
                <Input aria-label="State" placeholder="NC" value={target.state} onChange={(event) => setTarget((t) => ({ ...t, state: event.target.value }))} />
                <Button type="button" variant="outline" className="min-h-11" onClick={addTarget}>
                  <Plus className="mr-1 size-4" aria-hidden />Add
                </Button>
              </div>
            ) : null}
          </fieldset>

          <RotationFields rotation={draft.rotation} onChange={(rotation) => update({ rotation })} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="autopilot-cap" className="text-xs">Demo builds per day</Label>
              <Input
                id="autopilot-cap"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_DAILY_BUILD_CAP}
                value={draft.dailyBuildCap}
                onChange={(event) => update({ dailyBuildCap: Math.max(0, Math.min(MAX_DAILY_BUILD_CAP, Math.floor(Number(event.target.value) || 0))) })}
              />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-2 sm:flex-col sm:items-start">
              <Label htmlFor="autopilot-email" className="text-xs">Email the link</Label>
              <Switch id="autopilot-email" checked={draft.sendEmail} onCheckedChange={(sendEmail) => update({ sendEmail })} />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-2 sm:flex-col sm:items-start">
              <Label htmlFor="autopilot-sms" className="text-xs">Text opted-in numbers</Label>
              <Switch id="autopilot-sms" checked={draft.sendSms} onCheckedChange={(sendSms) => update({ sendSms })} />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-2 sm:flex-col sm:items-start">
              <Label htmlFor="autopilot-pitch" className="text-xs">Pitch first, build after reply</Label>
              <Switch id="autopilot-pitch" checked={draft.pitchFirst} onCheckedChange={(pitchFirst) => update({ pitchFirst })} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11 flex-1 sm:flex-none" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save autopilot"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" disabled={run.isPending}>
                  <Play className="mr-1 size-4" aria-hidden />
                  {run.isPending ? "Running…" : "Run now"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Run the autopilot now?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This runs one full pass immediately using the saved settings: it can find businesses, build demo sites
                    {settings.data?.enabled && settings.data.sendEmail ? " and send real emails to prospects" : settings.data?.enabled && settings.data.sendSms ? " and send real texts to opted-in numbers" : " (email and text sending are off in the saved settings, so nothing will be sent)"}.
                    Unsaved changes in this form are not used.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={run.isPending} onClick={() => run.mutate()}>Yes, run now</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </form>
      )}

      <div aria-live="polite" className="space-y-1">
        <h4 className="text-xs font-medium">Recent runs</h4>
        {runs.data?.length ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {runs.data.slice(0, 5).map((item) => (
              <li key={item.id} className="break-words">
                {when(item.startedAt)} · {item.finishedAt ? `found ${item.found}, built ${item.built}, emailed ${item.emailed}, texted ${item.texted}` : "running…"}
                {item.error ? <span className="text-destructive"> · {item.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{runs.isLoading ? "Loading…" : "No runs yet."}</p>
        )}
      </div>
    </section>
  );
}
