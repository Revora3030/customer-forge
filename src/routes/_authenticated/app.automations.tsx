import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import {
  LoadingRows,
  MetricCard,
  PageHead,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAutomationRuns,
  useAutomations,
  useDeleteAutomation,
  useDeleteAutomationStep,
  useInstallRecipe,
  useProcessDueRuns,
  useSaveAutomation,
  useSaveAutomationStep,
} from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { AUTOMATION_TRIGGERS } from "@/lib/domain";
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_RECIPES,
  AUTOMATION_TOKENS,
  DELAY_PRESETS,
  delayLabel,
} from "@/lib/automation-engine";
import { relative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/automations")({
  head: () => ({
    meta: [
      { title: "Automations — Revora" },
      {
        name: "description",
        content: "Automatic follow-ups by email, text and task whenever a lead or booking changes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AutomationsPage,
});

const triggerLabel = (value: string) =>
  AUTOMATION_TRIGGERS.find((t) => t.value === value)?.label ?? value.replace(/_/g, " ");

type StepDraft = {
  id?: string;
  automation_id: string;
  sort_order: number;
  delay_minutes: number;
  action_type: string;
  subject: string;
  body: string;
};

function AutomationsPage() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const { data: automations, isLoading } = useAutomations(orgId);
  const { data: runs } = useAutomationRuns(orgId);
  const saveAutomation = useSaveAutomation(orgId);
  const deleteAutomation = useDeleteAutomation(orgId);
  const saveStep = useSaveAutomationStep(orgId);
  const deleteStep = useDeleteAutomationStep(orgId);
  const installRecipe = useInstallRecipe(orgId);
  const processDue = useProcessDueRuns(orgId);

  const [newOpen, setNewOpen] = useState(false);
  const [step, setStep] = useState<StepDraft | null>(null);

  useEffect(() => {
    if (orgId) processDue.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const queued = (runs ?? []).filter((r) => r.status === "queued");
  const sent = (runs ?? []).filter((r) => r.status === "sent");
  const installedTriggers = new Set((automations ?? []).map((a) => a.trigger_event));

  if (isLoading) return <LoadingRows rows={5} />;

  return (
    <div className="product-page">
      <PageHead
        eyebrow="Follow-up engine"
        title="Automations"
        purpose="Messages that go out on their own after someone enquires."
      >
        <Button variant="signal" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> New automation
        </Button>
      </PageHead>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Active automations"
          value={String((automations ?? []).filter((a) => a.is_active).length)}
          tone="signal"
        />
        <MetricCard label="Queued messages" value={String(queued.length)} tone="attention" />
        <MetricCard label="Sent" value={String(sent.length)} hint="last 60 runs" />
      </div>

      {(automations ?? []).length === 0 ? (
        <Panel className="p-5">
          <SectionHeading eyebrow="Start here" title="Switch on a proven sequence" />
          <p className="mt-2 text-[13px] text-muted-foreground">
            Pick a recipe and it starts running the moment your next lead or booking arrives.
          </p>
        </Panel>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {(automations ?? []).map((automation) => (
          <Panel key={automation.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">When: {triggerLabel(automation.trigger_event)}</p>
                <h2 className="mt-1 font-display text-[17px] font-semibold">{automation.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={automation.is_active}
                  aria-label={`Activate ${automation.name}`}
                  onCheckedChange={(checked) =>
                    saveAutomation.mutate({
                      id: automation.id,
                      name: automation.name,
                      trigger_event: automation.trigger_event,
                      is_active: checked,
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${automation.name}`}
                  onClick={() => deleteAutomation.mutate(automation.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            <ol className="mt-4 space-y-2">
              {automation.automation_steps.map((s) => (
                <li key={s.id} className="panel-inset p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={s.action_type === "task" ? "info" : "signal"}>
                          {AUTOMATION_ACTIONS.find((a) => a.value === (s.channel ?? s.action_type))
                            ?.label ?? s.action_type}
                        </Pill>
                        <span className="text-[11px] text-muted-foreground">
                          {delayLabel(s.delay_minutes)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-medium">{s.subject}</p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                        {s.body}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setStep({
                            id: s.id,
                            automation_id: automation.id,
                            sort_order: s.sort_order,
                            delay_minutes: s.delay_minutes,
                            action_type: (s.channel ?? s.action_type) as string,
                            subject: s.subject ?? "",
                            body: s.body ?? "",
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete step"
                        onClick={() => deleteStep.mutate(s.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() =>
                setStep({
                  automation_id: automation.id,
                  sort_order: automation.automation_steps.length,
                  delay_minutes: 60,
                  action_type: "email",
                  subject: "",
                  body: "",
                })
              }
            >
              <Plus className="size-4" /> Add step
            </Button>
          </Panel>
        ))}
      </div>

      <Panel className="p-5">
        <SectionHeading eyebrow="Recipes" title="Proven sequences" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {AUTOMATION_RECIPES.map((recipe) => (
            <div key={recipe.name} className="panel-inset p-4">
              <p className="eyebrow">When: {triggerLabel(recipe.trigger_event)}</p>
              <h3 className="mt-1 font-display text-[15px] font-semibold">{recipe.name}</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">{recipe.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {recipe.steps
                  .map((s) => `${delayLabel(s.delay_minutes)} · ${s.action_type}`)
                  .join(" → ")}
              </p>
              <Button
                variant={installedTriggers.has(recipe.trigger_event) ? "outline" : "signal"}
                size="sm"
                className="mt-3"
                disabled={installRecipe.isPending}
                onClick={() => installRecipe.mutate(recipe)}
              >
                <Zap className="size-4" /> Add this sequence
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-5">
        <SectionHeading
          eyebrow="Activity"
          title="Message log"
          action={
            <Button variant="ghost" size="sm" onClick={() => processDue.mutate()}>
              Run due now
            </Button>
          }
        />
        <ul className="mt-4 divide-y divide-border">
          {(runs ?? []).map((run) => (
            <li key={run.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{run.subject}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[
                    (run.leads as { name?: string } | null)?.name,
                    run.action_type,
                    run.recipient,
                    triggerLabel(run.trigger_event),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill
                  tone={
                    run.status === "sent"
                      ? "signal"
                      : run.status === "queued"
                        ? "attention"
                        : "neutral"
                  }
                >
                  {run.status}
                </Pill>
                <span className="text-[11px] text-muted-foreground">
                  {run.status === "queued"
                    ? `due ${relative(run.scheduled_for)}`
                    : relative(run.sent_at ?? run.scheduled_for)}
                </span>
              </div>
            </li>
          ))}
          {(runs ?? []).length === 0 ? (
            <li className="py-6 text-center text-[13px] text-muted-foreground">
              Nothing has run yet. Switch on a sequence and your next lead triggers it.
            </li>
          ) : null}
        </ul>
      </Panel>

      {/* New automation */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
            <DialogDescription>Choose what starts it, then add your steps.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              saveAutomation.mutate(
                {
                  name: String(form.get("name") ?? ""),
                  trigger_event: String(form.get("trigger") ?? "lead_created"),
                  is_active: true,
                },
                { onSuccess: () => setNewOpen(false) },
              );
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="au-name">Name</Label>
              <Input id="au-name" name="name" required placeholder="Speed-to-lead follow up" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="au-trigger">Trigger</Label>
              <select
                id="au-trigger"
                name="trigger"
                className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
              >
                {AUTOMATION_TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="submit" variant="signal" disabled={saveAutomation.isPending}>
                Create automation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Step editor */}
      <Dialog open={!!step} onOpenChange={(open) => !open && setStep(null)}>
        <DialogContent>
          {step ? (
            <>
              <DialogHeader>
                <DialogTitle>{step.id ? "Edit step" : "Add step"}</DialogTitle>
                <DialogDescription>
                  Use tokens like {AUTOMATION_TOKENS.slice(0, 3).join(", ")} — they fill in
                  automatically.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveStep.mutate(
                    {
                      ...(step.id ? { id: step.id } : {}),
                      automation_id: step.automation_id,
                      sort_order: step.sort_order,
                      delay_minutes: step.delay_minutes,
                      action_type: step.action_type,
                      subject: step.subject,
                      body: step.body,
                    },
                    { onSuccess: () => setStep(null) },
                  );
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="st-action">Channel</Label>
                    <select
                      id="st-action"
                      value={step.action_type}
                      onChange={(e) => setStep({ ...step, action_type: e.target.value })}
                      className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {AUTOMATION_ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="st-delay">Timing</Label>
                    <select
                      id="st-delay"
                      value={String(step.delay_minutes)}
                      onChange={(e) => setStep({ ...step, delay_minutes: Number(e.target.value) })}
                      className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {DELAY_PRESETS.map((d) => (
                        <option key={d.minutes} value={d.minutes}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="st-subject">
                    {step.action_type === "task" ? "Task title" : "Subject"}
                  </Label>
                  <Input
                    id="st-subject"
                    value={step.subject}
                    required
                    onChange={(e) => setStep({ ...step, subject: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="st-body">Message</Label>
                  <Textarea
                    id="st-body"
                    rows={4}
                    value={step.body}
                    onChange={(e) => setStep({ ...step, body: e.target.value })}
                    placeholder="Hi {{first_name}}, thanks for your {{service}} enquiry…"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Tokens: {AUTOMATION_TOKENS.join(" ")}
                  </p>
                </div>
                <DialogFooter>
                  <Button type="submit" variant="signal" disabled={saveStep.isPending}>
                    Save step
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
