/**
 * One assistant for the whole builder.
 *
 * Everything an owner used to do in five different boxes — ask for a change,
 * ask for a full website, ask for an audit, ask for growth ideas — happens in
 * this single conversation. It is a presentation surface only: planning,
 * approval and applying stay in the existing request engine
 * (`useBuilderRequests`), which still saves a version first and still waits for
 * an explicit press before anything is removed.
 *
 * Phone first (≈390px): the chat fills the visible screen below the chrome
 * (useChatTop), only the transcript scrolls, assistant text runs full width,
 * and secondary actions live in menus.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  GitBranch,
  History,
  ImagePlus,
  MoreHorizontal,
  Plus,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ReplyText } from "@/components/app/ReplyText";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer, TypingDots } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssistantMedia } from "@/components/app/AssistantMedia";
import { CompositionPreviewCard } from "@/components/app/CompositionPreviewCard";
import { ChatSearch, VoiceDictationButton } from "@/components/app/ChatThreadTools";
import { ApplyResultCard } from "@/components/app/builder-chat/ApplyResultCard";
import { MessageMenu } from "@/components/app/builder-chat/MessageMenu";
import { useChatTop } from "@/components/app/builder-chat/use-chat-top";
import { attachmentNotice } from "@/lib/builder/capabilities";
import { useBuildProgress } from "@/lib/builder/progress.hooks";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiSuggestions } from "@/lib/ai-suggestions.functions";
import { QUEUE_LABELS, timelineFor } from "@/lib/builder-queue";
import { onAssistantPrompt } from "@/lib/assistant-bridge";
import { pageContextPrefix, selectionPrefix, type PageContext } from "@/lib/builder/preview-bridge";
import { actionsForElement } from "@/lib/builder/element-actions";
import { MAIN_BRANCH, normaliseRequestId } from "@/lib/builder/chat-thread";
import { wantsFreshRebuild } from "@/lib/builder/rebuild-intent";
import type { ChatTask } from "@/lib/builder/hydrate-tasks";
import { SectionHistoryButton } from "@/components/app/SectionHistoryButton";
import { INSTRUCTION_LIMIT, type BuilderRequests } from "@/lib/builder-requests.hooks";
import type { AgentAttachment } from "@/lib/site-agent";
import { cn } from "@/lib/utils";
import { WebsiteBriefDialog } from "@/components/app/WebsiteBriefDialog";
import type { StepTarget } from "@/lib/builder/step-target";
import { WorkFeed } from "@/components/app/WorkFeed";
import { formatDuration, modelsAsked, timedSteps } from "@/lib/builder/work-feed";

/** How many suggestion chips sit above the composer before "More". */
const CHIP_LIMIT = 3;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BuilderAssistant({
  organizationId,
  requests,
  emptyTitle,
  emptyHint,
  businessName = null,
  compact = false,
  selection = null,
  pageContext = null,
  onReveal,
  starterIdeas = [],
  onFreshRebuild,
  canFreshRebuild = false,
  rebuildBusy = false,
  onStopBuild,
  stoppingBuild = false,
  onClearSelection,
  onOpenHistory,
  onShowPreview,
  onFirstBuild,
  firstBuildBusy = false,
  publishState = "draft",
  factQuestion = null,
  onFactAnswer,
  onFactSkip,
  banner = null,
  accessBlocked = false,
}: {
  /** Slim live status line (e.g. the screen check) shown at the top of the chat. */
  banner?: ReactNode;
  organizationId: string | null;
  requests: BuilderRequests;
  emptyTitle: string;
  emptyHint: string;
  /** Shown in Revora's greeting so the chat feels addressed to this business. */
  businessName?: string | null;
  compact?: boolean;
  /** The block the owner clicked in the preview, if any. */
  selection?: { id: string; label: string | null; kind: string | null; text: string | null } | null;
  /** The page open in the preview: shown as a chip and sent as soft context with each request. */
  pageContext?: PageContext | null;
  /** Shows a planned or applied change in the preview: opens its page, scrolls to it and outlines it. */
  onReveal?: (target: StepTarget) => void;
  /** Trade-specific first requests, shown at once in an empty chat while the AI's own ideas load. */
  starterIdeas?: { label: string; reason: string; instruction: string }[];
  /** Replaces the whole draft with a new build. Offered only behind the confirm card. */
  onFreshRebuild?: (instruction: string) => Promise<void>;
  /** Owners and admins only; the server re-checks. */
  canFreshRebuild?: boolean;
  /** A build is already running, so a rebuild can't start. */
  rebuildBusy?: boolean;
  /** Stops the running build (managers and above; the server re-checks). Shown on the build's live card. */
  onStopBuild?: (jobId: string) => void;
  stoppingBuild?: boolean;
  onClearSelection?: () => void;
  /** Opens History, where the before-and-after comparison lives. */
  onOpenHistory?: () => void;
  /** Switches phones to the Preview tab (the result card's Preview button). */
  onShowPreview?: () => void;
  /** Fresh workspaces use the full Sol → Terra first-build pipeline, not the edit planner. */
  onFirstBuild?: (instruction: string) => Promise<void>;
  firstBuildBusy?: boolean;
  publishState?: string;
  /** A fact Revora still needs from the owner, asked in the chat. */
  factQuestion?: { key: string; label: string; prompt: string; required: boolean } | null;
  onFactAnswer?: (key: string, answer: string) => Promise<void>;
  onFactSkip?: (key: string) => void;
  /**
   * The verified access check says editing is blocked (expired, canceled,
   * suspended…). Presentation only: the composer is dimmed, and the server
   * still checks every request on its own.
   */
  accessBlocked?: boolean;
}) {
  const [value, setValue] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [factLog, setFactLog] = useState<{ question: string; answer: string }[]>([]);
  const [factBusy, setFactBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [branchName, setBranchName] = useState("");
  /** A question Revora asked, which the next message answers. */
  const [answering, setAnswering] = useState<string | null>(null);
  /** The owner asked to rebuild the whole site: nothing happens until they confirm here. */
  const [rebuildAsk, setRebuildAsk] = useState<{ instruction: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useChatTop(sectionRef);
  const queueRef = useRef(requests.queue);
  queueRef.current = requests.queue;
  const activityKey = useMemo(
    () => requests.tasks.map((task) => `${task.id}:${task.state}`).join("|"),
    [requests.tasks],
  );
  // Suggestions come live from the AI team after reading this site; they
  // refresh whenever a change finishes. No fixed list is ever shown.
  const settledKey = useMemo(
    () => requests.tasks.filter((t) => t.state === "complete").length,
    [requests.tasks],
  );
  const fetchSuggestions = useServerFn(getAiSuggestions);
  const suggestionsQuery = useQuery({
    queryKey: ["ai-suggestions", organizationId, settledKey],
    enabled: Boolean(organizationId) && !requests.busy,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => {
      if (!organizationId) throw new Error("Choose a workspace first.");
      return fetchSuggestions({ data: { organizationId } });
    },
  });
  const AI_SUGGESTIONS = suggestionsQuery.data?.suggestions ?? [];
  const SUGGESTIONS = AI_SUGGESTIONS;
  // Suggestions come from the Lovable AI team and can be slow; after a short
  // wait the empty placeholders give way to the composer instead of pulsing.
  const [suggestionsSlow, setSuggestionsSlow] = useState(false);
  useEffect(() => {
    if (!suggestionsQuery.isFetching) return setSuggestionsSlow(false);
    const timer = window.setTimeout(() => setSuggestionsSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [suggestionsQuery.isFetching]);
  const suggestionsLoading = suggestionsQuery.isFetching && !suggestionsSlow;

  // Any panel elsewhere in the builder can hand its request to this box.
  useEffect(
    () =>
      onAssistantPrompt((prompt) => {
        if (prompt.trim()) queueRef.current(prompt);
      }),
    [],
  );

  /**
   * Adds the context the owner has already given by pointing or by being asked
   * a question, so they don't have to describe it again in words.
   */
  const scoped = (text: string) => {
    const parts: string[] = [];
    if (selection) parts.push(selectionPrefix(selection));
    // A picked block is more specific than the open page, and a first build has no page yet.
    else if (pageContext && !onFirstBuild) parts.push(pageContextPrefix(pageContext));
    if (answering) parts.push(`Answering your question "${answering}":`);
    return parts.length ? `${parts.join(" ")} ${text}` : text;
  };

  /** Phones: typing opens the keyboard, so only focus when the owner asks. */
  const isTouch = () =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const afterSend = () => {
    if (isTouch()) {
      inputRef.current?.blur();
      (document.activeElement as HTMLElement | null)?.blur?.();
      navigator.vibrate?.(8);
    } else {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const send = (text: string) => {
    if (!text.trim() && attachments.length === 0) return;
    // Revora asked for a missing fact: this message is the answer.
    if (factQuestion && onFactAnswer && text.trim()) {
      const q = factQuestion;
      const answer = text.trim();
      setValue("");
      afterSend();
      setFactBusy(true);
      void onFactAnswer(q.key, answer)
        .then(() => setFactLog((log) => [...log, { question: q.label, answer }]))
        .catch(() => setValue(answer))
        .finally(() => setFactBusy(false));
      return;
    }
    if (onFirstBuild) {
      const instruction = scoped(text);
      setValue("");
      setAttachments([]);
      setMediaOpen(false);
      setAnswering(null);
      onClearSelection?.();
      afterSend();
      void onFirstBuild(instruction);
      return;
    }
    // "Fresh rebuild" in the chat is a request about the whole site, not an edit
    // to plan: it gets its own confirm card instead of reaching the edit planner.
    if (onFreshRebuild && attachments.length === 0 && wantsFreshRebuild(text)) {
      setRebuildAsk({ instruction: text.trim() });
      setValue("");
      afterSend();
      return;
    }
    requests.queue(scoped(text), attachments);
    setValue("");
    setAttachments([]);
    setMediaOpen(false);
    setAnswering(null);
    onClearSelection?.();
    afterSend();
  };

  useEffect(() => {
    if (!isTouch()) inputRef.current?.focus();
  }, [activityKey]);

  // Pointing at a block moves the cursor straight into the message box.
  useEffect(() => {
    if (selection && !isTouch()) inputRef.current?.focus();
  }, [selection]);

  // Tapping the conversation closes the keyboard, like a native chat.
  const dismissKeyboard = () => {
    if (isTouch() && document.activeElement === inputRef.current) inputRef.current?.blur();
  };

  /** A search hit scrolls to the request it belongs to (switching branch first if needed). */
  const jumpTo = (requestId: string | null | undefined, branch: string | undefined) => {
    if (!requestId) return;
    const scroll = () => {
      const target =
        document.getElementById(`task-${requestId}`) ??
        document.querySelector<HTMLElement>(`[data-request-id="${normaliseRequestId(requestId) ?? ""}"]`);
      target?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };
    const key = branch ?? MAIN_BRANCH;
    if (key !== requests.branch) {
      requests.switchBranch(key);
      window.setTimeout(scroll, 400);
    } else scroll();
  };

  const busy = requests.busy || firstBuildBusy || factBusy;
  /** A tracked first build or a request running elsewhere: shown as working, never blocking. */
  const trackingWork = requests.tasks.some((task) => task.tracking);
  const empty = requests.tasks.length === 0 && !factQuestion && factLog.length === 0;
  const composerLocked = !requests.ready || accessBlocked;
  const canSend = !composerLocked && (value.trim().length > 0 || attachments.length > 0);
  const runSuggestion = (instruction: string) =>
    onFirstBuild ? void onFirstBuild(instruction) : requests.queue(instruction);
  const lastTask = requests.tasks[requests.tasks.length - 1];
  // Chips only where a next step is natural: after a finished change.
  const showChips = !empty && !busy && lastTask?.state === "complete" && (SUGGESTIONS.length > 0 || suggestionsLoading);
  const toolsVisible = !onFirstBuild && requests.memoryLoaded;

  return (
    <section
      ref={sectionRef}
      id="website-assistant"
      className={cn(
        "builder-conversation relative flex w-full max-w-full min-w-0 flex-col overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none lg:rounded-2xl lg:border lg:border-border/70 lg:bg-card/40",
        // Below 1024px the height comes from builder-workspace.css (visible
        // height minus the measured chat top); these are the desktop sizes.
        compact ? "lg:h-[calc(100vh-7.5rem)] lg:min-h-[420px]" : "h-[calc(100dvh-8rem)] min-h-[420px]",
      )}
    >
      {/* ------------------------------ Chat header ----------------------------- */}
      {/* One 48px row: avatar, name and live status, search, and a "…" menu
          with conversation directions and New chat, reachable on phones. */}
      <header className="flex h-12 min-w-0 shrink-0 items-center gap-2 border-b border-border/60 px-3 sm:px-4">
        <span className="relative inline-flex size-7 shrink-0">
          <img src="/revora-mark-144.png" alt="" className="size-7 rounded-lg" />
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background",
              busy || trackingWork ? "animate-pulse bg-primary" : "bg-emerald-400",
            )}
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">Revora</p>
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {busy || trackingWork ? "Working on your website…" : "AI website team · ready"}
          </p>
        </div>
        {toolsVisible ? (
          <div className="shrink-0">
            <ChatSearch search={requests.search} onPick={(hit) => jumpTo(hit.turn.requestId, hit.turn.branch)} />
          </div>
        ) : null}
        {toolsVisible || (requests.tasks.length > 0 && !requests.busy) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Chat options"
                className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {toolsVisible ? (
                <>
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <GitBranch className="size-3.5" aria-hidden /> Conversation direction
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={requests.branch}
                    onValueChange={(key) => {
                      if (!requests.busy) requests.switchBranch(key);
                    }}
                  >
                    {requests.branches.map((key) => (
                      <DropdownMenuRadioItem key={key} value={key} disabled={requests.busy}>
                        {key === MAIN_BRANCH ? "Main" : key}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuItem disabled={requests.busy} onSelect={() => setNaming(true)}>
                    <Plus aria-hidden /> Try another direction…
                  </DropdownMenuItem>
                </>
              ) : null}
              {requests.tasks.length > 0 && !requests.busy ? (
                <>
                  {toolsVisible ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem onSelect={() => void requests.newChat()}>
                    <SquarePen aria-hidden /> New chat
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      {naming ? (
        <form
          className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (branchName.trim()) requests.switchBranch(branchName);
            setBranchName("");
            setNaming(false);
          }}
        >
          <Input
            autoFocus
            value={branchName}
            maxLength={40}
            onChange={(event) => setBranchName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setNaming(false);
            }}
            placeholder="Name it, e.g. darker look"
            aria-label="Name the new direction"
            className="h-9 flex-1"
          />
          <Button type="submit" size="sm" disabled={!branchName.trim()}>
            Start
          </Button>
          <button
            type="button"
            onClick={() => setNaming(false)}
            aria-label="Cancel new direction"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </form>
      ) : null}
      {banner ? <div className="mx-3 mt-2 mb-1 shrink-0 empty:hidden">{banner}</div> : null}

      <Conversation className="min-h-0 flex-1 overscroll-contain" onPointerDown={dismissKeyboard} aria-label="Conversation with Revora">
        <ConversationContent className="mx-auto w-full max-w-[var(--chat-measure)] gap-5 px-3 py-5 sm:px-4">
          {requests.hasEarlier && !empty ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void requests.loadEarlier()}
                disabled={requests.loadingEarlier}
                className="relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 px-3.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
              >
                {requests.loadingEarlier ? "Loading earlier messages…" : "Load earlier messages"}
              </button>
            </div>
          ) : null}

          {empty ? (
            <div className="chat-rise flex min-h-[40vh] flex-col justify-center gap-6 py-4">
              <div className="space-y-3 text-center">
                <img
                  src="/revora-mark-144.png"
                  alt="Revora"
                  className="mx-auto size-12 rounded-2xl shadow-signal"
                />
                <h2 className="font-display text-[22px] leading-tight font-semibold tracking-tight sm:text-2xl">
                  {businessName
                    ? onFirstBuild
                      ? `Let's build ${businessName}`
                      : `What should we improve on ${businessName}?`
                    : emptyTitle}
                </h2>
                <p className="mx-auto max-w-md text-[15px] leading-6 text-muted-foreground">
                  {emptyHint}
                </p>
              </div>
              {SUGGESTIONS.length || suggestionsLoading || starterIdeas.length ? (
                <div className="mx-auto w-full max-w-xl space-y-2">
                  <p className="flex items-center gap-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <Sparkles className="size-3.5 text-primary" aria-hidden /> Suggested for your site
                  </p>
                  {suggestionsLoading && SUGGESTIONS.length === 0 && starterIdeas.length === 0
                    ? [0, 1, 2].map((key) => (
                        <div key={key} className="h-[52px] animate-pulse rounded-xl border border-border/60 bg-muted/40" />
                      ))
                    : [...SUGGESTIONS, ...starterIdeas].slice(0, 3).map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          disabled={composerLocked}
                          onClick={() => runSuggestion(action.instruction)}
                          className="group flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-3.5 py-3 text-left transition-all hover:border-primary/45 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium text-foreground">{action.label}</span>
                            {action.reason ? (
                              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{action.reason}</span>
                            ) : null}
                          </span>
                          <ArrowUp className="size-4 shrink-0 rotate-45 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
                        </button>
                      ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {(() => {
            // Only the request being worked on right now shows the live
            // activity card; waiting requests get a quiet line.
            // Tracked work (a first build, a request running elsewhere) always
            // shows its own card and never takes the queue's active slot.
            const activeTaskId = requests.tasks.find(
              (t) => !t.tracking && (t.state === "planning" || t.state === "building"),
            )?.id ?? requests.tasks.find((t) => !t.tracking && t.state === "queued")?.id ?? null;
            return requests.tasks.map((task) => (
              <div
                key={task.id}
                id={`task-${task.id}`}
                data-request-id={normaliseRequestId(task.id) ?? undefined}
                className="chat-rise scroll-mt-3 space-y-3"
              >
                <UserTurn text={task.instruction} attachments={task.attachments?.length ?? 0} />
                <AssistantTurn>
                  <TaskBody
                    task={task}
                    requests={requests}
                    isActive={task.id === activeTaskId || Boolean(task.tracking)}
                    organizationId={organizationId}
                    onAnswer={setAnswering}
                    {...(onReveal ? { onReveal } : {})}
                    {...(onStopBuild ? { onStopBuild } : {})}
                    stoppingBuild={stoppingBuild}
                    {...(onOpenHistory ? { onOpenHistory } : {})}
                    {...(onShowPreview ? { onShowPreview } : {})}
                    onFollowUp={(prompt) => {
                      setValue(prompt.slice(0, INSTRUCTION_LIMIT));
                      window.requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                  />
                </AssistantTurn>
              </div>
            ));
          })()}

          {rebuildAsk ? (
            <div className="chat-rise space-y-3">
              <UserTurn text={rebuildAsk.instruction} />
              <AssistantTurn>
                <RebuildConfirm
                  allowed={canFreshRebuild}
                  busy={rebuildBusy || busy}
                  onCancel={() => setRebuildAsk(null)}
                  onConfirm={() => {
                    const instruction = rebuildAsk.instruction;
                    setRebuildAsk(null);
                    void onFreshRebuild?.(instruction);
                  }}
                />
              </AssistantTurn>
            </div>
          ) : null}

          {factLog.map((entry, i) => (
            <div key={`fact-${i}`} className="chat-rise space-y-3">
              <AssistantTurn>
                <p>{entry.question}</p>
              </AssistantTurn>
              <UserTurn text={entry.answer} />
            </div>
          ))}

          {factQuestion ? (
            <div className="chat-rise">
              <AssistantTurn>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">{factQuestion.label}</p>
                  <p className="text-[15px] leading-6 text-muted-foreground">{factQuestion.prompt}</p>
                  {factBusy ? <Shimmer>Saving and updating your site…</Shimmer> : null}
                  {!factQuestion.required && onFactSkip && !factBusy ? (
                    <button
                      type="button"
                      onClick={() => onFactSkip(factQuestion.key)}
                      className="relative min-h-9 cursor-pointer rounded-full border border-border px-3.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      Skip for now
                    </button>
                  ) : null}
                </div>
              </AssistantTurn>
            </div>
          ) : null}

          {(firstBuildBusy || factBusy) && !requests.busy && !trackingWork ? (
            <div className="chat-rise">
              <AssistantTurn>
                <LiveActivity
                  organizationId={organizationId}
                  fallback={firstBuildBusy ? "Starting your website build…" : "Saving your answer…"}
                />
              </AssistantTurn>
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton className="bottom-3 shadow-lift" />
      </Conversation>

      {/* -------------------------------- Composer ------------------------------- */}
      <div className="relative shrink-0 px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background to-transparent lg:hidden" />
        <div className="mx-auto w-full max-w-[var(--chat-measure)]">
          {showChips ? (
            <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {suggestionsLoading && SUGGESTIONS.length === 0 ? (
                <span className="inline-flex h-9 shrink-0 items-center rounded-full border border-border/70 px-3 text-[13px] text-muted-foreground">
                  <Shimmer as="span">Finding ideas for your site…</Shimmer>
                </span>
              ) : null}
              {(moreOpen ? SUGGESTIONS : SUGGESTIONS.slice(0, CHIP_LIMIT)).map((action) => (
                <button
                  key={action.label}
                  type="button"
                  title={action.reason}
                  disabled={composerLocked}
                  onClick={() => runSuggestion(action.instruction)}
                  className="builder-suggestion inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-card/50 px-3 text-[13px] text-foreground transition-colors hover:border-primary/50 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  {action.label}
                </button>
              ))}
              {SUGGESTIONS.length > CHIP_LIMIT ? (
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((open) => !open)}
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {moreOpen ? "Fewer" : "More"}
                </button>
              ) : null}
            </div>
          ) : null}

          <PromptInput
            className={cn(
              "builder-prompt rounded-[22px] border border-border bg-card shadow-lift transition-all",
              busy && "is-thinking border-primary/35",
              composerLocked && "opacity-70",
            )}
            onSubmit={(_message, event) => {
              event.preventDefault();
              if (composerLocked) return;
              send(value);
            }}
          >
            {selection || answering || (pageContext && !onFirstBuild) ? (
              <div className="order-first flex w-full flex-wrap gap-1.5 px-3 pt-3">
                {pageContext && !onFirstBuild && !selection ? (
                  <span
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
                    title="Requests know which page you have open. Say so if you mean the whole site."
                  >
                    <Eye className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">Viewing: {pageContext.title}</span>
                  </span>
                ) : null}
                {selection ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 py-1 pr-1 pl-2.5 text-xs text-foreground">
                    <span className="truncate">Editing: {selection.label ?? selection.kind ?? "the block you picked"}</span>
                    <button
                      type="button"
                      onClick={() => onClearSelection?.()}
                      aria-label="Stop editing this block"
                      className="relative grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground after:absolute after:-inset-1.5 hover:bg-primary/15 hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                ) : null}
                {answering ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/60 py-1 pr-1 pl-2.5 text-xs text-foreground">
                    <span className="truncate">Answering: {answering}</span>
                    <button
                      type="button"
                      onClick={() => setAnswering(null)}
                      aria-label="Stop answering this question"
                      className="relative grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground after:absolute after:-inset-1.5 hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                ) : null}
                {selection ? <SectionHistoryButton organizationId={organizationId} sectionId={selection.id} /> : null}
                {selection
                  ? actionsForElement(selection.kind).map(({ label, prompt }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => send(prompt)}
                        disabled={composerLocked}
                        className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                      >
                        {label}
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
            <PromptInputTextarea
              ref={inputRef}
              value={value}
              maxLength={INSTRUCTION_LIMIT}
              disabled={composerLocked}
              placeholder={
                factQuestion
                  ? "Type your answer…"
                  : selection
                    ? "Describe the change to this block…"
                    : onFirstBuild
                      ? "Describe your business, or say “build my website”…"
                      : "Ask Revora to change anything…"
              }
              aria-label="Tell Revora what to change"
              className="max-h-40 min-h-[48px] px-4 pt-3 text-[16px] leading-6"
              enterKeyHint="send"
              onChange={(event) => setValue(event.target.value)}
            />
            <PromptInputFooter className="items-center justify-between gap-2 px-2 pb-2">
              <PromptInputTools className="gap-0.5">
                <WebsiteBriefDialog businessName={businessName} disabled={composerLocked} onUse={setValue} />
                <PromptInputButton
                  className={cn(
                    "size-9 rounded-full p-0 text-muted-foreground hover:text-foreground",
                    (mediaOpen || attachments.length > 0) && "bg-muted text-foreground",
                  )}
                  onClick={() => setMediaOpen((open) => !open)}
                  disabled={composerLocked}
                  aria-label="Add photo, video or voice"
                  aria-expanded={mediaOpen}
                  title={requests.capabilities ? (attachmentNotice(requests.capabilities, "image") ?? "Add photo, video or voice") : "Add photo, video or voice"}
                >
                  {mediaOpen ? <X className="size-4" aria-hidden /> : <Plus className="size-[18px]" aria-hidden />}
                </PromptInputButton>
                <VoiceDictationButton
                  disabled={composerLocked}
                  onText={(text) => setValue((prior) => (prior ? `${prior.trim()} ${text}` : text).slice(0, INSTRUCTION_LIMIT))}
                />
                {attachments.length ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <ImagePlus className="size-3.5" aria-hidden /> {attachments.length}
                    <span className="sr-only"> attached</span>
                  </span>
                ) : null}
              </PromptInputTools>
              <div className="flex items-center gap-2">
                {value.length > INSTRUCTION_LIMIT * 0.8 ? (
                  <span className="tnum text-xs text-muted-foreground">
                    {value.length}/{INSTRUCTION_LIMIT}
                  </span>
                ) : null}
                <PromptInputSubmit
                  {...(busy ? { status: "submitted" as const } : {})}
                  disabled={!canSend}
                  aria-label={busy ? "Revora is working — your message will queue" : "Send"}
                  className={cn(
                    "size-9 rounded-full transition-all",
                    canSend ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground",
                  )}
                >
                  {busy && !canSend ? undefined : <ArrowUp className="size-[18px]" aria-hidden />}
                </PromptInputSubmit>
              </div>
            </PromptInputFooter>
          </PromptInput>

          {mediaOpen || attachments.length ? (
            <div className="mt-2 rounded-2xl border border-border/70 bg-card/60 p-3">
              <AssistantMedia
                organizationId={organizationId ?? undefined}
                attachments={attachments}
                onChange={setAttachments}
                onTranscript={(text) => setValue((prior) => (prior ? `${prior.trim()} ${text}` : text).slice(0, INSTRUCTION_LIMIT))}
                onInsert={(text) => setValue((prior) => (prior ? `${prior.trim()} ${text}` : text).slice(0, INSTRUCTION_LIMIT))}
                disabled={composerLocked}
              />
            </div>
          ) : null}
          {requests.summary ? (
            <p className="mt-1.5 truncate px-1 text-center text-xs text-muted-foreground" role="status">
              {requests.summary}
            </p>
          ) : null}
          <p className="sr-only">Every change saves a restore point first. On a live website, checked changes go live straight away.</p>
        </div>
      </div>
    </section>
  );
}

/**
 * The confirm card for replacing the whole draft. It says what happens before
 * anything does: a backup is saved, the live site is untouched, and a failed
 * rebuild restores the draft.
 */
export function RebuildConfirm({
  allowed,
  busy,
  onConfirm,
  onCancel,
}: {
  allowed: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card/50 p-3.5" role="group" aria-label="Confirm a fresh rebuild">
      <p className="font-medium text-foreground">{allowed ? "Replace your whole draft with a fresh build?" : "Only an owner or admin can replace the whole draft"}</p>
      <p className="text-[14px] leading-6 text-muted-foreground">
        {allowed
          ? "I save a backup first, then design every page again from your saved facts and what you just asked for. Your live site isn't touched until you publish, and if the rebuild fails your draft is put back."
          : "Tell me what you'd like changed and I'll edit the site you have, or ask an owner or admin to start a fresh rebuild."}
      </p>
      {allowed && busy ? <p className="text-[13px] text-muted-foreground">A build is already running. Wait for it to finish first.</p> : null}
      <div className="flex flex-wrap gap-2">
        {allowed ? (
          <Button size="sm" variant="destructive" data-tap="primary" disabled={busy} onClick={onConfirm}>
            Start fresh rebuild
          </Button>
        ) : null}
        <Button size="sm" variant="outline" data-tap="primary" onClick={onCancel}>
          {allowed ? "Keep my site" : "OK"}
        </Button>
      </div>
    </div>
  );
}

/** The owner's message: a warm bubble on the right, like Claude and ChatGPT. */
function UserTurn({ text, attachments = 0 }: { text: string; attachments?: number }) {
  return (
    <div className="flex justify-end">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--chat-user-bg)] px-3.5 py-2.5 text-[15px] leading-6 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {text}
        {attachments ? (
          <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <ImagePlus className="size-3.5" aria-hidden /> {attachments} attachment{attachments === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Revora's turn: open, full-width text; the avatar only shows on wider screens. */
function AssistantTurn({ children }: { children: ReactNode }) {
  return (
    <div className="group/turn flex items-start gap-3">
      <img src="/revora-mark-144.png" alt="Revora" className="mt-1 hidden size-6 shrink-0 rounded-md sm:flex" />
      <div className="min-w-0 flex-1 space-y-2 text-[15px] leading-7">{children}</div>
    </div>
  );
}

/**
 * Live "what the AI is doing right now" card. Shows only steps the server has
 * genuinely recorded, plus a running timer so the owner sees it's alive.
 * Screen readers hear each new stage once (never the ticking timer).
 */
function LiveActivity({
  organizationId,
  requestId,
  fallback,
}: {
  organizationId: string | null | undefined;
  requestId?: string;
  fallback: string;
}) {
  const { latest: rawLatest, steps: allSteps } = useBuildProgress(organizationId, true, requestId);
  // "model at work" rows name the model that actually answered; they show as a
  // badge rather than as a step. Only genuinely recorded answers appear.
  const MODEL_STAGE = "model at work";
  const workingModel = allSteps.find((step) => step.stage === MODEL_STAGE)?.detail ?? null;
  const steps = allSteps.filter((step) => step.stage !== MODEL_STAGE);
  const askedModels = modelsAsked(allSteps);
  const timed = new Map(timedSteps(steps).map((step) => [step.stage, step.durationMs]));
  const latest = rawLatest?.stage === MODEL_STAGE ? (steps[0] ?? null) : rawLatest;
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  // Consecutive repeats of the same stage (one per free-model attempt) collapse
  // into a single line: the live detail under the shimmer already shows which
  // model is being asked right now. We also collapse ALL duplicates — not just
  // consecutive ones — so alternating stages like "reading your message" /
  // "reading your business" from deferred retries don't fill the card.
  const done = steps
    .slice(1)
    .reverse()
    .filter((step, index, all) => index === 0 || all[index - 1]!.stage !== step.stage)
    // Second pass: remove any stage that already appeared earlier in the list.
    .filter((step, index, all) =>
      index === all.findIndex((s) => s.stage === step.stage),
    )
    .slice(0, 20);
  const [open, setOpen] = useState(true);
  const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const stageText = latest ? `${latest.stage}…` : fallback;
  // One announcement per finished stage (the stage line itself is live too).
  const lastDone = done[done.length - 1]?.stage ?? null;
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <span className="relative grid size-5 shrink-0 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 motion-reduce:animate-none" aria-hidden />
          <span className="relative size-2 rounded-full bg-primary" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm" aria-live="polite" aria-atomic="true">
          <Shimmer as="span">{stageText}</Shimmer>
        </span>
        <span className="tnum shrink-0 text-xs text-muted-foreground" aria-hidden="true">{elapsed}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {lastDone ? <span className="sr-only" role="status">{`Done: ${lastDone}`}</span> : null}
      {open ? (
        <div className="space-y-1.5 border-t border-border/60 px-3.5 py-2.5">
          {done.length ? (
            <ol className="space-y-1.5">
              {done.map((step) => (
                <li key={`${step.stage}-${step.at}`} className="chat-rise flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
                  <span className="min-w-0 flex-1 break-words">
                    {step.stage}
                    {step.stage === "plan ready" && step.detail ? (
                      <span className="mt-0.5 block text-foreground/80">{step.detail}</span>
                    ) : step.detail ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground/80">{step.detail}</span>
                    ) : null}
                  </span>
                  {timed.get(step.stage) != null ? (
                    <span className="tnum shrink-0 text-xs text-muted-foreground/70">{formatDuration(timed.get(step.stage))}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
          {workingModel ? (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Model answering:</span>
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-foreground break-all">
                {workingModel}
              </span>
            </p>
          ) : null}
          {askedModels.length > 1 ? (
            <p className="text-xs text-muted-foreground">Asked so far: {askedModels.join(" → ")}</p>
          ) : null}
          {latest?.detail ? (
            <p className="text-xs break-words text-muted-foreground">{latest.detail}</p>
          ) : null}
          {!latest && !done.length ? <TypingDots /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** One request's honest state: what Revora will do, did, or couldn't do. */
function TaskBody({
  task,
  requests,
  organizationId,
  isActive,
  onAnswer,
  onOpenHistory,
  onShowPreview,
  onReveal,
  onStopBuild,
  stoppingBuild = false,
  onFollowUp,
}: {
  task: ChatTask;
  requests: BuilderRequests;
  /** True only for the one request currently being worked on. */
  isActive: boolean;
  organizationId: string | null | undefined;
  /** Picks one of Revora's questions to answer with the next message. */
  onAnswer: (question: string) => void;
  onOpenHistory?: () => void;
  onShowPreview?: () => void;
  onReveal?: (target: StepTarget) => void;
  onStopBuild?: (jobId: string) => void;
  stoppingBuild?: boolean;
  onFollowUp: (prompt: string) => void;
}) {
  const working = task.state === "queued" || task.state === "planning" || task.state === "building";
  const timeline = timelineFor(task);
  // Applied requests get one result card, drawn from the stored counts.
  const result = task.state === "complete" && !task.answered && (task.applied ?? 0) > 0;
  const skipped = (task.failedCount ?? 0) + (task.staleCount ?? 0);
  const improvePrompt = `Review what you did for my request: “${task.instruction}”. Inspect the website, fix anything incomplete or lower quality, and apply the improvements without inventing facts.`;
  const retrySkippedPrompt = `Try again the ${skipped} change${skipped === 1 ? "" : "s"} from my request “${task.instruction}” that didn't go through last time. Plan ${skipped === 1 ? "it" : "them"} against my site as it is now.`;
  return (
    <div className="space-y-2">
      {task.waitingOnBuild && working ? (
        // Held behind the first build: show that build's own log, not empty dots.
        <WorkFeed organizationId={organizationId} {...(onStopBuild ? { onStop: onStopBuild } : {})} stopping={stoppingBuild} />
      ) : task.isBuild && working ? (
        <WorkFeed organizationId={organizationId} runId={requests.progressRunId(task.id)} {...(onStopBuild ? { onStop: onStopBuild } : {})} stopping={stoppingBuild} />
      ) : working && isActive ? (
        <LiveActivity
          organizationId={organizationId}
          requestId={requests.progressRunId(task.id)}
          fallback={
            task.state === "queued"
              ? "Got it — I’m starting now…"
              : task.state === "planning"
                ? "Working out the change…"
                : "Applying…"
          }
        />
      ) : working ? (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <p className="flex min-w-0 flex-1 items-center gap-1.5" role="status">
            <span className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
            Waiting — I’ll start this as soon as the current change is done
          </p>
          {task.state === "queued" ? (
            // A queued request hasn't started, so removing it really cancels
            // it. The active one has no stop: the server can't be interrupted.
            <button
              type="button"
              onClick={() => requests.dismiss(task.id)}
              className="relative min-h-8 shrink-0 cursor-pointer rounded-full px-2.5 text-[13px] font-medium text-foreground underline-offset-2 after:absolute after:-inset-1.5 hover:underline"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : task.answered || result ? null : (
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-[13px] font-medium",
            task.state === "complete" ? "text-emerald-400" : task.state === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {task.state === "complete" ? <Check className="size-3.5" aria-hidden /> : null}
          {QUEUE_LABELS[task.state]}
        </p>
      )}

      {task.reply ? <ReplyText text={task.reply} className="text-[15px] leading-7" /> : null}
      {task.error ? <p className="text-sm leading-6">{task.error}</p> : null}
      {/* A build started here keeps its work log under its message once it has ended. */}
      {task.isBuild && !working ? <WorkFeed organizationId={organizationId} runId={requests.progressRunId(task.id)} live={false} /> : null}

      {working && isActive && !task.isBuild && !task.waitingOnBuild ? (
        <p className="text-xs text-muted-foreground">
          {timeline.stages[timeline.current]}
        </p>
      ) : null}

      {result ? (
        <ApplyResultCard
          applied={task.applied ?? 0}
          failedCount={task.failedCount}
          staleCount={task.staleCount}
          reasons={task.reasons}
          titles={task.titles ?? task.steps.filter((step) => step.included).map((step) => step.title)}
          {...(!task.titles && onReveal
            ? { reveals: task.steps.filter((step) => step.included).map((step) => (step.target ? () => onReveal(step.target!) : null)) }
            : {})}
          details={task.details}
          onRetrySkipped={skipped > 0 ? () => onFollowUp(retrySkippedPrompt) : undefined}
          onUndo={onOpenHistory}
          onPreview={onShowPreview}
        />
      ) : null}
      {task.notice ? <p className="text-sm leading-6 text-muted-foreground">{task.notice}</p> : null}

      {task.requirements?.length ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label="Requested result coverage">
          {task.requirements.map((requirement) => (
            <li key={requirement.label}>
              {requirement.covered ? "✓" : "Still open:"} {requirement.label}
            </li>
          ))}
        </ul>
      ) : null}

      {!result && task.details?.length ? (
        <details>
          <summary className="min-h-9 cursor-pointer py-2 text-xs text-muted-foreground">Technical details</summary>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {task.details.map((line, index) => (
              <li key={`${line}-${index}`} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {task.questions.length ? (
        <div className="space-y-1.5">
          {task.questions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onAnswer(question)}
              className="flex min-h-11 w-full cursor-pointer items-start gap-2 rounded-xl border border-border/70 bg-card/40 px-3 py-2.5 text-left text-sm leading-6 transition-colors hover:border-primary/45 hover:bg-card"
            >
              <span className="text-primary" aria-hidden>?</span>
              <span className="min-w-0 flex-1">{question}</span>
              <span className="shrink-0 text-xs leading-6 text-muted-foreground">Answer</span>
            </button>
          ))}
        </div>
      ) : null}

      {task.composition ? <CompositionPreviewCard composition={task.composition} /> : null}

      {task.steps.length && !result ? (
        <details
          className="group"
          open={task.steps.length <= 8 && task.state === "waiting_for_approval"}
        >
          <summary className="min-h-9 cursor-pointer py-1.5 text-sm font-medium">
            {task.state === "waiting_for_approval"
              ? `Here's what I'll change — ${task.steps.length} update${task.steps.length === 1 ? "" : "s"}`
              : `${task.steps.length} update${task.steps.length === 1 ? "" : "s"} in this request`}
            <span className="ml-1 font-normal text-muted-foreground group-open:hidden">
              (tap to review)
            </span>
          </summary>
          <ul className="mt-2 space-y-1">
            {task.steps.map((step, index) => (
              <li key={step.key} className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-[13px] leading-5">
                <input
                  type="checkbox"
                  checked={step.included}
                  disabled={task.state !== "waiting_for_approval"}
                  aria-label={`Include: ${step.title}`}
                  onChange={() => requests.toggleStep(task.id, step.key)}
                  className="mt-0.5 size-4 shrink-0 accent-current"
                />
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    !step.included && "text-muted-foreground line-through",
                  )}
                >
                  <span className="block font-medium">{step.title}</span>
                  <span className="block opacity-70">{step.where}</span>
                  {step.before || step.after ? (
                    <span className="mt-1 grid gap-1 text-xs leading-relaxed">
                      {step.before ? <span className="line-clamp-2 text-muted-foreground">Before: {step.before}</span> : null}
                      {step.after ? <span className="line-clamp-2 text-foreground">After: {step.after}</span> : null}
                    </span>
                  ) : null}
                  {step.destructive ? <span className="ml-1 opacity-80">— removes content</span> : null}
                  {step.target && onReveal ? (
                    <button
                      type="button"
                      onClick={() => onReveal(step.target!)}
                      aria-label={`Show in preview: ${step.title}`}
                      className="relative mt-1 inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground underline-offset-2 after:absolute after:-inset-2 hover:text-foreground hover:underline"
                    >
                      <Eye className="size-3" aria-hidden /> Show in preview
                    </button>
                  ) : null}
                </span>
                {task.state === "waiting_for_approval" ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Move up: ${step.title}`}
                      disabled={index === 0}
                      onClick={() => requests.moveStep(task.id, step.key, -1)}
                      className="relative cursor-pointer rounded p-1 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground disabled:opacity-40"
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move down: ${step.title}`}
                      disabled={index === task.steps.length - 1}
                      onClick={() => requests.moveStep(task.id, step.key, 1)}
                      className="relative cursor-pointer rounded p-1 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground disabled:opacity-40"
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove: ${step.title}`}
                      onClick={() => requests.dropStep(task.id, step.key)}
                      className="relative cursor-pointer rounded p-1 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!working && (task.reply || result) ? (
        <MessageMenu
          organizationId={organizationId}
          instruction={task.instruction}
          text={task.reply || task.titles?.join("\n") || ""}
          onImprove={() => onFollowUp(improvePrompt)}
          onUndo={(task.applied ?? 0) > 0 ? onOpenHistory : undefined}
          onClear={() => requests.dismiss(task.id)}
        />
      ) : null}

      <div className="flex flex-wrap gap-2 empty:hidden">
        {task.state === "waiting_for_approval" && task.steps.length ? (
          <Button
            size="sm"
            variant="signal"
            data-tap="primary"
            disabled={requests.busy || requests.approvedCount(task) === 0}
            onClick={() => requests.apply(task)}
          >
            Approve &amp; apply
          </Button>
        ) : null}
        {task.state === "complete" && (task.applied ?? 0) > 0 && onOpenHistory && !result ? (
          <Button size="sm" variant="outline" data-tap="primary" onClick={onOpenHistory}>
            <History className="size-4" /> Undo or restore
          </Button>
        ) : null}
        {/* retryable === false means a retry here would be the wrong thing
            (a first build would go to the edit planner; photos must be
            re-attached; access is blocked), so no Try again is offered. */}
        {(task.state === "failed" && task.retryable !== false) || task.retryable ? (
          <Button
            size="sm"
            variant="outline"
            data-tap="primary"
            disabled={requests.busy}
            onClick={() => requests.retry(task.id)}
          >
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
