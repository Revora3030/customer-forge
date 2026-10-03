/**
 * One assistant for the whole builder.
 *
 * Everything an owner used to do in five different boxes — ask for a change,
 * ask for a full website, ask for an audit, ask for growth ideas — happens in
 * this single conversation. It is a presentation surface only: planning,
 * approval and applying stay in the existing request engine
 * (`useBuilderRequests`), which still saves a version first and still waits for
 * an explicit press before anything is removed.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ImagePlus,
  Sparkles,
  SquarePen,
  X,
  Copy,
  History,
  MoreHorizontal,
  Plus,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssistantMedia } from "@/components/app/AssistantMedia";
import { CompositionPreviewCard } from "@/components/app/CompositionPreviewCard";
import { attachmentNotice } from "@/lib/builder/capabilities";
import { useBuildProgress } from "@/lib/builder/progress.hooks";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiSuggestions } from "@/lib/ai-suggestions.functions";
import { QUEUE_LABELS, timelineFor, type QueueTask } from "@/lib/builder-queue";
import { onAssistantPrompt } from "@/lib/assistant-bridge";
import { selectionPrefix } from "@/lib/builder/preview-bridge";
import { INSTRUCTION_LIMIT, type BuilderRequests } from "@/lib/builder-requests.hooks";
import type { AgentAttachment } from "@/lib/site-agent";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/ui/notify";


export function BuilderAssistant({
  organizationId,
  requests,
  emptyTitle,
  emptyHint,
  businessName = null,
  compact = false,
  selection = null,
  onClearSelection,
  onOpenHistory,
  onFirstBuild,
  firstBuildBusy = false,
  publishState = "draft",
  factQuestion = null,
  onFactAnswer,
  onFactSkip,
  banner = null,
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
  onClearSelection?: () => void;
  /** Opens History, where the before-and-after comparison lives. */
  onOpenHistory?: () => void;
  /** Fresh workspaces use the full Sol → Terra first-build pipeline, not the edit planner. */
  onFirstBuild?: (instruction: string) => Promise<void>;
  firstBuildBusy?: boolean;
  publishState?: string;
  /** A fact Revora still needs from the owner, asked in the chat. */
  factQuestion?: { key: string; label: string; prompt: string; required: boolean } | null;
  onFactAnswer?: (key: string, answer: string) => Promise<void>;
  onFactSkip?: (key: string) => void;
}) {
  const [value, setValue] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [factLog, setFactLog] = useState<{ question: string; answer: string }[]>([]);
  const [factBusy, setFactBusy] = useState(false);
  /** A question Revora asked, which the next message answers. */
  const [answering, setAnswering] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    queryFn: () => fetchSuggestions({ data: { organizationId: organizationId! } }),
  });
  const SUGGESTIONS = suggestionsQuery.data?.suggestions ?? [];

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


  const busy = requests.busy || firstBuildBusy || factBusy;
  const empty = requests.tasks.length === 0 && !factQuestion && factLog.length === 0;
  const canSend = requests.ready && (value.trim().length > 0 || attachments.length > 0);
  const runSuggestion = (instruction: string) =>
    onFirstBuild ? void onFirstBuild(instruction) : requests.queue(instruction);

  return (
    <section
      id="website-assistant"
      className={cn(
        "builder-conversation relative flex w-full max-w-full min-w-0 flex-col overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none lg:rounded-2xl lg:border lg:border-border/70 lg:bg-card/40",
        compact ? "h-[calc(100dvh-8.75rem)] min-h-[420px] lg:h-[calc(100vh-7.5rem)]" : "h-[calc(100dvh-8rem)] min-h-[420px]",
      )}
    >
      {/* ------------------------------ Chat header ----------------------------- */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border/60 px-4 py-2.5 sm:px-5">
        <span className="relative inline-flex size-7 shrink-0">
          <img src="/revora-mark-144.png" alt="" className="size-7 rounded-lg" />
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background",
              busy ? "animate-pulse bg-primary" : "bg-emerald-400",
            )}
            aria-hidden
          />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[13.5px] font-semibold">Revora</p>
          <p className="truncate text-[11.5px] text-muted-foreground" aria-live="polite">
            {busy ? "Working on your website…" : "AI website team · ready"}
          </p>
        </div>
        {requests.tasks.length > 0 && !requests.busy ? (
          <button
            type="button"
            onClick={() => void requests.newChat()}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            title="Start a new conversation"
          >
            <SquarePen className="size-3.5" aria-hidden /> New chat
          </button>
        ) : null}
      </header>
      {banner ? <div className="shrink-0 px-3 pt-2 empty:hidden sm:px-4">{banner}</div> : null}

      <Conversation className="min-h-0 flex-1 overscroll-contain" onPointerDown={dismissKeyboard}>
        <ConversationContent className="mx-auto w-full max-w-3xl gap-7 px-4 py-6 text-[15px] leading-relaxed sm:px-6">
          {empty ? (
            <div className="chat-rise flex min-h-[46vh] flex-col justify-center gap-6 py-4">
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
                <p className="mx-auto max-w-md text-[14px] leading-relaxed text-muted-foreground">
                  {emptyHint}
                </p>
              </div>
              {SUGGESTIONS.length || suggestionsQuery.isFetching ? (
                <div className="mx-auto w-full max-w-xl space-y-2">
                  <p className="flex items-center gap-1.5 px-1 text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                    <Sparkles className="size-3.5 text-primary" aria-hidden /> Suggested for your site
                  </p>
                  {suggestionsQuery.isFetching && SUGGESTIONS.length === 0
                    ? [0, 1, 2].map((key) => (
                        <div key={key} className="h-[52px] animate-pulse rounded-xl border border-border/60 bg-muted/40" />
                      ))
                    : SUGGESTIONS.slice(0, 4).map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          disabled={!requests.ready}
                          onClick={() => runSuggestion(action.instruction)}
                          className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-3.5 py-3 text-left transition-all hover:border-primary/45 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-medium text-foreground">{action.label}</span>
                            {action.reason ? (
                              <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{action.reason}</span>
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
            const activeTaskId = requests.tasks.find(
              (t) => t.state === "planning" || t.state === "building",
            )?.id ?? requests.tasks.find((t) => t.state === "queued")?.id ?? null;
            return requests.tasks.map((task) => (
              <div key={task.id} className="chat-rise space-y-4">
                <UserTurn text={task.instruction} attachments={task.attachments?.length ?? 0} />
                <AssistantTurn>
                  <TaskBody
                    task={task}
                    requests={requests}
                    isActive={task.id === activeTaskId}
                    organizationId={organizationId}
                    onAnswer={setAnswering}
                    {...(onOpenHistory ? { onOpenHistory } : {})}
                    publishState={publishState}
                    onFollowUp={(prompt) => {
                      setValue(prompt.slice(0, INSTRUCTION_LIMIT));
                      window.requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                  />
                </AssistantTurn>
              </div>
            ));
          })()}

          {factLog.map((entry, i) => (
            <div key={`fact-${i}`} className="chat-rise space-y-4">
              <AssistantTurn>
                <p className="text-[15px]">{entry.question}</p>
              </AssistantTurn>
              <UserTurn text={entry.answer} />
            </div>
          ))}

          {factQuestion ? (
            <div className="chat-rise">
              <AssistantTurn>
                <div className="space-y-2">
                  <p className="text-[15px] font-medium text-foreground">{factQuestion.label}</p>
                  <p className="text-[14px] text-muted-foreground">{factQuestion.prompt}</p>
                  {factBusy ? <Shimmer>Saving and updating your site…</Shimmer> : null}
                  {!factQuestion.required && onFactSkip && !factBusy ? (
                    <button
                      type="button"
                      onClick={() => onFactSkip(factQuestion.key)}
                      className="cursor-pointer rounded-full border border-border px-3 py-1 text-[12.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      Skip for now
                    </button>
                  ) : null}
                </div>
              </AssistantTurn>
            </div>
          ) : null}

          {(firstBuildBusy || factBusy) && !requests.busy ? (
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
        <div className="mx-auto w-full max-w-3xl">
          {!empty && (SUGGESTIONS.length > 0 || (suggestionsQuery.isFetching && !busy)) ? (
            <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {suggestionsQuery.isFetching && SUGGESTIONS.length === 0 ? (
                <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-border/70 px-3 text-[12.5px] text-muted-foreground">
                  <Shimmer>Finding ideas for your site…</Shimmer>
                </span>
              ) : null}
              {(moreOpen ? SUGGESTIONS : SUGGESTIONS.slice(0, 4)).map((action) => (
                <button
                  key={action.label}
                  type="button"
                  title={action.reason}
                  disabled={!requests.ready}
                  onClick={() => runSuggestion(action.instruction)}
                  className="builder-suggestion inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-card/50 px-3 text-[12.5px] text-foreground transition-colors hover:border-primary/50 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <Sparkles className="size-3 text-primary" aria-hidden />
                  {action.label}
                </button>
              ))}
              {SUGGESTIONS.length > 4 ? (
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((open) => !open)}
                  className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {moreOpen ? "Fewer" : `+${SUGGESTIONS.length - 4} more`}
                </button>
              ) : null}
            </div>
          ) : null}

          <PromptInput
            className={cn(
              "builder-prompt rounded-[22px] border border-border bg-card shadow-lift transition-all",
              busy && "is-thinking border-primary/35",
            )}
            onSubmit={(_message, event) => {
              event.preventDefault();
              send(value);
            }}
          >
            {selection || answering ? (
              <div className="order-first flex w-full flex-wrap gap-1.5 px-3 pt-3">
                {selection ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 py-1 pr-1 pl-2.5 text-[12px] text-foreground">
                    <span className="truncate">Editing: {selection.label ?? selection.kind ?? "the block you picked"}</span>
                    <button
                      type="button"
                      onClick={() => onClearSelection?.()}
                      aria-label="Stop editing this block"
                      className="grid size-5 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-primary/15 hover:text-foreground"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ) : null}
                {answering ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/60 py-1 pr-1 pl-2.5 text-[12px] text-foreground">
                    <span className="truncate">Answering: {answering}</span>
                    <button
                      type="button"
                      onClick={() => setAnswering(null)}
                      aria-label="Stop answering this question"
                      className="grid size-5 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ) : null}
                {selection
                  ? (
                      [
                        ["Rewrite copy", "Rewrite the copy on this block to be clearer and more compelling."],
                        ["Replace image", "Replace the image on this block with a better-fitting one."],
                        ["New layout", "Change the layout of this block to something more visually interesting."],
                        ["Shorter", "Make this block shorter and more concise."],
                      ] as const
                    ).map(([label, prompt]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => send(prompt)}
                        disabled={!requests.ready}
                        className="inline-flex cursor-pointer items-center rounded-lg border border-border/70 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
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
              disabled={!requests.ready}
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
              className="max-h-48 min-h-[52px] px-4 pt-3.5 text-[16px] leading-relaxed"
              enterKeyHint="send"
              onChange={(event) => setValue(event.target.value)}
            />
            <PromptInputFooter className="items-center justify-between gap-2 px-2.5 pb-2.5">
              <PromptInputTools className="gap-1">
                <PromptInputButton
                  className={cn(
                    "size-9 rounded-full p-0 text-muted-foreground hover:text-foreground",
                    (mediaOpen || attachments.length > 0) && "bg-muted text-foreground",
                  )}
                  onClick={() => setMediaOpen((open) => !open)}
                  disabled={!requests.ready}
                  aria-label="Add photo, video or voice"
                  aria-expanded={mediaOpen}
                  title={requests.capabilities ? (attachmentNotice(requests.capabilities, "image") ?? "Add photo, video or voice") : "Add photo, video or voice"}
                >
                  {mediaOpen ? <X className="size-4" aria-hidden /> : <Plus className="size-[18px]" aria-hidden />}
                </PromptInputButton>
                {attachments.length ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
                    <ImagePlus className="size-3" aria-hidden /> {attachments.length}
                  </span>
                ) : null}
              </PromptInputTools>
              <div className="flex items-center gap-2">
                {value.length > INSTRUCTION_LIMIT * 0.8 ? (
                  <span className="tnum text-[11px] text-muted-foreground">
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
                disabled={!requests.ready}
              />
            </div>
          ) : null}
          <p className="mt-1.5 px-1 text-center text-[11px] text-muted-foreground" role="status">
            {requests.summary ?? "Every change saves a restore point first. Nothing goes live until you publish."}
          </p>
        </div>
      </div>
    </section>
  );
}

/** The owner's message: a quiet bubble on the right, like Lovable and ChatGPT. */
function UserTurn({ text, attachments = 0 }: { text: string; attachments?: number }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-[20px] rounded-br-md bg-muted px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {text}
        {attachments ? (
          <span className="mt-1 flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <ImagePlus className="size-3" aria-hidden /> {attachments} attachment{attachments === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Revora's turn: open, document-style text with a small avatar — no heavy card. */
function AssistantTurn({ children }: { children: ReactNode }) {
  return (
    <div className="group/turn flex items-start gap-3">
      <img src="/revora-mark-144.png" alt="Revora" className="mt-0.5 size-6 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2 pt-px">{children}</div>
    </div>
  );
}

/**
 * Live "what the AI is doing right now" card. Shows only steps the server has
 * genuinely recorded, plus a running timer so the owner sees it's alive.
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
  const { latest, steps } = useBuildProgress(organizationId, true, requestId);
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
    .slice(0, 12);
  const [open, setOpen] = useState(true);
  const elapsed = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40" aria-live="polite">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="relative grid size-5 shrink-0 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" aria-hidden />
          <span className="relative size-2 rounded-full bg-primary" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          <Shimmer as="span">{latest ? `${latest.stage}…` : fallback}</Shimmer>
        </span>
        <span className="tnum shrink-0 text-[11.5px] text-muted-foreground">{elapsed}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-1.5 border-t border-border/60 px-3.5 py-2.5">
          {done.length ? (
            <ol className="space-y-1.5">
              {done.map((step) => (
                <li key={`${step.stage}-${step.at}`} className="chat-rise flex items-start gap-2 text-[12.5px] text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-hidden />
                  <span className="min-w-0 break-words">{step.stage}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {latest?.detail ? (
            <p className="text-[12px] break-words text-muted-foreground">{latest.detail}</p>
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
  publishState,
  onFollowUp,
}: {
  task: QueueTask;
  requests: BuilderRequests;
  /** True only for the one request currently being worked on. */
  isActive: boolean;
  organizationId: string | null | undefined;
  /** Picks one of Revora's questions to answer with the next message. */
  onAnswer: (question: string) => void;
  onOpenHistory?: () => void;
  publishState: string;
  onFollowUp: (prompt: string) => void;
}) {
  const working = task.state === "queued" || task.state === "planning" || task.state === "building";
  const timeline = timelineFor(task);
  return (
    <div className="space-y-2">
      {working && isActive ? (
        <LiveActivity
          organizationId={organizationId}
          requestId={task.id}
          fallback={
            task.state === "queued"
              ? "Got it — I’m starting now…"
              : task.state === "planning"
                ? "Working out the change…"
                : "Applying…"
          }
        />
      ) : working ? (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground" role="status">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
          Waiting — I’ll start this as soon as the current change is done
        </p>
      ) : task.answered ? null : (
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-[12px] font-medium",
            task.state === "complete" ? "text-emerald-400" : task.state === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {task.state === "complete" ? <Check className="size-3.5" aria-hidden /> : null}
          {QUEUE_LABELS[task.state]}
        </p>
      )}

      {task.reply ? (
        <ReplyText
          text={task.reply}
          className="text-[15px] leading-relaxed"
        />
      ) : null}
      {task.error ? <p className="text-[12.5px]">{task.error}</p> : null}

      {working && isActive ? (
        <p className="text-[11.5px] text-muted-foreground">
          {timeline.stages[timeline.current]}
        </p>
      ) : null}

      {task.state === "complete" && !task.answered && !/\d+\s+changes?\s+applied/i.test(task.reply ?? "") ? (
        <div className="space-y-1 text-[12px] text-muted-foreground">
          <p>
          {task.applied ?? 0} change{(task.applied ?? 0) === 1 ? "" : "s"} applied
          {task.failedCount ? `, ${task.failedCount} couldn't be applied` : ""}
          {task.staleCount ? `, ${task.staleCount} skipped` : ""}.
          </p>
          {publishState !== "published" ? <p>Draft updated — publish to make this public.</p> : null}
        </div>
      ) : null}
      {task.notice ? <p className="text-[12.5px]">{task.notice}</p> : null}

      {task.requirements?.length ? (
        <ul className="space-y-0.5 text-[11.5px] text-muted-foreground" aria-label="Requested result coverage">
          {task.requirements.map((requirement) => (
            <li key={requirement.label}>
              {requirement.covered ? "✓" : "Still open:"} {requirement.label}
            </li>
          ))}
        </ul>
      ) : null}

      {task.details?.length ? (
        <details>
          <summary className="cursor-pointer text-[12px] text-muted-foreground">Details</summary>
          <ul className="mt-1 space-y-0.5 text-[11.5px] text-muted-foreground">
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
              className="flex w-full cursor-pointer items-start gap-2 rounded-xl border border-border/70 bg-card/40 px-3 py-2 text-left text-[13.5px] transition-colors hover:border-primary/45 hover:bg-card"
            >
              <span className="mt-0.5 text-primary" aria-hidden>?</span>
              <span className="min-w-0 flex-1">{question}</span>
              <span className="shrink-0 text-[11.5px] text-muted-foreground">Answer</span>
            </button>
          ))}
        </div>
      ) : null}

      {task.composition ? <CompositionPreviewCard composition={task.composition} /> : null}

      {task.steps.length ? (
        <details
          className="group"
          open={task.steps.length <= 8 && task.state === "waiting_for_approval"}
        >
          <summary className="cursor-pointer text-[12.5px] font-medium">
            {task.state === "waiting_for_approval"
              ? `Here's what I'll change — ${task.steps.length} update${task.steps.length === 1 ? "" : "s"}`
              : `${task.steps.length} update${task.steps.length === 1 ? "" : "s"} in this request`}
            <span className="ml-1 font-normal text-muted-foreground group-open:hidden">
              (tap to review)
            </span>
          </summary>
          <ul className="mt-2 space-y-1">
            {task.steps.map((step, index) => (
              <li key={step.key} className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={step.included}
                  disabled={task.state !== "waiting_for_approval"}
                  aria-label={`Include: ${step.title}`}
                  onChange={() => requests.toggleStep(task.id, step.key)}
                  className="size-4 shrink-0 accent-current"
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
                    <span className="mt-1 grid gap-1 text-[11px] leading-relaxed">
                      {step.before ? <span className="line-clamp-2 text-muted-foreground">Before: {step.before}</span> : null}
                      {step.after ? <span className="line-clamp-2 text-foreground">After: {step.after}</span> : null}
                    </span>
                  ) : null}
                  {step.destructive ? <span className="ml-1 opacity-80">— removes content</span> : null}
                </span>
                {task.state === "waiting_for_approval" ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Move up: ${step.title}`}
                      disabled={index === 0}
                      onClick={() => requests.moveStep(task.id, step.key, -1)}
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <ArrowUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move down: ${step.title}`}
                      disabled={index === task.steps.length - 1}
                      onClick={() => requests.moveStep(task.id, step.key, 1)}
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <ArrowDown className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove: ${step.title}`}
                      onClick={() => requests.dropStep(task.id, step.key)}
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!working && task.reply ? (
        <AssistantMessageActions
          task={task}
          organizationId={organizationId}
          onFollowUp={onFollowUp}
          {...(onOpenHistory ? { onOpenHistory } : {})}
          onClear={() => requests.dismiss(task.id)}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {task.state === "waiting_for_approval" && task.steps.length ? (
          <Button
            size="sm"
            variant="signal"
            disabled={requests.busy || requests.approvedCount(task) === 0}
            onClick={() => requests.apply(task)}
          >
            Approve &amp; apply
          </Button>
        ) : null}
        {task.state === "complete" && (task.applied ?? 0) > 0 && onOpenHistory ? (
          <Button size="sm" variant="outline" onClick={onOpenHistory}>
            <History className="size-4" /> Undo or restore
          </Button>
        ) : null}
        {task.state === "failed" || task.retryable ? (
          <Button
            size="sm"
            variant="outline"
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

type MessageFeedback = "helpful" | "not_helpful" | null;

function stableMessageKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function AssistantMessageActions({
  task,
  organizationId,
  onFollowUp,
  onOpenHistory,
  onClear,
}: {
  task: QueueTask;
  organizationId: string | null | undefined;
  onFollowUp: (prompt: string) => void;
  onOpenHistory?: () => void;
  onClear: () => void;
}) {
  const storageKey = `revora.builder-feedback.${organizationId ?? "unknown"}.${stableMessageKey(`${task.instruction}\n${task.reply ?? ""}`)}`;
  const [feedback, setFeedback] = useState<MessageFeedback>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setFeedback(saved === "helpful" || saved === "not_helpful" ? saved : null);
    } catch {
      setFeedback(null);
    }
  }, [storageKey]);

  const chooseFeedback = (next: Exclude<MessageFeedback, null>) => {
    const value = feedback === next ? null : next;
    setFeedback(value);
    try {
      if (value) window.localStorage.setItem(storageKey, value);
      else window.localStorage.removeItem(storageKey);
    } catch {
      // Feedback is optional and must never interfere with website changes.
    }
    toast.success(value === "helpful" ? "Marked helpful." : value === "not_helpful" ? "Feedback saved." : "Feedback removed.");
  };

  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(task.reply ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success("Response copied.");
    } catch {
      toast.error("Copy failed — press and hold the response to copy it.");
    }
  };

  const improvePrompt = `Review what you did for my request: “${task.instruction}”. Inspect the website, fix anything incomplete or lower quality, and apply the improvements without inventing facts.`;

  return (
    <MessageActions
      className="-ml-1.5 pt-0.5 text-muted-foreground transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/turn:opacity-100 [@media(hover:hover)]:focus-within:opacity-100"
      aria-label="Response actions"
    >
      <MessageAction tooltip="Review and improve" label="Review and improve" onClick={() => onFollowUp(improvePrompt)}>
        <RotateCcw className="size-4" aria-hidden />
      </MessageAction>
      <MessageAction
        tooltip="Helpful"
        label="Helpful"
        aria-pressed={feedback === "helpful"}
        className={cn(feedback === "helpful" && "bg-primary/15 text-primary")}
        onClick={() => chooseFeedback("helpful")}
      >
        <ThumbsUp className="size-4" aria-hidden />
      </MessageAction>
      <MessageAction
        tooltip="Not helpful"
        label="Not helpful"
        aria-pressed={feedback === "not_helpful"}
        className={cn(feedback === "not_helpful" && "bg-destructive/15 text-destructive")}
        onClick={() => chooseFeedback("not_helpful")}
      >
        <ThumbsDown className="size-4" aria-hidden />
      </MessageAction>
      <MessageAction tooltip="Copy response" label="Copy response" onClick={() => void copyReply()}>
        {copied ? <Check className="size-4 text-primary" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </MessageAction>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <MessageAction tooltip="More actions" label="More actions">
            <MoreHorizontal className="size-4" aria-hidden />
          </MessageAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onFollowUp(improvePrompt)}>
            <RotateCcw /> Review and improve
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyReply()}>
            <Copy /> Copy response
          </DropdownMenuItem>
          {(task.applied ?? 0) > 0 && onOpenHistory ? (
            <DropdownMenuItem onSelect={onOpenHistory}>
              <History /> Undo or restore
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onClear}>
            <Trash2 /> Clear from chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MessageActions>
  );
}
