/**
 * The builder's front door: one premium request box that actually builds.
 *
 * Requests are queued, so several changes can be lined up and Revora works
 * through them one at a time — two builds can never touch the draft at once.
 * Each request produces a plan the owner can edit: keep, skip, reorder or
 * remove any step before it runs. Safe plans (nothing removed, nothing to ask)
 * are applied straight away; anything else waits for one explicit press. A
 * version is always saved first so any change can be rolled back.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  attachmentNotice,
  detectCapabilities,
  type BuilderCapabilities,
} from "@/lib/builder/capabilities";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  Mic,
  Image as ImageIcon,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askAssistant } from "@/lib/assistant-bridge";
import { BUILDER_PRIMARY_ACTIONS, BUILDER_QUICK_ACTIONS } from "@/lib/builder-modes";
import {
  approvedSteps,
  canAutoApply,
  moveStep,
  newTask,
  nextRunnable,
  QUEUE_LABELS,
  queueSummary,
  removeStep,
  terminalStateForEmptyPlan,
  toPlanSteps,
  toggleStep,
  updateTask,
  type QueueTask,
} from "@/lib/builder-queue";
import { applyWebsiteChanges, planWebsiteChanges } from "@/lib/site-agent.functions";
import type { AgentStep } from "@/lib/site-agent";
import { friendlyError } from "@/lib/user-error";
import { cn } from "@/lib/utils";

const INSTRUCTION_LIMIT = 1200;

export function AiRequestPanel({
  organizationId,
  canManage,
  onOpenAi,
  compact = false,
}: {
  organizationId: string | null;
  canManage: boolean;
  /** Switch to the AI workspace, where uploads, voice and history live. */
  onOpenAi: () => void;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [capabilities, setCapabilities] = useState<BuilderCapabilities | null>(null);
  const [conversation, setConversation] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const queryClient = useQueryClient();

  // Honest report of what this device can do. Building never depends on it.
  useEffect(() => {
    let live = true;
    detectCapabilities().then(
      (result) => {
        if (live) setCapabilities(result);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  const planFn = useServerFn(planWebsiteChanges);
  const applyFn = useServerFn(applyWebsiteChanges);

  const ready = canManage && Boolean(organizationId);
  /** Full plan actions kept out of React state: only the labels are editable. */
  const actionsRef = useRef(new Map<string, AgentStep>());
  const runningRef = useRef(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["website_versions", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["business-profile", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["build_readiness"] });
  };

  const patch = (id: string, next: Partial<QueueTask>) =>
    setTasks((current) => updateTask(current, id, next));

  const runBuild = async (task: QueueTask) => {
    const steps = approvedSteps(task);
    if (steps.length === 0) {
      patch(task.id, { state: "skipped" });
      return;
    }
    patch(task.id, { state: "building", applied: 0, notice: "", details: [] });
    try {
      const result = await applyFn({
        data: {
          organizationId: organizationId!,
          actions: steps
            .map((step) => actionsRef.current.get(step.key)?.action)
            .filter((action): action is AgentStep["action"] => Boolean(action)),
          label: (task.summary || task.instruction).slice(0, 110) || "Before Revora changes",
          // Stable per-request key: pressing apply twice cannot write twice.
          operationKey: task.id,
        },
      });
      const skipped = (result.failed ?? 0) + (result.stale ?? 0);
      const partial = result.applied > 0 && skipped > 0;
      if (result.applied === 0) {
        // Never report success when nothing was actually written.
        const message =
          result.staleNotice ||
          "None of those updates could be applied, so your website is exactly as it was.";
        patch(task.id, {
          state: "failed",
          error: message,
          retryable: true,
          details: result.details ?? [],
        });
        toast.error(message);
        refresh();
        return;
      }
      patch(task.id, {
        state: "complete",
        applied: result.applied,
        failedCount: result.failed,
        staleCount: result.stale ?? 0,
        partial,
        notice: partial
          ? result.staleNotice ||
            "Some updates were kept and the rest were skipped — nothing was left half-finished."
          : result.alreadyApplied
            ? "These updates were already applied, so Revora didn't repeat them."
            : "",
        details: result.details ?? [],
      });
      toast.success(
        `${result.applied} change${result.applied === 1 ? "" : "s"} applied to your draft.` +
          (skipped ? ` ${skipped} skipped.` : ""),
      );
      refresh();
    } catch (error) {
      const message = friendlyError(error as Error, "Couldn't apply those changes.");
      patch(task.id, { state: "failed", error: message, retryable: true });
      toast.error(message);
      refresh();
    }

  };

  const runPlan = async (task: QueueTask) => {
    patch(task.id, { state: "planning" });
    try {
      const result = await planFn({
        data: {
          organizationId: organizationId!,
          instruction: task.instruction,
          history: conversation.slice(-8),
          attachments: [],
        },
      });
      const steps = result.steps as AgentStep[];
      for (const step of steps) actionsRef.current.set(step.key, step);
      const plannedSteps = toPlanSteps(steps);
      const questions = result.questions ?? [];
      const planned: QueueTask = {
        ...task,
        state: "waiting_for_approval",
        steps: plannedSteps,
        reply: result.reply,
        summary: result.summary,
        questions,
        retryable: Boolean(result.unavailable?.retryable),
      };
      // A request that ended in nothing actionable must never sit in a silent
      // hold with no working button. Empty plans become an honest, retryable
      // failure ("Didn't work") unless the engine is waiting on an answer.
      if (plannedSteps.length === 0 && questions.length === 0) {
        planned.state = terminalStateForEmptyPlan({
          steps: plannedSteps,
          questions,
          unavailable: result.unavailable,
        });
        planned.error = friendlyError(
          new Error(
            "Revora read your request but couldn't find a safe change to make yet. Try being more specific — for example “set my home page title”, “rewrite the services page”, or “add a booking section”.",
          ),
          "Couldn't make that change.",
        );
      }
      setTasks((current) => updateTask(current, task.id, planned));
      const nextConversation = [
        ...conversation,
        { role: "user" as const, content: task.instruction },
        ...(result.reply ? [{ role: "assistant" as const, content: result.reply }] : []),
      ] satisfies Array<{ role: "user" | "assistant"; content: string }>;
      setConversation(nextConversation.slice(-8));
      if (!result.unavailable && canAutoApply(planned)) await runBuild(planned);
    } catch (error) {
      patch(task.id, {
        state: "failed",
        error: friendlyError(error as Error, "Revora couldn't read that request yet."),
      });
    }
  };

  // Work the queue: one request at a time, in the order they were added.
  useEffect(() => {
    if (!ready || runningRef.current) return;
    const next = nextRunnable(tasks);
    if (!next) return;
    runningRef.current = true;
    void runPlan(next).finally(() => {
      runningRef.current = false;
      setTasks((current) => [...current]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, ready]);

  const build = useMutation({
    mutationFn: (task: QueueTask) => runBuild(task),
  });

  const busy = tasks.some((task) => task.state === "planning" || task.state === "building");

  const queue = (instruction: string) => {
    const text = instruction.trim().slice(0, INSTRUCTION_LIMIT);
    if (!text || !ready) return;
    setTasks((current) => [...current, newTask(text)]);
    setValue("");
  };

  const summary = useMemo(() => queueSummary(tasks), [tasks]);

  return (
    <section className="panel p-4 sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="min-w-0 text-[18px] font-semibold tracking-tight">
          What do you want to change?
        </h2>
        {conversation.length ? (
          <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
            Context on
          </span>
        ) : null}
      </div>

      <Textarea
        className="mt-3 min-h-24 text-[14px]"
        placeholder="Tell Revora what you want…"
        aria-label="Tell Revora what you want"
        value={value}
        maxLength={INSTRUCTION_LIMIT}
        disabled={!ready}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) queue(value);
        }}
      />

      {/* Outcome-focused starters, visible without opening anything. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {BUILDER_PRIMARY_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={!ready}
            onClick={() => queue(action.instruction)}
            className={cn(
              "min-h-9 cursor-pointer rounded-full border border-border px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors",
              "hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
            )}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="signal"
          disabled={!ready || !value.trim()}
          onClick={() => queue(value)}
        >
          {busy ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
          ) : (
            <Wand2 className="mr-1.5 size-4" aria-hidden />
          )}
          {busy ? "Working…" : tasks.length ? "Add to list" : "Ask Revora"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onOpenAi}
          disabled={!ready}
          title={capabilities ? (attachmentNotice(capabilities, "image") ?? undefined) : undefined}
        >
          <ImageIcon className="mr-1.5 size-4" aria-hidden /> Add photo
        </Button>
        <Button size="sm" variant="outline" onClick={onOpenAi} disabled={!ready}>
          <Mic className="mr-1.5 size-4" aria-hidden /> Speak
        </Button>
        {summary ? (
          <span className="text-[12px] text-muted-foreground" role="status">
            {summary}
          </span>
        ) : null}
      </div>

      {tasks.length ? (
        <ol className="mt-4 space-y-3">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-lg border border-border bg-elevated/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[13px] font-medium">{task.instruction}</p>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {QUEUE_LABELS[task.state]}
                </span>
              </div>

              {task.reply ? (
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{task.reply}</p>
              ) : null}
              {task.error ? <p className="mt-1.5 text-[12.5px]">{task.error}</p> : null}
              {task.state === "complete" ? (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  {task.applied ?? 0} change{(task.applied ?? 0) === 1 ? "" : "s"} applied
                  {task.failedCount ? `, ${task.failedCount} couldn't be applied` : ""}.
                </p>
              ) : null}

              {task.questions.length ? (
                <ul className="mt-2 space-y-1 text-[12px]">
                  {task.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              ) : null}

              {task.steps.length ? (
                <>
                  {task.state === "waiting_for_approval" ? (
                    <p className="mt-2 text-[12.5px] font-medium">Here's what I'll change:</p>
                  ) : null}
                  <ul className="mt-2 space-y-1">
                    {task.steps.map((step, index) => (
                      <li key={step.key} className="flex items-center gap-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={step.included}
                          disabled={task.state !== "waiting_for_approval"}
                          aria-label={`Include: ${step.title}`}
                          onChange={() =>
                            setTasks((current) =>
                              current.map((t) => (t.id === task.id ? toggleStep(t, step.key) : t)),
                            )
                          }
                          className="size-4 shrink-0 accent-current"
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            !step.included && "text-muted-foreground line-through",
                          )}
                        >
                          {step.title} <span className="opacity-70">({step.where})</span>
                          {step.destructive ? (
                            <span className="ml-1 opacity-80">— removes content</span>
                          ) : null}
                        </span>
                        {task.state === "waiting_for_approval" ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Move up: ${step.title}`}
                              disabled={index === 0}
                              onClick={() =>
                                setTasks((current) =>
                                  current.map((t) =>
                                    t.id === task.id ? moveStep(t, step.key, -1) : t,
                                  ),
                                )
                              }
                              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                              <ArrowUp className="size-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move down: ${step.title}`}
                              disabled={index === task.steps.length - 1}
                              onClick={() =>
                                setTasks((current) =>
                                  current.map((t) =>
                                    t.id === task.id ? moveStep(t, step.key, 1) : t,
                                  ),
                                )
                              }
                              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                              <ArrowDown className="size-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove: ${step.title}`}
                              onClick={() =>
                                setTasks((current) =>
                                  current.map((t) =>
                                    t.id === task.id ? removeStep(t, step.key) : t,
                                  ),
                                )
                              }
                              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {task.state === "waiting_for_approval" && task.steps.length ? (
                  <Button
                    size="sm"
                    variant="signal"
                    disabled={busy || approvedSteps(task).length === 0}
                    onClick={() => build.mutate(task)}
                  >
                    Approve &amp; apply
                  </Button>
                ) : null}
                {task.state === "failed" || task.retryable ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => patch(task.id, { state: "queued", error: "" })}
                  >
                    Try again
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTasks((current) => current.filter((t) => t.id !== task.id))}
                >
                  Remove from list
                </Button>
                {task.state === "waiting_for_approval" ? (
                  <Button size="sm" variant="ghost" onClick={onOpenAi}>
                    Continue in chat
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {compact ? null : (
          <button
            type="button"
            aria-expanded={ideasOpen}
            onClick={() => setIdeasOpen((open) => !open)}
            className="flex cursor-pointer items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            More ideas
            <ChevronDown
              className={cn("size-3.5 transition-transform", ideasOpen && "rotate-180")}
            />
          </button>
        )}
        <button
          type="button"
          aria-expanded={howOpen}
          onClick={() => setHowOpen((open) => !open)}
          className="flex cursor-pointer items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Details
          <ChevronDown className={cn("size-3.5 transition-transform", howOpen && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenAi();
            const last = tasks[tasks.length - 1];
            if (last) askAssistant(last.instruction);
          }}
          className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Open assistant
        </button>
      </div>
      {ideasOpen && !compact ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {BUILDER_QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={!ready}
              onClick={() => queue(action.instruction)}
              className={cn(
                "min-h-9 cursor-pointer rounded-full border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-colors",
                "hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {howOpen ? (
        <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
          <li>Requests run one at a time, in order.</li>
          <li>Safe changes apply straight away; anything that removes content waits for you.</li>
          <li>Every change lands on your draft, with a version saved first, so you can undo it.</li>
          {capabilities ? <li>{capabilities.summary}</li> : null}
        </ul>
      ) : null}
    </section>
  );
}
