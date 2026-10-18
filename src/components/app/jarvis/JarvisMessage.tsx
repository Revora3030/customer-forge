import type { ReactNode } from "react";
import { Bot, Check, Copy, RotateCcw, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JarvisMarkdown } from "@/components/app/JarvisMarkdown";
import { splitReplyMeta, type WriteProposal } from "@/lib/jarvis-actions";
import { ProposalCard, type ProposalState } from "./ProposalCard";

export type JarvisRow = { id: string; role: "user" | "assistant"; content: string; created_at: string };

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
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--jarvis-user-bg)] px-3.5 py-2.5 text-[15px] leading-6 whitespace-pre-wrap break-words">{content}</div>
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
};

export function AssistantMessage({ message, isLast, busy, regenerating, speakingThis, approvalState, approvalUrl, onApprove, onCopy, onListen, onStopListening, onRegenerate }: AssistantProps) {
  const { body, meta } = splitReplyMeta(message.content);
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
        <div className="text-[15px] leading-7"><JarvisMarkdown>{body}</JarvisMarkdown></div>
        {meta.proposals.map((proposal, index) => {
          const key = `${message.id}:${index}`;
          return <ProposalCard key={key} proposal={proposal} state={approvalState(key)} url={approvalUrl(key)} onApprove={() => onApprove(key, proposal)} />;
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
