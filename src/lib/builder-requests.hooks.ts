/**
 * The builder's request engine, extracted from the old request panel so one
 * assistant surface can drive it.
 *
 * Requests are queued and worked one at a time, so two builds can never touch
 * the draft at once. Each request produces a plan the owner can edit: keep,
 * skip, reorder or remove any step before it runs. Safe plans (nothing removed,
 * nothing to ask) apply straight away; anything else waits for one explicit
 * press. A version is always saved first, so any change can be rolled back.
 *
 * No policy changed here: the same server functions, the same approval gates,
 * the same honest failure reporting as before.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { detectCapabilities, type BuilderCapabilities } from "@/lib/builder/capabilities";
import type { BrandPreference } from "@/lib/builder/composition-preview";
import { hasBrandChoices } from "@/components/app/BrandChoices";
import {
  approvedSteps,
  canAutoApply,
  moveStep,
  newTask,
  nextRunnable,
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
import { trackConversion } from "@/lib/conversion";
import { friendlyError } from "@/lib/user-error";

export const INSTRUCTION_LIMIT = 1200;

export type BuilderRequests = ReturnType<typeof useBuilderRequests>;

export function useBuilderRequests({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [capabilities, setCapabilities] = useState<BuilderCapabilities | null>(null);
  const [conversation, setConversation] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [brand, setBrand] = useState<BrandPreference | null>(null);
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
        // Recorded so the drop-off report can show why owners stall here.
        trackConversion("build_failed", {
          metadata: { organization_id: organizationId ?? "", reason: "nothing_to_change" },
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
      // Changes really reached the website — the step before going live.
      trackConversion("build_applied", { metadata: { organization_id: organizationId ?? "" } });
      toast.success(
        `${result.applied} change${result.applied === 1 ? "" : "s"} applied to your draft.` +
          (skipped ? ` ${skipped} skipped.` : ""),
      );
      refresh();
    } catch (error) {
      const message = friendlyError(error as Error, "Couldn't apply those changes.");
      patch(task.id, { state: "failed", error: message, retryable: true });
      trackConversion("build_failed", {
        metadata: { organization_id: organizationId ?? "", reason: "service_unavailable" },
      });
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
          ...(brand && hasBrandChoices(brand) ? { brand } : {}),
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
        composition: result.composition ?? null,
      };
      // A request that ended in nothing actionable must never sit in a silent
      // hold with no working button.
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
      // A composed look and page structure is always previewed first: the owner
      // approves or adjusts it before anything is written.
      if (!result.unavailable && !planned.composition && canAutoApply(planned))
        await runBuild(planned);
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

  const busy = tasks.some((task) => task.state === "planning" || task.state === "building");

  const queue = (instruction: string) => {
    const text = instruction.trim().slice(0, INSTRUCTION_LIMIT);
    if (!text || !ready) return;
    setTasks((current) => [...current, newTask(text)]);
    // Funnel stage: an owner actually asked for a build (never the text itself).
    trackConversion("build_requested", { metadata: { organization_id: organizationId ?? "" } });
  };

  const summary = useMemo(() => queueSummary(tasks), [tasks]);

  return {
    tasks,
    busy,
    ready,
    summary,
    capabilities,
    brand,
    setBrand,
    queue,
    apply: (task: QueueTask) => void runBuild(task),
    retry: (id: string) => patch(id, { state: "queued", error: "" }),
    dismiss: (id: string) => setTasks((current) => current.filter((task) => task.id !== id)),
    toggleStep: (id: string, key: string) =>
      setTasks((current) => current.map((t) => (t.id === id ? toggleStep(t, key) : t))),
    moveStep: (id: string, key: string, delta: -1 | 1) =>
      setTasks((current) => current.map((t) => (t.id === id ? moveStep(t, key, delta) : t))),
    dropStep: (id: string, key: string) =>
      setTasks((current) => current.map((t) => (t.id === id ? removeStep(t, key) : t))),
    approvedCount: (task: QueueTask) => approvedSteps(task).length,
  };
}
