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
import { ArrowDown, ArrowUp, Image as ImageIcon, Mic, Trash2 } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
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
import { BrandChoices } from "@/components/app/BrandChoices";
import { CompositionPreviewCard } from "@/components/app/CompositionPreviewCard";
import { attachmentNotice } from "@/lib/builder/capabilities";
import { useBuildProgress } from "@/lib/builder/progress.hooks";
import { BUILDER_PRIMARY_ACTIONS, BUILDER_QUICK_ACTIONS } from "@/lib/builder-modes";
import { QUEUE_LABELS, timelineFor, type QueueTask } from "@/lib/builder-queue";
import { onAssistantPrompt } from "@/lib/assistant-bridge";
import { selectionPrefix } from "@/lib/builder/preview-bridge";
import { INSTRUCTION_LIMIT, type BuilderRequests } from "@/lib/builder-requests.hooks";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [...BUILDER_PRIMARY_ACTIONS.slice(0, 4), ...BUILDER_QUICK_ACTIONS.slice(0, 4)];

export function BuilderAssistant({
  organizationId,
  requests,
  onOpenExtras,
  emptyTitle,
  emptyHint,
  compact = false,
  selection = null,
  onClearSelection,
  onOpenHistory,
  publishState = "draft",
}: {
  organizationId: string | null;
  requests: BuilderRequests;
  /** Photo upload, voice and the full chat history live one door away. */
  onOpenExtras: () => void;
  emptyTitle: string;
  emptyHint: string;
  compact?: boolean;
  /** The block the owner clicked in the preview, if any. */
  selection?: { id: string; label: string | null; kind: string | null; text: string | null } | null;
  onClearSelection?: () => void;
  /** Opens History, where the before-and-after comparison lives. */
  onOpenHistory?: () => void;
  publishState?: string;
}) {
  const [value, setValue] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  /** A question Revora asked, which the next message answers. */
  const [answering, setAnswering] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queueRef = useRef(requests.queue);
  queueRef.current = requests.queue;
  const activityKey = useMemo(
    () => requests.tasks.map((task) => `${task.id}:${task.state}`).join("|"),
    [requests.tasks],
  );

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

  const send = (text: string) => {
    if (!text.trim()) return;
    requests.queue(scoped(text));
    setValue("");
    setAnswering(null);
    onClearSelection?.();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [activityKey]);

  // Pointing at a block moves the cursor straight into the message box.
  useEffect(() => {
    if (selection) inputRef.current?.focus();
  }, [selection]);


  return (
    <section
      id="website-assistant"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card/45 p-0 shadow-panel",
        compact ? "min-h-[520px] h-[calc(100dvh-11.5rem)] lg:h-[calc(100vh-8rem)]" : "min-h-[560px] h-[calc(100dvh-10rem)]",
      )}
    >
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-7 px-4 py-6 sm:px-6">
          {requests.tasks.length === 0 ? (
            <ConversationEmptyState className="items-start justify-end text-left" title={emptyTitle} description={emptyHint}>
              <div className="max-w-md space-y-2">
                <div className="flex items-center gap-2">
                  <img src="/revora-mark-144.png" alt="" className="size-7 rounded-md" />
                  <p className="text-[13px] font-semibold">Revora</p>
                </div>
                <h2 className="text-lg font-semibold">{emptyTitle}</h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{emptyHint}</p>
              </div>
            </ConversationEmptyState>
          ) : null}
          {requests.tasks.map((task) => (
            <div key={task.id} className="space-y-3">
              <Message from="user">
                <MessageContent className="bg-primary text-primary-foreground">{task.instruction}</MessageContent>
              </Message>
              <Message from="assistant">
                <MessageContent className="w-full">
                  <TaskBody
                    task={task}
                    requests={requests}
                    organizationId={organizationId}
                    onAnswer={setAnswering}
                    {...(onOpenHistory ? { onOpenHistory } : {})}
                    publishState={publishState}
                  />
                </MessageContent>
              </Message>
            </div>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border bg-background/85 p-3 backdrop-blur">
        {/* Everything the old separate AI panels offered, as one tap each. */}
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {(moreOpen ? SUGGESTIONS : SUGGESTIONS.slice(0, 3)).map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={!requests.ready}
              onClick={() => requests.queue(action.instruction)}
              className={cn(
                "min-h-8 shrink-0 cursor-pointer rounded-full border border-border px-3 py-1 text-[12px] text-muted-foreground transition-colors",
                "hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
              )}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            className="min-h-8 shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {moreOpen ? "Fewer ideas" : "More ideas"}
          </button>
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
            placeholder="Ask Revora…"
            aria-label="Tell Revora what to change"
            onChange={(event) => setValue(event.target.value)}
          />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputButton
                onClick={onOpenExtras}
                disabled={!requests.ready}
                title={
                  requests.capabilities
                    ? (attachmentNotice(requests.capabilities, "image") ?? undefined)
                    : undefined
                }
              >
                <ImageIcon className="size-4" aria-hidden /> Photo
              </PromptInputButton>
              <PromptInputButton onClick={onOpenExtras} disabled={!requests.ready}>
                <Mic className="size-4" aria-hidden /> Speak
              </PromptInputButton>
            </PromptInputTools>
            <PromptInputSubmit
              {...(requests.busy ? { status: "submitted" as const } : {})}
              disabled={!requests.ready || !value.trim()}
            />
          </PromptInputFooter>
        </PromptInput>

        <BrandChoices
          organizationId={organizationId}
          disabled={!requests.ready}
          onChange={requests.setBrand}
        />
        {requests.summary ? (
          <p className="mt-2 text-[11.5px] text-muted-foreground" role="status">
            {requests.summary}
          </p>
        ) : null}
      </div>
    </section>
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
}: {
  task: QueueTask;
  requests: BuilderRequests;
  organizationId: string | null | undefined;
  /** Picks one of Revora's questions to answer with the next message. */
  onAnswer: (question: string) => void;
  onOpenHistory?: () => void;
  publishState: string;
}) {
  const working = task.state === "queued" || task.state === "planning" || task.state === "building";
  const timeline = timelineFor(task);
  // The steps the server has genuinely recorded for this build, shown live.
  const { latest, steps } = useBuildProgress(organizationId, working);
  // Steps already finished, oldest first, so the owner watches the work land
  // instead of staring at one line. Only genuinely recorded steps are shown.
  const done = working ? steps.slice(1).reverse() : [];
  return (
    <div className="space-y-2">
      {working ? (
        <div className="space-y-1">
          {done.length ? (
            <ul className="space-y-0.5">
              {done.map((step) => (
                <li
                  key={`${step.stage}-${step.at}`}
                  className="text-[12px] text-muted-foreground flex items-center gap-1.5"
                >
                  <span aria-hidden="true">✓</span>
                  <span>{step.stage}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Shimmer>
            {latest
              ? `${latest.stage}…`
              : task.state === "queued"
                ? "Got it — I’m starting now…"
              : task.state === "planning"
                ? "Working out the change…"
                : "Applying…"}
          </Shimmer>
        </div>
      ) : (
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
          {QUEUE_LABELS[task.state]}
        </p>
      )}

      {task.reply ? <p className="text-[13px] whitespace-pre-line">{task.reply}</p> : null}
      {task.error ? <p className="text-[12.5px]">{task.error}</p> : null}

      {working ? (
        <p className="text-[11.5px] text-muted-foreground">
          {timeline.stages[timeline.current]}
        </p>
      ) : null}

      {task.state === "complete" ? (
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
              {requirement.covered ? "✓" : "Not covered:"} {requirement.label}
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
            See what changed
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
