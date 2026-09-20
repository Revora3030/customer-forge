import { useEffect, useMemo, useState } from "react";
import { onAssistantPrompt } from "@/lib/assistant-bridge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyError } from "@/lib/user-error";
import {
  AlertTriangle,
  Bot,
  Check,
  Clapperboard,
  History,
  Loader2,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { applyWebsiteChanges, planWebsiteChanges } from "@/lib/site-agent.functions";
import { AssistantMedia } from "@/components/app/AssistantMedia";
import {
  MULTIMODAL_TEMPLATES,
  PLAN_INSTRUCTION_LIMIT,
  QUICK_COMMANDS,
  type AgentAttachment,
  type AgentStep,
  type AgentTurn,
} from "@/lib/site-agent";

const EXAMPLES = [
  "Rewrite the whole home page to lead with same-day service and a clear price promise",
  "Add a pricing page with three packages and link it from the menu",
  "Make every headline shorter, then move the reviews above the services",
  "Write page titles and meta descriptions for every page",
];

const CHIP =
  "cursor-pointer rounded-full border border-border/80 px-3 py-1.5 text-left text-[12px] text-muted-foreground transition-all hover:border-muted-foreground/40 hover:bg-elevated hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Picked option — gold, raised, glowing, with a check, so the choice is unmistakable. */
const CHIP_PICKED =
  "cursor-pointer rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-left text-[12px] font-medium text-primary gold-glow -translate-y-0.5 transition-all hover:bg-primary/15 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type Message =
  | { role: "user"; content: string; attached?: string[] }
  | { role: "assistant"; content: string; plan?: Plan };

type Plan = {
  summary: string;
  steps: AgentStep[];
  questions: string[];
  notes: string[];
  /** What Revora understood it had to satisfy, and whether the plan does. */
  requirements: { label: string; covered: boolean }[];
  /** What Revora actually did to reach this plan, stage by stage. */
  trace: string[];
  /** Set when the AI writer could not be reached; the request is kept for retry. */
  unavailable?: { reason: string; retryable: boolean; instruction: string } | null;
};

/**
 * The website agent. The client types anything — a sentence or a full brief —
 * and Revora returns a plan of concrete changes across pages, sections, items,
 * page settings, SEO and look-and-feel. The client approves, Revora writes it.
 *
 * A version snapshot is taken before anything is written, so any change can be
 * rolled back from version history.
 */
export function SiteChatbot({
  organizationId,
  canManage,
  hasSections,
  publishState,
  onPublishNow,
  isPublishing = false,
}: {
  organizationId: string | undefined;
  canManage: boolean;
  hasSections: boolean;
  publishState?: string | null;
  onPublishNow?: () => void;
  isPublishing?: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const [transcripts, setTranscripts] = useState<{ at: string; text: string }[]>([]);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [lastRequest, setLastRequest] = useState<{
    text: string;
    attachments: AgentAttachment[];
  } | null>(null);

  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  /** When on, safe plans (nothing removed, nothing missing) are written the moment they're ready. */
  const [autoApply, setAutoApply] = useState(true);
  /** Instruction chips the client has picked — they glow gold so the choice is obvious. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const togglePick = (instruction: string) => {
    const text = instruction.slice(0, PLAN_INSTRUCTION_LIMIT);
    const next = new Set(picked);
    if (next.has(text)) next.delete(text);
    else next.add(text);
    setPicked(next);
    setInstruction([...next].join("\n"));
  };

  // A section panel below can hand its request up to this box.
  useEffect(
    () =>
      onAssistantPrompt((prompt) => {
        setInstruction(prompt.slice(0, PLAN_INSTRUCTION_LIMIT));
        const box = document.getElementById("assistant-instruction");
        if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) box.focus();
      }),
    [],
  );

  const ask = useServerFn(planWebsiteChanges);
  const applyFn = useServerFn(applyWebsiteChanges);

  const history: AgentTurn[] = useMemo(
    () => messages.map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );

  const chosen = useMemo(
    () => (plan?.steps ?? []).filter((step) => !skipped.has(step.key)),
    [plan, skipped],
  );

  const propose = useMutation({
    mutationFn: (input: { text: string; attachments: AgentAttachment[] }) => {
      setLastRequest(input);
      return ask({
        data: {
          organizationId: organizationId!,
          instruction: input.text,
          history,
          attachments: input.attachments,
        },
      });
    },
    onSuccess: (result) => {
      const steps = result.steps as AgentStep[];
      const next = {
        summary: result.summary,
        steps,
        questions: result.questions,
        notes: result.notes,
        requirements: result.requirements ?? [],
        trace: result.trace ?? [],
        unavailable: result.unavailable ?? null,
      };
      setMessages((prior) => [...prior, { role: "assistant", content: result.reply, plan: next }]);
      setPlan(next);
      setSkipped(new Set());
      // The writer was unreachable: keep the owner's words so one tap resends them.
      if (result.unavailable) return;
      // Auto-apply: safe plans (nothing removed, nothing missing) go straight onto the site.
      const safe =
        steps.length > 0 && !steps.some((step) => step.destructive) && !result.questions.length;
      if (autoApply && canManage && safe) apply.mutate(steps);
    },
    // Nothing here is charged or metered, so a failure is never a paywall: the
    // site is left exactly as it was and the same request can be retried.
    onError: () =>
      setMessages((prior) => [
        ...prior,
        {
          role: "assistant",
          content:
            "Revora couldn't complete that change yet. Your website has been left exactly as it was — retry below, or reword the request.",
        },
      ]),
  });

  const apply = useMutation({
    mutationFn: (steps?: AgentStep[]) =>
      applyFn({
        data: {
          organizationId: organizationId!,
          actions: (steps ?? chosen).map((step) => step.action),
          label: plan?.summary?.slice(0, 110) || "Before assistant changes",
        },
      }),

    onSuccess: (result) => {
      toast.success(
        `${result.applied} change${result.applied === 1 ? "" : "s"} applied to your website.` +
          (result.failed ? ` ${result.failed} couldn't be applied.` : ""),
      );
      setMessages((prior) => [
        ...prior,
        {
          role: "assistant",
          content:
            `Done — ${result.applied} change${result.applied === 1 ? "" : "s"} are live in your draft.` +
            ` I saved a version called "${result.snapshotLabel}" first, so you can roll back any time.` +
            (result.verification ? ` ${result.verification.summary}` : "") +
            (result.failed
              ? ` ${result.failed} step${result.failed === 1 ? "" : "s"} couldn't be applied.`
              : "") +
            (result.verification
              ? ` Verification: ${result.verification.score}% quality, ${result.verification.passed} checks passed, ${result.verification.warnings} improvement${result.verification.warnings === 1 ? "" : "s"} noted.`
              : " Verification could not run, so no claim was made about the rendered result."),
        },
      ]);
      setPlan(null);
      setSkipped(new Set());
      void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["website-versions", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["business-profile", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't apply those changes.")),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = instruction.trim();
    if (text.length < 3 && !attachments.length) return;
    const sent = attachments;
    setMessages((prior) => [
      ...prior,
      {
        role: "user",
        content: text || "(see the attached file)",
        attached: sent.map(
          (attachment) =>
            `${attachment.kind === "image" ? "Photo" : attachment.kind === "video" ? "Video" : "Voice"}: ${attachment.name}` +
            (attachment.chapters?.length ? ` (${attachment.chapters.length} moments indexed)` : ""),
        ),
      },
    ]);
    setPlan(null);
    setSkipped(new Set());
    setInstruction("");
    setAttachments([]);
    propose.mutate({ text, attachments: sent });
  };

  const destructive = chosen.filter((step) => step.destructive).length;

  return (
    <Panel id="website-assistant" className="scroll-mt-24 p-5">
      <SectionHeading
        eyebrow="Start here · Website assistant"
        title="Tell Revora what you want and it turns your site into a lead generator"
        action={
          messages.length ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMessages([]);
                setPlan(null);
              }}
            >
              <Trash2 className="size-4" /> New chat
            </Button>
          ) : null
        }
      />
      <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-3.5">
        <p className="text-[12.5px] font-medium text-primary">
          Tell Revora what you want in your own words — it'll handle the rest
        </p>
        <ol className="mt-1.5 grid gap-1 text-[12px] text-muted-foreground">
          <li>
            1. Describe the change however you'd say it out loud — no Revora wording to learn.
          </li>
          <li>2. Revora shows a plan of the exact changes before anything is written.</li>
          <li>3. Approve it and your pages, buttons, forms and search text update together.</li>
        </ol>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Revora works out the pages, sections, copy, design, search text, photos, buttons and
          functionality your request needs, and only asks a question when a fact is genuinely
          missing.
        </p>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Ask for lead-generator work, not decoration: clear call, text, book and quote buttons on
          every page, prices, proof, answers to the questions that stop people buying, and a
          follow-up path for every enquiry.
        </p>
      </div>
      <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
        Write as little or as much as you like — a single tweak or a full brief. Revora can rewrite
        copy, add and remove sections and pages, reorder the layout, edit items and buttons, write
        your search and social text, and change colours and fonts. It can also install premium
        visuals on request —{" "}
        <span className="text-gold">
          starfield, aurora, nebula, tech grid or spotlight backgrounds
        </span>{" "}
        and{" "}
        <span className="text-gold">
          3D floating, tilted, frosted-glass, gold-glow or shine sections
        </span>
        . Add photos or a short video, or just speak your request — Revora reads and listens too.
        You review the plan, then it's applied for you. No support request, no waiting.
      </p>

      {!hasSections ? (
        <p className="mt-4 text-[13px] text-accent">
          Build your pages and sections first, then the assistant can change anything on them.
        </p>
      ) : null}

      {messages.length ? (
        <div className="mt-5 space-y-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 rounded-md border p-3.5 ${
                message.role === "user" ? "border-border" : "border-border bg-elevated/60"
              }`}
            >
              {message.role === "user" ? (
                <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Bot className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.content}</p>
                {message.role === "user" && message.attached?.length ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {message.attached.join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {propose.isPending ? (
            <div className="flex items-center gap-2.5 rounded-md border border-border bg-elevated/60 p-3.5 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
              Reading your website and working out the changes…
            </div>
          ) : null}
        </div>
      ) : null}

      <form className="mt-4 space-y-3" onSubmit={submit}>
        <Textarea
          id="assistant-instruction"

          rows={messages.length ? 3 : 5}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value.slice(0, PLAN_INSTRUCTION_LIMIT))}
          placeholder="Tell Revora what you want…"
          disabled={!canManage || !hasSections}
          aria-label="Tell Revora what to change"
          className="min-h-[96px] scroll-mt-28"
        />
        <AssistantMedia
          organizationId={organizationId}
          attachments={attachments}
          onChange={setAttachments}
          onTranscript={(text) => {
            setTranscripts((prior) => [
              ...prior,
              {
                at: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
                text,
              },
            ]);
            setInstruction((prior) =>
              (prior ? `${prior.trim()} ${text}` : text).slice(0, PLAN_INSTRUCTION_LIMIT),
            );
          }}
          onInsert={(text) =>
            setInstruction((prior) =>
              (prior ? `${prior.trim()} ${text}` : text).slice(0, PLAN_INSTRUCTION_LIMIT),
            )
          }
          disabled={!canManage || !hasSections}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="signal"
            disabled={
              !canManage ||
              !hasSections ||
              propose.isPending ||
              (instruction.trim().length < 3 && !attachments.length)
            }
          >
            {propose.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {messages.length ? "Send" : "Ask Revora"}
          </Button>
          {(propose.isError || plan?.unavailable) && lastRequest ? (
            <Button
              type="button"
              variant="outline"
              disabled={propose.isPending}
              onClick={() => propose.mutate(lastRequest)}
            >
              <Loader2 className={propose.isPending ? "size-4 animate-spin" : "hidden"} /> Retry
              that request
            </Button>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-[12px]">
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(event) => setAutoApply(event.target.checked)}
            disabled={!canManage}
            className="size-4 accent-primary"
          />
          <span>Apply safe changes automatically</span>
        </label>

        <details className="rounded-md border border-border/70 p-3">
          <summary className="cursor-pointer text-[12px] font-medium">Examples</summary>
          <div className="mt-2.5 space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick commands">
              {[
                ...QUICK_COMMANDS.map((command) => ({
                  key: command.label,
                  label: command.label,
                  text: command.instruction.slice(0, PLAN_INSTRUCTION_LIMIT),
                })),
                ...MULTIMODAL_TEMPLATES.map((template) => ({
                  key: template.key,
                  label: template.label,
                  text: template.instruction.slice(0, PLAN_INSTRUCTION_LIMIT),
                })),
                ...EXAMPLES.map((example) => ({
                  key: example,
                  label: example,
                  text: example,
                })),
              ].map((option) => {
                const active = picked.has(option.text);
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={!canManage || !hasSections}
                    aria-pressed={active}
                    className={`${active ? CHIP_PICKED : CHIP} disabled:cursor-not-allowed disabled:opacity-50`}
                    onClick={() => togglePick(option.text)}
                  >
                    {active ? <Check className="mr-1 inline size-3" aria-hidden="true" /> : null}
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tap to fill the box, then edit it in your own words. Nothing that removes content is
              applied without your approval, and every change can be rolled back.
            </p>
          </div>
        </details>

        {transcripts.length ? (
          <section
            aria-label="Voice request transcripts"
            className="rounded-md border border-border p-3"
          >
            <p className="text-[11px] font-medium text-muted-foreground">
              Voice transcripts — what Revora heard, in your words
            </p>
            <ul className="mt-1.5 space-y-1.5" aria-live="polite">
              {transcripts.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="text-[12px] leading-relaxed">
                  <span className="font-mono text-muted-foreground">{entry.at}</span>{" "}
                  <span className="whitespace-pre-wrap">“{entry.text}”</span>
                </li>
              ))}
            </ul>
            <button type="button" className={`${CHIP} mt-2`} onClick={() => setTranscripts([])}>
              Clear transcripts
            </button>
          </section>
        ) : null}
      </form>

      {plan ? (
        <div className="mt-5 space-y-3">
          {plan.trace.length ? (
            <div className="rounded-md border border-border/70 bg-elevated/40 p-3.5">
              <p className="text-[12px] font-medium text-muted-foreground">How Revora worked</p>
              <ul className="mt-1.5 space-y-1 text-[12px] text-muted-foreground">
                {plan.trace.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.requirements.length ? (
            <div className="rounded-md border border-border/70 p-3.5">
              <p className="text-[12px] font-medium text-muted-foreground">
                Checked against what you asked for
              </p>
              <ul className="mt-1.5 space-y-1 text-[13px]">
                {plan.requirements.map((requirement) => (
                  <li key={requirement.label} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className={requirement.covered ? "text-primary" : "text-muted-foreground"}
                    >
                      {requirement.covered ? "✓" : "•"}
                    </span>
                    <span className={requirement.covered ? "" : "text-muted-foreground"}>
                      {requirement.label}
                      {requirement.covered ? "" : " — still open"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.questions.length ? (
            <div className="rounded-md border border-accent/40 bg-accent/5 p-3.5">
              <p className="text-[12px] font-medium">
                One thing only you can tell Revora — everything else is already decided
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] text-muted-foreground">
                {plan.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.steps.length ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-medium text-muted-foreground">
                  {plan.steps.length} proposed change{plan.steps.length === 1 ? "" : "s"} — gold
                  means included; untick anything you don't want
                </p>
                <Pill tone="info">
                  <Sparkles className="size-3" aria-hidden="true" /> {chosen.length} selected
                </Pill>
              </div>

              {plan.steps.map((step) => {
                const off = skipped.has(step.key);
                return (
                  <div
                    key={step.key}
                    className={`rounded-md border p-3.5 transition-all ${
                      off
                        ? "border-border/60 bg-transparent opacity-55"
                        : "border-primary/40 bg-primary/5 gold-glow"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={step.destructive ? "danger" : "info"}>{step.where}</Pill>
                      <p className="text-[13px] font-medium">{step.title}</p>
                      {!off ? (
                        <Check
                          className="ml-auto size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    {step.before ? (
                      <p className="mt-2 text-[12px] text-muted-foreground line-through">
                        {step.before}
                      </p>
                    ) : null}
                    {step.after ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-[13px]">{step.after}</p>
                    ) : null}
                    <button
                      type="button"
                      className="mt-2.5 cursor-pointer text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() =>
                        setSkipped((prior) => {
                          const next = new Set(prior);
                          if (next.has(step.key)) next.delete(step.key);
                          else next.add(step.key);
                          return next;
                        })
                      }
                    >
                      {off ? "Include this change" : "Skip this change"}
                    </button>
                  </div>
                );
              })}

              {destructive ? (
                <p className="flex items-start gap-2 text-[12px] text-accent">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {destructive} step{destructive === 1 ? "" : "s"} remove or hide content. A version
                  is saved first, so you can roll back.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant="signal"
                  disabled={!canManage || !chosen.length || apply.isPending}
                  onClick={() => apply.mutate(undefined)}
                >
                  {apply.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Apply {chosen.length} change{chosen.length === 1 ? "" : "s"}
                </Button>
                <Button variant="outline" onClick={() => setPlan(null)} disabled={apply.isPending}>
                  Discard plan
                </Button>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <History className="size-3.5" aria-hidden="true" /> A rollback point is saved
                  automatically
                </span>
              </div>
            </>
          ) : null}

          {plan.notes.length ? (
            <ul className="list-disc space-y-1 pl-4 text-[12px] text-muted-foreground">
              {plan.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {onPublishNow && publishState === "published" ? (
        <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
          <p className="text-[12px] text-muted-foreground">
            Changes go to your draft. Publish to put them on your live site.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onPublishNow}
            disabled={!canManage || isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Rocket className="size-4" />
            )}
            Publish now
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
