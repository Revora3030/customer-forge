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
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
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
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ai-elements/message";
import { ReplyText } from "@/components/app/ReplyText";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandChoices } from "@/components/app/BrandChoices";
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
}: {
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


  return (
    <section
      id="website-assistant"
      className={cn(
        "builder-conversation flex w-full max-w-full min-w-0 flex-col overflow-hidden rounded-none border-0 bg-transparent p-0 shadow-none sm:mx-0 lg:rounded-2xl lg:border lg:border-border/80 lg:bg-card/72 lg:shadow-lift",
        compact ? "h-[calc(100dvh-9.75rem)] min-h-[360px] lg:h-[calc(100vh-8rem)]" : "h-[calc(100dvh-9rem)] min-h-[360px]",
      )}
    >
      {requests.tasks.length > 0 && !requests.busy ? (
        <div className="flex justify-end px-4 pt-2 sm:px-6">
          <Button size="sm" variant="ghost" onClick={() => void requests.newChat()}>
            New chat
          </Button>
        </div>
      ) : null}
      <Conversation className="min-h-0 flex-1 overscroll-contain" onPointerDown={dismissKeyboard}>
        <ConversationContent className="gap-8 px-4 py-5 text-[15px] leading-relaxed sm:px-6 lg:px-7">

          {requests.tasks.length === 0 && !factQuestion && factLog.length === 0 ? (
            <div className="chat-rise">
              <Message from="assistant">
                <MessageContent className="w-full space-y-3">
                  <div className="flex items-center gap-2">
                    <img src="/revora-mark-144.png" alt="" className="size-8 rounded-lg shadow-signal" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">Revora</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
                        Your AI team is here and ready
                      </p>
                    </div>
                  </div>
                  <h2 className="gold-text text-lg font-semibold">
                    {businessName ? `Hi — let's build ${businessName}` : emptyTitle}
                  </h2>
                  <p className="text-[13.5px] leading-relaxed text-muted-foreground">{emptyHint}</p>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Tell me in your own words what you do, who you help and where you work. I'll ask
                    for anything else I need, then write and design every page with you — no
                    made-up details, ever.
                  </p>
                </MessageContent>
              </Message>
            </div>
          ) : null}
          {(() => {
            // Lovable-style flow: only the request being worked on right now
            // shows the live activity card; waiting requests get a quiet line.
            const activeTaskId = requests.tasks.find(
              (t) => t.state === "planning" || t.state === "building",
            )?.id ?? requests.tasks.find((t) => t.state === "queued")?.id ?? null;
            return requests.tasks.map((task) => (
            <div key={task.id} className="chat-rise space-y-3">
              <Message from="user">
                <MessageContent className="bg-primary text-primary-foreground">{task.instruction}</MessageContent>
              </Message>
              <Message from="assistant">
                <MessageContent className="w-full">
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
                </MessageContent>
              </Message>
            </div>
          ))}
          {factLog.map((entry, i) => (
            <div key={`fact-${i}`} className="chat-rise space-y-3">
              <Message from="assistant">
                <MessageContent className="w-full text-[14px]">{entry.question}</MessageContent>
              </Message>
              <Message from="user">
                <MessageContent className="bg-primary text-primary-foreground whitespace-pre-wrap">{entry.answer}</MessageContent>
              </Message>
            </div>
          ))}
          {factQuestion ? (
            <div className="chat-rise">
              <Message from="assistant">
                <MessageContent className="w-full space-y-2 text-[14px]">
                  <div className="flex items-center gap-2">
                    <img src="/revora-mark-144.png" alt="" className="size-6 rounded-md" />
                    <span className="text-[12px] font-semibold">Revora</span>
                  </div>
                  <p className="font-medium text-foreground">{factQuestion.label}</p>
                  <p className="text-muted-foreground">{factQuestion.prompt}</p>
                  {factBusy ? <Shimmer>Saving and updating your site…</Shimmer> : null}
                  {!factQuestion.required && onFactSkip && !factBusy ? (
                    <button
                      type="button"
                      onClick={() => onFactSkip(factQuestion.key)}
                      className="cursor-pointer rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground hover:border-primary/55"
                    >
                      Skip for now
                    </button>
                  ) : null}
                </MessageContent>
              </Message>
            </div>
          ) : null}
          {(firstBuildBusy || factBusy) && !requests.busy ? (
            <div className="chat-rise">
              <Message from="assistant">
                <MessageContent className="w-full">
                  <LiveActivity
                    organizationId={organizationId}
                    fallback={firstBuildBusy ? "Starting your website build…" : "Saving your answer…"}
                  />
                </MessageContent>
              </Message>
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="max-h-[55%] shrink-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Everything the old separate AI panels offered, as one tap each. */}
         <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
          {suggestionsQuery.isFetching && SUGGESTIONS.length === 0 ? (
            <span className="builder-suggestion min-h-9 shrink-0 rounded-full border border-border px-3.5 py-1.5 text-[13px] text-muted-foreground">
              <Shimmer>AI team is reviewing your site…</Shimmer>
            </span>
          ) : null}
          {(moreOpen ? SUGGESTIONS : SUGGESTIONS.slice(0, 3)).map((action) => (
            <button
              key={action.label}
              type="button"
              title={action.reason}
              disabled={!requests.ready}
              onClick={() => onFirstBuild ? void onFirstBuild(action.instruction) : requests.queue(action.instruction)}
              className={cn(
                 "builder-suggestion min-h-9 shrink-0 cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-[13px] text-foreground transition-all",
                 "hover:-translate-y-px hover:border-primary/55 hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
              )}
            >
              {action.label}
            </button>
          ))}
          {SUGGESTIONS.length > 3 ? <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            className="gold-hl min-h-9 shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[13px] transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {moreOpen ? "Fewer ideas" : "More ideas"}
          </button> : null}
        </div>

        {selection || answering ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selection ? (
              <button
                type="button"
                onClick={() => onClearSelection?.()}
                className="cursor-pointer rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-[12px] text-foreground"
              >
                Editing: {selection.label ?? selection.kind ?? "the block you picked"} ✕
              </button>
            ) : null}
            {answering ? (
              <button
                type="button"
                onClick={() => setAnswering(null)}
                className="cursor-pointer rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground"
              >
                Answering: {answering} ✕
              </button>
            ) : null}
          </div>
        ) : null}
         <PromptInput
           className={cn("builder-prompt rounded-3xl", (requests.busy || firstBuildBusy) && "is-thinking")}
          onSubmit={(_message, event) => {
            event.preventDefault();
            send(value);
          }}
        >
          <PromptInputTextarea
            ref={inputRef}
            value={value}
            maxLength={INSTRUCTION_LIMIT}
             disabled={!requests.ready}
            placeholder={factQuestion ? "Type your answer…" : "Ask Revora…"}
            aria-label="Tell Revora what to change"
            className="text-base"
            enterKeyHint="send"
            onChange={(event) => setValue(event.target.value)}
          />
           <PromptInputFooter className="items-center justify-between gap-2">
            <PromptInputTools>
               <PromptInputButton className="size-9 rounded-full border border-border p-0" onClick={() => setMediaOpen((open) => !open)} disabled={!requests.ready} aria-label="Add photo, video or voice" title={requests.capabilities ? (attachmentNotice(requests.capabilities, "image") ?? "Add photo, video or voice") : "Add photo, video or voice"}>
                 <Plus className="size-4 shrink-0" aria-hidden />
               </PromptInputButton>
            </PromptInputTools>

            <PromptInputSubmit
               {...(requests.busy || firstBuildBusy ? { status: "submitted" as const } : {})}
                disabled={!requests.ready || (!value.trim() && attachments.length === 0)}
            />
          </PromptInputFooter>
        </PromptInput>

         {mediaOpen || attachments.length ? (
           <div className="mt-3 border-t border-border/70 pt-3">
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
        {requests.summary ? (
          <p className="mt-2 text-[11.5px] text-muted-foreground" role="status">
            {requests.summary}
          </p>
        ) : null}
      </div>
    </section>
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
  const done = steps.slice(1).reverse();
  return (
    <div className="space-y-2.5 rounded-2xl border border-primary/30 bg-card/60 p-3.5 shadow-signal" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="relative inline-flex size-7 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-lg bg-primary/25" aria-hidden />
          <img src="/revora-mark-144.png" alt="" className="relative size-7 rounded-lg" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold">Revora is working</p>
          <p className="text-[11px] text-muted-foreground">
            {seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`} · live
          </p>
        </div>
      </div>
      {done.length ? (
        <ul className="space-y-1">
          {done.map((step) => (
            <li key={`${step.stage}-${step.at}`} className="chat-rise flex items-start gap-1.5 text-[12px] text-muted-foreground">
              <span aria-hidden className="text-primary">✓</span>
              <span className="min-w-0 break-words">{step.stage}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="text-[13px]">
        <Shimmer>{latest ? `${latest.stage}…` : fallback}</Shimmer>
        {latest?.detail ? <p className="mt-1 text-[11.5px] text-muted-foreground break-words">{latest.detail}</p> : null}
      </div>
    </div>
  );
}

/** One request's honest state: what Revora will do, did, or couldn't do. */
function TaskBody({
  task,
  requests,
  organizationId,
  onAnswer,
  onOpenHistory,
  publishState,
  onFollowUp,
}: {
  task: QueueTask;
  requests: BuilderRequests;
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
      {working ? (
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
      ) : task.answered ? null : (
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
          {QUEUE_LABELS[task.state]}
        </p>
      )}

      {task.reply ? (
        <ReplyText
          text={task.reply}
          className={task.answered ? "text-[15px] leading-relaxed" : "text-[13px]"}
        />
      ) : null}
      {task.error ? <p className="text-[12.5px]">{task.error}</p> : null}

      {working ? (
        <p className="text-[11.5px] text-muted-foreground">
          {timeline.stages[timeline.current]}
        </p>
      ) : null}

      {task.state === "complete" && !task.answered ? (
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
        <ul className="space-y-1 text-[12px]">
          {task.questions.map((question) => (
            <li key={question}>
              <button
                type="button"
                onClick={() => onAnswer(question)}
                className="cursor-pointer text-left underline decoration-dotted underline-offset-2 hover:text-primary"
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
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
        {working ? null : (
          <Button size="sm" variant="ghost" onClick={() => requests.dismiss(task.id)}>
            Clear
          </Button>
        )}
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
    <MessageActions className="pt-1 text-muted-foreground" aria-label="Response actions">
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
