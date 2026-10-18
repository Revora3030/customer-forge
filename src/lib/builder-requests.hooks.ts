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
import { announceDraftChange } from "@/lib/builder/preview-bridge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { detectCapabilities, type BuilderCapabilities } from "@/lib/builder/capabilities";
import { applyHeadline, applySummary, skippedReasons } from "@/lib/builder/apply-report";
import type { BrandPreference } from "@/lib/builder/composition-preview";
import { hasBrandChoices } from "@/components/app/brand-choices-utils";
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
import {
  clearTurns,
  listSavedBranches,
  loadEarlierTurns,
  loadTurnsPage,
  pairTurns,
  saveTurns,
  type SavedTaskResult,
  type SavedTurn,
  threadColumnsMissing,
} from "@/lib/builder-memory";
import { hydrateTasks, mergeRestored, type ChatTask } from "@/lib/builder/hydrate-tasks";
import {
  MAIN_BRANCH,
  baseRequestId,
  normaliseRequestId,
  listBranches,
  normaliseBranch,
  searchTurns,
  turnsForBranch,
  type MessageKind,
} from "@/lib/builder/chat-thread";
import { supabase } from "@/integrations/supabase/client";
import { jobIsActive, type JobLivenessRow } from "@/lib/builder/job-liveness";
import { addPending, clearAllPending, clearPending, readPending, unresolvedPending, type PendingRequest } from "@/lib/builder/pending-requests";

export const INSTRUCTION_LIMIT = 1200;

/**
 * How many changes are installed in one pass. Kept below the server's own safety
 * limit so a large plan is applied in ordered batches rather than refused.
 */
const APPLY_BATCH_SIZE = 400;

/**
 * A plan saved on the server is reused for a resumed request only while it is
 * younger than this. The apply step's idempotency lookup covers 15 minutes, so
 * a reused plan re-applied under the same operation key is still recognised.
 */
export const PLAN_REUSE_MAX_AGE_MS = 12 * 60 * 1000;


/**
 * True once the first website exists AND no build job is still running. Pages
 * appear partway through a build; planning against them early lost the edit.
 */
async function firstBuildSettled(organizationId: string): Promise<boolean> {
  const [{ count }, { data: active }] = await Promise.all([
    supabase
      .from("website_pages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("generation_jobs")
      .select("id, status, lease_expires_at, updated_at")
      .eq("organization_id", organizationId)
      .in("status", ["queued", "processing"])
      .limit(5),
  ]);
  // A stalled job (worker cut off, lease long expired) is not a running build.
  const running = ((active ?? []) as JobLivenessRow[]).some((row) => jobIsActive(row));
  return (count ?? 0) > 0 && !running;
}

/**
 * A request restored after navigation. Text-only requests are queued again
 * under their original id. A request that carried photos is NOT re-run (its
 * photos were not kept, and planning saves attached photos to the library, so
 * re-running would duplicate uploads); it is shown with a clear prompt to
 * re-attach and resend, so the owner's words are never lost.
 */
function resumeTask(request: PendingRequest): QueueTask {
  const task = { ...newTask(request.instruction), id: request.id };
  if (!request.hadAttachments) return task;
  return {
    ...task,
    state: "failed",
    error: "You left the builder before this finished, and its photos couldn't be kept. Attach them again and send it once more.",
    retryable: false,
    // Kept in the pending record (see the clean-up effect) until the owner
    // dismisses it, so a second reload doesn't lose their words either.
    awaitingReattach: true,
  };
}

export type BuilderRequests = ReturnType<typeof useBuilderRequests>;

/** Safari "Load failed", Chrome "Failed to fetch", timeouts: the request never got its answer. */
function isDroppedConnection(error: unknown): boolean {
  const message = String((error as Error)?.message ?? error ?? "").toLowerCase();
  return /load failed|failed to fetch|network ?error|networkerror|timed? ?out|the network connection was lost|aborted/.test(message);
}

/**
 * Polls for a plan the server finished after the browser lost the connection.
 * The server stores every finished plan with its request id; this reads it
 * back for up to ~4 minutes.
 */
/** One read of the plan the server saved under this request id, if any. */
async function findSavedPlan(
  organizationId: string,
  requestId: string,
  options: { skipDeferred?: boolean; since?: string } = {},
): Promise<unknown | null> {
  let query = supabase
    .from("ai_generations")
    .select("result")
    .eq("organization_id", organizationId)
    .eq("kind", "agent_plan")
    .contains("result", { requestId } as never);
  if (options.since) query = query.gte("created_at", options.since);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(5);
  if (error) throw error;
  // A re-plan after a first-build deferral shares the request id with the
  // earlier "still building" reply: never hand that old reply back.
  const found = ((data ?? []) as { result: unknown }[]).find(
    (row) => row.result && !(options.skipDeferred && (row.result as { deferred?: unknown }).deferred === true),
  );
  return found?.result ?? null;
}

async function recoverPlan(
  organizationId: string,
  requestId: string,
  options: { skipDeferred?: boolean; since?: string } = {},
): Promise<unknown | null> {
  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const found = await findSavedPlan(organizationId, requestId, options);
      if (found) return found;
    } catch {
      // Still offline: keep waiting.
    }
  }
  return null;
}

export function useBuilderRequests({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const [tasks, setTasks] = useState<ChatTask[]>([]);
  const [capabilities, setCapabilities] = useState<BuilderCapabilities | null>(null);
  // Active conversation branch (spec A). Alternate directions are saved under
  // their own branch so they never overwrite the main conversation.
  const [branch, setBranch] = useState<string>(MAIN_BRANCH);
  const branchRef = useRef(branch);
  branchRef.current = branch;
  const [savedTurns, setSavedTurns] = useState<SavedTurn[]>([]);
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
  /** True when the last page read came back full, so earlier messages may exist. */
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [savedBranches, setSavedBranches] = useState<string[]>([]);
  /** Requests restored from the pending list: a finished plan is reused, not paid for twice. */
  const resumedRef = useRef(new Set<string>());
  /** Requests whose user turn is already saved under their id. */
  const savedUserTurnRef = useRef(new Set<string>());
  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    void listSavedBranches(organizationId).then((list) => {
      if (live) setSavedBranches(list);
    });
    loadTurnsPage(organizationId, MAIN_BRANCH).then(
      ({ turns, full }) => {
        if (!live) return;
        setSavedTurns(turns);
        setHasEarlier(full);
        const mainTurns = turnsForBranch(turns, MAIN_BRANCH);
        setConversation(mainTurns.map(({ role, content }) => ({ role, content })).slice(-24));
        // Owner messages already saved under a request id are not saved again
        // when that request is resumed.
        for (const turn of mainTurns) {
          if (turn.role === "user" && turn.requestId) savedUserTurnRef.current.add(turn.requestId);
        }
        // Requests sent before the owner left the builder (dashboard, preview,
        // reload) and not finished yet come back as queued work under their
        // original request id, so nothing they typed is lost. Planning has no
        // side effects; building still needs the same approval as before.
        const resumed = unresolvedPending(
          readPending(organizationId),
          mainTurns.filter((turn) => turn.role === "user"),
        );
        // A saved request that is about to be resumed is not also shown as a
        // finished one. Retries are saved as "t1_r2" but pending as "t1~r2",
        // so both sides are compared by their base request id. The unknown-
        // outcome wording lives in hydrateTasks, shared with switchBranch.
        const resumedIds = new Set(resumed.map((request) => baseRequestId(request.id)));
        const past = hydrateTasks(
          pairTurns(mainTurns).filter((pair) => !(pair.requestId && resumedIds.has(baseRequestId(pair.requestId)))),
        );
        setTasks((current) => {
          const known = new Set(current.map((task) => baseRequestId(task.id)));
          const restoredQueue = resumed
            .filter((request) => !known.has(baseRequestId(request.id)))
            .map((request) => {
              resumedRef.current.add(request.id);
              return resumeTask(request);
            });
          return mergeRestored(past, [...current, ...restoredQueue]);
        });
        setMemoryLoaded(true);
      },
      () => {
        if (!live) return;
        // Even when the saved conversation can't be read, in-flight requests
        // from this device are never dropped.
        const resumed = readPending(organizationId);
        if (resumed.length)
          setTasks((current) => {
            const known = new Set(current.map((task) => baseRequestId(task.id)));
            return [
              ...current,
              ...resumed
                .filter((request) => !known.has(baseRequestId(request.id)))
                .map((request) => {
                  resumedRef.current.add(request.id);
                  return resumeTask(request);
                }),
            ];
          });
        setMemoryLoaded(true);
      },
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
      requestId?: string | null;
      kind?: MessageKind;
    }>,
    requestId?: string | null,
  ) => {
    if (!organizationId || !canManage) return;
    const tagged = turns.map((turn) => ({
      ...turn,
      requestId: turn.requestId ?? requestId ?? null,
      branch: branchRef.current,
    }));
    const at = new Date().toISOString();
    setSavedTurns((current) => [...current, ...tagged.map((turn) => ({ ...turn, at }))].slice(-400));
    void saveTurns(organizationId, tagged).catch((error: unknown) => {
      // Saving the chat never blocks building, and the turn is already kept on
      // this device. The failure is logged instead of silently swallowed, so a
      // schema or permission problem is visible in monitoring.
      console.error("[builder] chat turn could not be saved", error);
    });
  };
  /** Full plan actions kept out of React state: only the labels are editable. */
  // Plans number their steps from 0, so step keys repeat across requests.
  // Actions are stored per request (`${task.id}:${step.key}`); otherwise a plan
  // made while an older one waits for approval would overwrite its actions.
  const actionsRef = useRef(new Map<string, AgentStep>());
  const actionKey = (taskId: string, stepKey: string) => `${taskId}:${stepKey}`;
  const runningRef = useRef(false);
  // Another writer (the screen check's AI repair) can hold the queue so its
  // plan+apply never runs alongside an owner's request on the same draft.
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  const holdQueue = useCallback((on: boolean) => {
    heldRef.current = on;
    setHeld(on);
  }, []);

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
      // Other open tabs (a second builder, a full-size preview) refresh too.
      if (organizationId) announceDraftChange(organizationId);
      setRefreshing(false);
    }
  };

  const patch = (id: string, next: Partial<ChatTask>) =>
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
        .map((step) => actionsRef.current.get(actionKey(task.id, step.key))?.action)
        .filter((action): action is AgentStep["action"] => Boolean(action));
      const label = (task.summary || task.instruction).slice(0, 110) || "Before Revora changes";
      // A big request is installed in safe batches instead of being refused: the
      // server accepts a limited number of changes at once, so the whole plan is
      // walked through in order until every approved step has had its turn.
      const batches: AgentStep["action"][][] = [];
      for (let index = 0; index < allActions.length; index += APPLY_BATCH_SIZE)
        batches.push(allActions.slice(index, index + APPLY_BATCH_SIZE));
      if (!batches.length) batches.push([]);

      // Each apply carries a stable operation key, so the server writes it at
      // most once: a phone that drops the connection ("Load failed") simply
      // asks again and gets the same result back.
      const applyOnce = async (input: Parameters<typeof applyFn>[0]) => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await applyFn(input);
          } catch (error) {
            if (attempt >= 3 || !isDroppedConnection(error)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 4000 * (attempt + 1)));
          }
        }
      };
      let result = await applyOnce({
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
        const next = await applyOnce({
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
            content: message,
            taskResult: { state: "failed" },
          },
        ], task.id);
        await refresh();
        return;
      }
      // The result card is drawn from these counts. The owner-language reasons
      // and the planned step titles are stored with them, so a reload shows
      // the same card instead of a frozen sentence.
      const reasons = skippedReasons(result.details ?? []);
      const titles = steps.map((step) => step.title.slice(0, 120)).slice(0, 30);
      patch(task.id, {
        state: "complete",
        applied: result.applied,
        snapshotVersion: beforeVersion,
        failedCount: result.failed,
        staleCount: result.stale ?? 0,
        partial,
        reasons,
        titles,
        notice: result.alreadyApplied
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
      // The saved reply is the summary, said once: no toast text and no second
      // counts sentence. On reload the card re-reads the counts below.
      const savedSummary = partial
        ? applySummary({
            applied: result.applied,
            failed: result.failed ?? 0,
            stale: result.stale ?? 0,
            details: result.details ?? [],
          })
        : applyHeadline(result.applied);
      remember([
        {
          role: "assistant",
          content: savedSummary,
          taskResult: {
            state: "complete",
            applied: result.applied,
            failedCount: result.failed ?? 0,
            staleCount: result.stale ?? 0,
            ...(beforeVersion !== undefined ? { snapshotVersion: beforeVersion } : {}),
            ...(reasons.length ? { reasons } : {}),
            ...(titles.length ? { titles } : {}),
          },
        },
      ], task.id);
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
          content: message,
            taskResult: { state: "failed" },
        },
      ], task.id);
      await refresh();
    }
  };

  /**
   * The owner's words for this request, unless they were already saved under
   * its id (queue() saves them the moment they are sent). pairTurns also
   * ignores a repeat, so this only keeps the saved thread tidy.
   */
  const userTurn = (task: QueueTask): Array<{ role: "user"; content: string }> => {
    // Saved ids are normalised ("t1~r2" is stored as "t1_r2").
    const saved = normaliseRequestId(task.id);
    if (savedUserTurnRef.current.has(task.id) || (saved && savedUserTurnRef.current.has(saved))) return [];
    savedUserTurnRef.current.add(task.id);
    return [{ role: "user", content: task.instruction }];
  };

  const runPlan = async (task: QueueTask) => {
    patch(task.id, { state: "planning" });
    try {
      let result: Awaited<ReturnType<typeof planFn>> | null = null;
      // A request resumed after a reload may already have a finished plan on
      // the server under the same request id: one read reuses it instead of
      // paying for the same AI plan twice.
      if (resumedRef.current.has(task.id)) {
        resumedRef.current.delete(task.id);
        // Only a plan young enough that the server's apply dedupe (which looks
        // back 15 minutes for this operation key) still covers it: an older
        // plan re-applied under the same key could write the change twice.
        const saved = await findSavedPlan(organizationId!, task.id, {
          skipDeferred: true,
          since: new Date(Date.now() - PLAN_REUSE_MAX_AGE_MS).toISOString(),
        }).catch(() => null);
        if (saved) result = saved as Awaited<ReturnType<typeof planFn>>;
      }
      // Recovery only accepts a plan saved by this attempt (a resumed request
      // can have an older one under the same id). A little slack for clocks.
      const planStartedAt = new Date(Date.now() - 60_000).toISOString();
      if (!result) try {
        result = await planFn({
          data: {
            organizationId: organizationId!,
            instruction: task.instruction,
            history: conversation.slice(-24),
            attachments: task.attachments ?? [],
            requestId: task.id,
            ...(brand && hasBrandChoices(brand) ? { brand } : {}),
          },
        });
      } catch (error) {
        // Phones drop long requests ("Load failed") while the AI team keeps
        // working on the server. The finished plan is saved under this
        // request's id, so wait for it instead of failing the request.
        if (!isDroppedConnection(error)) throw error;
        const recovered = await recoverPlan(organizationId!, task.id, {
          skipDeferred: (deferRef.current.get(task.id) ?? 0) > 0,
          since: planStartedAt,
        });
        if (!recovered) throw error;
        result = recovered as Awaited<ReturnType<typeof planFn>>;
      }
      if ("deferred" in result && result.deferred) {
        // First build still running: wait for pages to appear WITHOUT calling
        // planWebsiteChanges again. Each call to planWebsiteChanges writes
        // "reading your business" and "reading your message" progress stages,
        // and retrying it floods the live progress card with duplicates.
        // Instead, poll website_pages directly — a cheap read that creates no
        // progress noise — and only re-plan once pages exist.
        const attempts = (deferRef.current.get(task.id) ?? 0) + 1;
        deferRef.current.set(task.id, attempts);
        if (attempts === 1) remember([...userTurn(task), { role: "assistant", content: result.reply }], task.id);
        // Wait for the first build to settle by polling the cheap pages read
        // (never the planner), for at most ~15 minutes in total. The old code
        // nested a second 90-poll loop inside each of 90 outer attempts and
        // re-entered runPlan recursively, so one deferred request could keep
        // polling for hours. One bounded loop, one re-plan.
        if (attempts === 1) {
          patch(task.id, { state: "planning", reply: result.reply });
          const deadline = Date.now() + 15 * 60 * 1000;
          let pagesReady = false;
          while (!pagesReady && Date.now() < deadline) {
            try {
              pagesReady = await firstBuildSettled(organizationId!);
            } catch {
              // A failed read is retried after the delay.
            }
            if (!pagesReady) await new Promise((resolve) => setTimeout(resolve, 10000));
          }
          if (pagesReady) return runPlan(task);
        }
        // Exhausted: tell the owner the first build is taking longer than expected.
        patch(task.id, {
          state: "failed",
          error: "Revora's first website build is taking longer than expected. Your request is saved — try again in a moment, or check the build status.",
          retryable: true,
        });
        return;
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
          ...userTurn(task),
          { role: "assistant", content: result.reply },
        ], task.id);
        return;
      }
      const steps = result.steps as AgentStep[];
      for (const step of steps) actionsRef.current.set(actionKey(task.id, step.key), step);
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
        ...userTurn(task),
        ...(!canAutoApply(planned) && result.reply
          ? [{ role: "assistant" as const, content: result.reply }]
          : []),
      ], task.id);
      // Every planned change is applied straight to the site (undo per turn).
      if (!result.unavailable && canAutoApply(planned))
        await runBuild(planned);
    } catch (error) {
      const message = friendlyError(error as Error, "Revora couldn't read that request yet.");
      // A dropped connection or a busy AI team is temporary: offer Retry so the
      // owner doesn't have to retype the whole request.
      patch(task.id, {
        state: "failed",
        error: message,
        retryable: true,
      });
      remember([
        ...userTurn(task),
        { role: "assistant", content: message, taskResult: { state: "failed" } },
      ], task.id);
    }
  };

  // Work the queue: one request at a time, in the order they were added.
  useEffect(() => {
    if (!ready || runningRef.current || held) return;
    // Tracked work (a first build the worker runs, a request still running on
    // another device) is shown but never run or waited on by this queue.
    const next = nextRunnable(tasks.filter((task) => !task.tracking));
    if (!next) return;
    runningRef.current = true;
    void runPlan(next).finally(() => {
      runningRef.current = false;
      setTasks((current) => [...current]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, ready, held]);

  // A request leaves the pending record once it reaches an end state.
  useEffect(() => {
    if (!organizationId) return;
    for (const task of tasks) {
      if (task.restored || task.awaitingReattach) continue;
      // A plan waiting for the owner's OK keeps its pending record: its steps
      // live only in this page, so after a reload it is planned again (no side
      // effects) and waits for approval again, instead of reappearing as a
      // finished chat reply with no way to apply it.
      if (task.state === "complete" || task.state === "failed" || task.state === "skipped")
        clearPending(organizationId, task.id);
    }
  }, [tasks, organizationId]);

  const busy = tasks.some((task) => !task.tracking && (task.state === "planning" || task.state === "building"));

  /** True when this request's owner message is already in the saved thread. */
  const userTurnSaved = (id: string) => {
    const saved = normaliseRequestId(id);
    return savedUserTurnRef.current.has(id) || Boolean(saved && savedUserTurnRef.current.has(saved));
  };

  /**
   * Saves the owner's message straight away under the request id. Skipped
   * where the thread columns are missing: without request ids an early message
   * can't be paired with its reply, and would be saved twice.
   */
  const rememberRequest = (id: string, instruction: string) => {
    if (threadColumnsMissing()) return;
    savedUserTurnRef.current.add(id);
    remember([{ role: "user", content: instruction, kind: "text" }], id);
  };

  const queue = (instruction: string, attachments: AgentAttachment[] = []) => {
    const text = instruction.trim().slice(0, INSTRUCTION_LIMIT);
    if ((!text && attachments.length === 0) || !ready) return;
    const request = text || "Use the attached media to improve this website without inventing details.";
    const task = newTask(request, attachments);
    // Recorded on this device the moment it is sent, so switching to the
    // dashboard or preview mid-plan can never lose the request.
    if (organizationId)
      addPending(organizationId, {
        id: task.id,
        instruction: task.instruction,
        hadAttachments: attachments.length > 0,
        sentAt: new Date().toISOString(),
      });
    setTasks((current) => [...current, task]);
    // Saved to the conversation straight away under its request id, so a
    // reload mid-plan (or another device) still shows what the owner asked.
    rememberRequest(task.id, task.instruction);
    // Funnel stage: an owner actually asked for a build (never the text itself).
    trackConversion("build_requested", { metadata: { organization_id: organizationId ?? "" } });
  };

  /**
   * Run ids the live progress card reads for a task. A first build is written
   * by the build worker under the job's request id when it records one, and
   * under the job id where it doesn't yet; chat requests use their own id.
   */
  const [progressRuns, setProgressRuns] = useState<Record<string, string>>({});

  /**
   * Shows a first build started from the chat as a live request in the
   * thread. It never plans or applies: the build worker does the work, and
   * settleBuild records how it ended under the same request id.
   */
  /** Builds shown in the thread that haven't been settled yet. */
  const trackedBuildsRef = useRef(new Set<string>());
  const trackBuild = (task: QueueTask) => {
    savedUserTurnRef.current.add(task.id);
    trackedBuildsRef.current.add(task.id);
    // "tracking": shown as building, but the chat queue neither waits on it
    // nor counts it as busy, so follow-up questions still get answered.
    setTasks((current) => [
      ...current.filter((item) => item.id !== task.id),
      { ...task, state: "building" as const, tracking: true },
    ]);
  };

  const linkBuild = useCallback((taskId: string, runId: string | null | undefined) => {
    if (!runId) return;
    setProgressRuns((current) => (current[taskId] === runId ? current : { ...current, [taskId]: runId }));
  }, []);

  const settleBuild = (taskId: string, outcome: { ok: boolean; message: string }) => {
    // Settled once; read from a ref because this is called right after
    // trackBuild, before a render has the new task in `tasks`.
    if (!trackedBuildsRef.current.delete(taskId)) return;
    // retryable: false — "Try again" would run the edit planner, not a build.
    patch(taskId, outcome.ok
      ? { state: "complete", reply: outcome.message, answered: true, tracking: false }
      : { state: "failed", error: outcome.message, retryable: false, tracking: false });
    remember([
      {
        role: "assistant",
        content: outcome.message,
        kind: outcome.ok ? "result" : "error",
        ...(outcome.ok ? {} : { taskResult: { state: "failed" as const } }),
      },
    ], taskId);
  };

  /** Rebuilds the visible thread of a branch from its saved turns. */
  const showBranch = (key: string, turns: SavedTurn[]) => {
    setConversation(turns.map(({ role, content }) => ({ role, content })).slice(-24));
    setTasks((current) =>
      mergeRestored(
        hydrateTasks(pairTurns(turns)),
        // Live work carries over, including requests still waiting their turn.
        current.filter((task) => !task.restored && (task.state === "queued" || task.state === "planning" || task.state === "building")),
      ),
    );
    setBranch(key);
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
    apply: (task: QueueTask) => {
      if (heldRef.current) {
        toast.warning("Revora is repairing what the screen check found. Approve again in a moment.");
        return;
      }
      void runBuild(task);
    },
    holdQueue,
    // A retry is a new attempt: give it a fresh request key, otherwise the
    // server's idempotency check replays the previous result ("already
    // applied") instead of planning and applying again.
    retry: (id: string) => {
      const original = tasks.find((task) => task.id === id);
      if (!original) return;
      const nextId = `${baseRequestId(id)}~r${Date.now().toString(36)}`;
      // The retry is its own request: recorded on this device like a new one
      // (a reload resumes it instead of losing it), and its words are saved
      // under its id so its result attaches to it, not the newest request.
      if (organizationId) {
        clearPending(organizationId, id);
        addPending(organizationId, {
          id: nextId,
          instruction: original.instruction,
          hadAttachments: (original.attachments?.length ?? 0) > 0,
          sentAt: new Date().toISOString(),
        });
      }
      rememberRequest(nextId, original.instruction);
      setTasks((current) =>
        current.map((task) =>
          // No longer a restored entry: it is live work again, so its pending
          // record is cleared when it ends.
          task.id === id ? { ...task, id: nextId, state: "queued" as const, error: "", restored: false } : task,
        ),
      );
    },
    /**
     * Removes a request from the chat. For a queued request that hasn't
     * started this is a real cancel: it never runs. A request already being
     * worked on can't be stopped from here (the server keeps going).
     */
    dismiss: (id: string) => {
      const task = tasks.find((item) => item.id === id);
      if (organizationId) clearPending(organizationId, id);
      // A cancelled request whose message is already saved gets a saved end,
      // so it doesn't come back later as an unknown, retryable failure.
      if (task?.state === "queued" && !task.tracking && userTurnSaved(id)) {
        remember([{ role: "assistant", content: "Cancelled.", taskResult: { state: "skipped" } }], id);
      }
      setTasks((current) => current.filter((item) => item.id !== id));
    },
    trackBuild,
    linkBuild,
    settleBuild,
    /** The run id whose progress rows belong to this task (its own id unless a build is linked). */
    progressRunId: (taskId: string) => progressRuns[taskId] ?? taskId,
    memoryLoaded,
    /** Saves chat turns from flows outside the queue (first build, fact answers). */
    remember,
    /** Active conversation branch and every branch saved for this business. */
    branch,
    branches: [...new Set([...listBranches(savedTurns), ...savedBranches])],
    /**
     * Switches to (or starts) an alternate direction. The main conversation is
     * never overwritten: new turns are saved under the chosen branch, and the
     * visible history becomes that branch's turns, read from the database
     * (each branch is loaded on its own) with what this session already has.
     */
    switchBranch: (next: string) => {
      const key = normaliseBranch(next);
      showBranch(key, turnsForBranch(savedTurns, key));
      if (!organizationId) return;
      void loadTurnsPage(organizationId, key).then(
        ({ turns, full }) => {
          if (branchRef.current !== key) return;
          setSavedTurns((current) => [
            ...current.filter((turn) => (turn.branch ?? MAIN_BRANCH) !== key),
            ...turns,
          ]);
          setHasEarlier(full);
          showBranch(key, turns);
        },
        () => undefined,
      );
    },
    /** True when older messages may exist before the first one shown. */
    hasEarlier,
    loadingEarlier,
    /** Loads the page of messages saved before the oldest one shown. */
    loadEarlier: async () => {
      if (!organizationId || loadingEarlier) return;
      const key = branchRef.current;
      const shown = turnsForBranch(savedTurns, key);
      const oldest = shown[0]?.at;
      if (!oldest) return;
      setLoadingEarlier(true);
      try {
        const { turns, full } = await loadEarlierTurns(organizationId, key, oldest);
        if (branchRef.current !== key) return;
        const known = new Set(shown.map((turn) => `${turn.at}|${turn.role}|${turn.content}`));
        const earlier = turns.filter((turn) => !known.has(`${turn.at}|${turn.role}|${turn.content}`));
        const all = [...earlier, ...shown];
        setSavedTurns((current) => [...earlier, ...current]);
        setHasEarlier(full);
        setConversation(all.map(({ role, content }) => ({ role, content })).slice(-24));
        // Restored entries are rebuilt from the whole page so a request and a
        // reply that straddled the page edge pair up again; live work stays.
        setTasks((current) =>
          mergeRestored(
            hydrateTasks(pairTurns(all)),
            current.filter((task) => !task.restored || !["complete", "failed", "skipped"].includes(task.state)),
          ),
        );
      } catch {
        toast.error("Couldn't load earlier messages. Try again in a moment.");
      } finally {
        setLoadingEarlier(false);
      }
    },
    /** Case- and accent-insensitive search across every saved turn and branch. */
    search: (query: string) => searchTurns(savedTurns, query),
    /** Starts a fresh conversation and forgets the saved one for this business. */
    newChat: async () => {
      // Live work survives a new chat; restored history (including requests
      // shown as running elsewhere) does not.
      setTasks((current) => current.filter((task) => !task.restored && (task.state === "planning" || task.state === "building")));
      setConversation([]);
      setSavedTurns([]);
      setSavedBranches([]);
      setHasEarlier(false);
      setBranch(MAIN_BRANCH);
      if (organizationId) clearAllPending(organizationId);
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
