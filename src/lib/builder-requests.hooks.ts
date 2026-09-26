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
import { toast } from "@/lib/ui/notify";
import { detectCapabilities, type BuilderCapabilities } from "@/lib/builder/capabilities";
import { applySummary } from "@/lib/builder/apply-report";
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
import type { AgentAttachment } from "@/lib/site-agent";
import { trackConversion } from "@/lib/conversion";
import { friendlyError } from "@/lib/user-error";
import { clearTurns, loadTurns, pairTurns, saveTurns, type SavedTaskResult } from "@/lib/builder-memory";

export const INSTRUCTION_LIMIT = 1200;

/**
 * How many changes are installed in one pass. Kept below the server's own safety
 * limit so a large plan is applied in ordered batches rather than refused.
 */
const APPLY_BATCH_SIZE = 200;


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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const queryClient = useQueryClient();
  const deferRef = useRef(new Map<string, number>());

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

  // Bring back this business's saved conversation, so the AI team remembers
  // earlier requests and the owner sees them when they come back.
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    loadTurns(organizationId).then(
      (turns) => {
        if (!live) return;
        setConversation(turns.map(({ role, content }) => ({ role, content })).slice(-24));
        const past = pairTurns(turns).map((pair) => ({
          ...newTask(pair.instruction),
          state: pair.taskResult?.state ?? ("complete" as const),
          reply: pair.reply || "Done.",
          answered: !pair.taskResult,
          restored: true,
          ...(pair.taskResult?.applied !== undefined ? { applied: pair.taskResult.applied } : {}),
          ...(pair.taskResult?.failedCount !== undefined ? { failedCount: pair.taskResult.failedCount } : {}),
          ...(pair.taskResult?.staleCount !== undefined ? { staleCount: pair.taskResult.staleCount } : {}),
          ...(pair.taskResult?.snapshotVersion !== undefined
            ? { snapshotVersion: pair.taskResult.snapshotVersion }
            : {}),
          ...(pair.taskResult?.notice ? { notice: pair.taskResult.notice } : {}),
        }));
        setTasks((current) => [...past, ...current]);
        setMemoryLoaded(true);
      },
      () => live && setMemoryLoaded(true),
    );
    return () => {
      live = false;
    };
  }, [organizationId]);

  const remember = (
    turns: Array<{
      role: "user" | "assistant";
      content: string;
      taskResult?: SavedTaskResult;
    }>,
  ) => {
    if (!organizationId || !canManage) return;
    void saveTurns(organizationId, turns).catch(() => {
      // Saving the chat never blocks building; the change itself is already safe.
    });
  };
  /** Full plan actions kept out of React state: only the labels are editable. */
  const actionsRef = useRef(new Map<string, AgentStep>());
  const runningRef = useRef(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["website_versions", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["business_profile", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["website_settings", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["build_readiness", organizationId] }),
      ]);
    } finally {
      setRefreshRevision((value) => value + 1);
      setRefreshing(false);
    }
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
      const allActions = steps
        .map((step) => actionsRef.current.get(step.key)?.action)
        .filter((action): action is AgentStep["action"] => Boolean(action));
      const label = (task.summary || task.instruction).slice(0, 110) || "Before Revora changes";
      // A big request is installed in safe batches instead of being refused: the
      // server accepts a limited number of changes at once, so the whole plan is
      // walked through in order until every approved step has had its turn.
      const batches: AgentStep["action"][][] = [];
      for (let index = 0; index < allActions.length; index += APPLY_BATCH_SIZE)
        batches.push(allActions.slice(index, index + APPLY_BATCH_SIZE));
      if (!batches.length) batches.push([]);

      let result = await applyFn({
        data: {
          organizationId: organizationId!,
          actions: batches[0]!,
          label,
          // Stable per-request key: pressing apply twice cannot write twice.
          operationKey: task.id,
        },
      });
      const beforeVersion = Number((result as { snapshotVersion?: number }).snapshotVersion ?? 0) || undefined;
      for (let index = 1; index < batches.length; index += 1) {
        // Nothing landed from the previous batch: stop rather than keep pushing
        // changes at a website that has moved on. The owner is told to retry,
        // which replans against the current site.
        if (!result.applied) break;
        patch(task.id, { applied: result.applied });
        const next = await applyFn({
          data: {
            organizationId: organizationId!,
            actions: batches[index]!,
            label,
            operationKey: `${task.id}:${index + 1}`,
          },
        });
        result = {
          ...next,
          applied: result.applied + next.applied,
          failed: (result.failed ?? 0) + (next.failed ?? 0),
          stale: (result.stale ?? 0) + (next.stale ?? 0),
          details: [...(result.details ?? []), ...(next.details ?? [])],
          staleNotice: next.staleNotice || result.staleNotice,
        };
      }
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
        remember([
          {
            role: "assistant",
            content: `${task.reply ? `${task.reply}\n\n` : ""}${message}`,
            taskResult: { state: "failed" },
          },
        ]);
        await refresh();
        return;
      }
      patch(task.id, {
        state: "complete",
        applied: result.applied,
        snapshotVersion: beforeVersion,
        failedCount: result.failed,
        staleCount: result.stale ?? 0,
        partial,
        notice: partial
          ? // Say exactly how many landed and why the rest didn't, in plain words.
            applySummary({
              applied: result.applied,
              failed: result.failed ?? 0,
              stale: result.stale ?? 0,
              details: result.details ?? [],
            }) ||
            result.staleNotice ||
            "Some updates were kept and the rest were skipped — nothing was left half-finished."
          : result.alreadyApplied
            ? "These updates were already applied, so Revora didn't repeat them."
            : "",
        details: result.details ?? [],
      });
      // Changes really reached the website — the step before going live.
      trackConversion("build_applied", { metadata: { organization_id: organizationId ?? "" } });
      const toastMessage =
        `${result.applied} change${result.applied === 1 ? "" : "s"} applied to your draft.` +
        (skipped ? ` ${skipped} skipped.` : "") +
        (result.unconfirmed?.length ? ` ${result.unconfirmed.length} could not be confirmed on the site.` : "");
      if (partial || result.unconfirmed?.length) toast.warning(toastMessage);
      else toast.success(toastMessage);
      remember([
        {
          role: "assistant",
          content: `${task.reply ? `${task.reply}\n\n` : ""}${toastMessage}`,
          taskResult: {
            state: "complete",
            applied: result.applied,
            failedCount: result.failed ?? 0,
            staleCount: result.stale ?? 0,
            ...(beforeVersion !== undefined ? { snapshotVersion: beforeVersion } : {}),
            ...(partial ? { notice: applySummary({
              applied: result.applied,
              failed: result.failed ?? 0,
              stale: result.stale ?? 0,
              details: result.details ?? [],
            }) } : {}),
          },
        },
      ]);
      await refresh();
    } catch (error) {
      const message = friendlyError(error as Error, "Couldn't apply those changes.");
      patch(task.id, { state: "failed", error: message, retryable: true });
      trackConversion("build_failed", {
        metadata: { organization_id: organizationId ?? "", reason: "service_unavailable" },
      });
      toast.error(message);
      remember([
        {
          role: "assistant",
          content: `${task.reply ? `${task.reply}\n\n` : ""}${message}`,
            taskResult: { state: "failed" },
        },
      ]);
      await refresh();
    }
  };

  const runPlan = async (task: QueueTask) => {
    patch(task.id, { state: "planning" });
    try {
      const result = await planFn({
        data: {
          organizationId: organizationId!,
          instruction: task.instruction,
          history: conversation.slice(-24),
          attachments: task.attachments ?? [],
          requestId: task.id,
          ...(brand && hasBrandChoices(brand) ? { brand } : {}),
        },
      });
      if ("deferred" in result && result.deferred) {
        // First build still running: keep the request and try again once pages exist.
        const attempts = (deferRef.current.get(task.id) ?? 0) + 1;
        deferRef.current.set(task.id, attempts);
        if (attempts === 1) remember([{ role: "user", content: task.instruction }, { role: "assistant", content: result.reply }]);
        if (attempts <= 60) {
          patch(task.id, { state: "planning", reply: result.reply });
          await new Promise((resolve) => setTimeout(resolve, 15000));
          return runPlan(task);
        }
      }
      if ("conversational" in result && result.conversational) {
        // A plain answer from the AI: shown as a chat reply, nothing to apply.
        setTasks((current) =>
          updateTask(current, task.id, { state: "complete", reply: result.reply, answered: true }),
        );
        setConversation((current) =>
          [
            ...current,
            { role: "user" as const, content: task.instruction },
            { role: "assistant" as const, content: result.reply },
          ].slice(-24),
        );
        remember([
          { role: "user", content: task.instruction },
          { role: "assistant", content: result.reply },
        ]);
        return;
      }
      const steps = result.steps as AgentStep[];
      for (const step of steps) actionsRef.current.set(step.key, step);
      const plannedSteps = toPlanSteps(steps);
      const questions = result.questions ?? [];
      const requirements = result.requirements ?? [];
      const uncovered = requirements.filter((requirement) => !requirement.covered);
      const planned: QueueTask = {
        ...task,
        state: "waiting_for_approval",
        steps: plannedSteps,
        reply: result.reply,
        summary: result.summary,
        questions,
        requirements,
        retryable: Boolean(result.unavailable?.retryable),
        composition: result.composition ?? null,
      };
      if (uncovered.length) {
        const labels = uncovered.map((item) => item.label).join(" and ");
        if (plannedSteps.length === 0) {
          planned.state = "failed";
          planned.error = `Revora couldn't safely cover ${labels}. Nothing was applied.`;
          planned.retryable = true;
        } else {
          // Apply the reviewed, safe changes instead of discarding the whole
          // request because one part couldn't be covered.
          planned.summary = [result.summary, `Still to do: ${labels} — ask again to retry just that part.`]
            .filter(Boolean)
            .join(" ");
        }
      }
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
      setConversation(nextConversation.slice(-24));
      // Persist the request immediately, but keep its final outcome open until
      // the apply finishes. This restores as one request/result pair rather
      // than a plan reply followed by a detached completion message.
      remember([
        { role: "user", content: task.instruction },
        ...(!canAutoApply(planned) && result.reply
          ? [{ role: "assistant" as const, content: result.reply }]
          : []),
      ]);
      // Every planned change is applied straight to the site (undo per turn).
      if (!result.unavailable && canAutoApply(planned))
        await runBuild(planned);
    } catch (error) {
      const message = friendlyError(error as Error, "Revora couldn't read that request yet.");
      patch(task.id, {
        state: "failed",
        error: message,
      });
      remember([
        { role: "user", content: task.instruction },
        { role: "assistant", content: message, taskResult: { state: "failed" } },
      ]);
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

  const queue = (instruction: string, attachments: AgentAttachment[] = []) => {
    const text = instruction.trim().slice(0, INSTRUCTION_LIMIT);
    if ((!text && attachments.length === 0) || !ready) return;
    const request = text || "Use the attached media to improve this website without inventing details.";
    setTasks((current) => [...current, newTask(request, attachments)]);
    // Funnel stage: an owner actually asked for a build (never the text itself).
    trackConversion("build_requested", { metadata: { organization_id: organizationId ?? "" } });
  };

  const summary = useMemo(() => queueSummary(tasks), [tasks]);

  return {
    tasks,
    busy,
    refreshing,
    refreshRevision,
    refresh,
    ready,
    summary,
    capabilities,
    brand,
    setBrand,
    queue,
    apply: (task: QueueTask) => void runBuild(task),
    retry: (id: string) => patch(id, { state: "queued", error: "" }),
    dismiss: (id: string) => setTasks((current) => current.filter((task) => task.id !== id)),
    memoryLoaded,
    /** Saves chat turns from flows outside the queue (first build, fact answers). */
    remember,
    /** Starts a fresh conversation and forgets the saved one for this business. */
    newChat: async () => {
      setTasks((current) => current.filter((task) => task.state === "planning" || task.state === "building"));
      setConversation([]);
      if (organizationId && canManage) await clearTurns(organizationId);
    },
    toggleStep: (id: string, key: string) =>
      setTasks((current) => current.map((t) => (t.id === id ? toggleStep(t, key) : t))),
    moveStep: (id: string, key: string, delta: -1 | 1) =>
      setTasks((current) => current.map((t) => (t.id === id ? moveStep(t, key, delta) : t))),
    dropStep: (id: string, key: string) =>
      setTasks((current) => current.map((t) => (t.id === id ? removeStep(t, key) : t))),
    approvedCount: (task: QueueTask) => approvedSteps(task).length,
  };
}
