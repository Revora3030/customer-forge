import { Fragment, useState, type ReactNode } from "react";
import { Bot, Check, Copy, RotateCcw, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JarvisMarkdown } from "@/components/app/JarvisMarkdown";
import { splitReplyMeta, type WriteProposal } from "@/lib/jarvis-actions";
import { ProposalCard, type ProposalState } from "./ProposalCard";
import { ModelTag } from "./ModelTag";
import { EventNoticeCard } from "./EventNoticeCard";
import { parseEventNotice } from "@/lib/jarvis-event-notice";

export type JarvisRow = { id: string; role: "user" | "assistant"; content: string; created_at: string; run_id?: string | null };

const clock = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const fullDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { dateStyle: "full", timeStyle: "short" });
};

export function UserMessage({ content, createdAt }: { content: string; createdAt?: string }) {
  return (
    <article className="flex min-w-0 flex-col items-end gap-1">
      <h2 className="sr-only">You said</h2>
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[15px] leading-6 whitespace-pre-wrap break-words backdrop-blur-xl">{content}</div>
      {createdAt ? <time dateTime={createdAt} title={fullDate(createdAt)} className="text-xs text-muted-foreground">{clock(createdAt)}</time> : null}
    </article>
  );
}

function Action({ label, onClick, disabled, children, pressed }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; pressed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" data-jarvis-tap="" className="size-9 rounded-full sm:size-9" disabled={disabled} aria-pressed={pressed} onClick={onClick}>
          {children}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type AssistantProps = {
  message: JarvisRow;
  isLast: boolean;
  busy: boolean;
  regenerating: boolean;
  speakingThis: boolean;
  approvalState: (key: string) => ProposalState;
  approvalUrl: (key: string) => string | undefined;
  onApprove: (key: string, proposal: WriteProposal) => void;
  onCopy: (body: string) => void;
  onListen: () => void;
  onStopListening: () => void;
  onRegenerate: () => void;
  /** Live content under a proposal once it was approved, such as a demo build card. */
  renderAfterProposal?: ((key: string) => ReactNode) | undefined;
  /** Opens the recorded steps of this reply, when they exist. */
  onShowSteps?: ((runId: string) => void) | undefined;
  /** Sends a system notice's suggested question as the owner's next message. */
  onAsk?: ((prompt: string) => void) | undefined;
};

export function AssistantMessage({ message, isLast, busy, regenerating, speakingThis, approvalState, approvalUrl, onApprove, onCopy, onListen, onStopListening, onRegenerate, renderAfterProposal, onShowSteps, onAsk }: AssistantProps) {
  const notice = parseEventNotice(message.content);
  const { body, meta } = splitReplyMeta(message.content);
  const [expanded, setExpanded] = useState(isLast);
  const long = body.length > 900;
  const shown = long && !expanded ? `${body.slice(0, 700).trimEnd()}…` : body;
  if (notice) {
    return (
      <article className="min-w-0">
        <h2 className="sr-only">System notice</h2>
        <EventNoticeCard id={message.id} notice={notice} time={clock(message.created_at)} busy={busy} onAsk={onAsk} />
      </article>
    );
  }
  return (
    <article className={`group flex min-w-0 gap-3 transition-opacity ${regenerating ? "opacity-50" : ""}`}>
      <span className="mt-0.5 hidden size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary sm:flex" aria-hidden><Bot className="size-3.5" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="sr-only">Jarvis said</h2>
        {meta.ran.length ? (
          <ul aria-label="Checks Jarvis ran" className="mb-2 flex flex-wrap gap-1.5">
            {meta.ran.map((item) => <li key={item} className="inline-flex h-6 items-center gap-1 rounded-full border border-border/70 px-2 text-xs text-muted-foreground"><Check className="size-3" aria-hidden />{item}</li>)}
          </ul>
        ) : null}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[15px] leading-7 backdrop-blur-xl"><JarvisMarkdown>{shown}</JarvisMarkdown></div>
        {long ? <button type="button" className="mt-1 min-h-11 px-1 text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setExpanded((open) => !open)}>{expanded ? "Show less" : "Show full reply"}</button> : null}
        {message.run_id ? <div><ModelTag runId={message.run_id} /></div> : null}
        {message.run_id && onShowSteps ? (
          <button type="button" onClick={() => onShowSteps(message.run_id!)} className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            See what Jarvis did
          </button>
        ) : null}
        {meta.proposals.map((proposal, index) => {
          const key = `${message.id}:${index}`;
          return (
            <Fragment key={key}>
              <ProposalCard proposal={proposal} state={approvalState(key)} url={approvalUrl(key)} onApprove={() => onApprove(key, proposal)} />
              {renderAfterProposal?.(key)}
            </Fragment>
          );
        })}
        <div className="-ml-2 mt-1 flex items-center gap-0.5 text-muted-foreground transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
          <Action label="Copy" onClick={() => onCopy(body)}><Copy className="size-4" aria-hidden /></Action>
          {speakingThis ? (
            <Action label="Stop" pressed onClick={onStopListening}><Square className="size-4 fill-current" aria-hidden /></Action>
          ) : (
            <Action label="Listen" onClick={onListen}><Volume2 className="size-4" aria-hidden /></Action>
          )}
          {isLast ? <Action label="Regenerate" disabled={busy} onClick={onRegenerate}><RotateCcw className="size-4" aria-hidden /></Action> : null}
          <time dateTime={message.created_at} title={fullDate(message.created_at)} className="ml-1.5 text-xs">{clock(message.created_at)}</time>
        </div>
      </div>
    </article>
  );
}
