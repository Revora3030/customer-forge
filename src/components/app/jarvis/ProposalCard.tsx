import { Brain, CalendarClock, ExternalLink, GitPullRequest, Globe, Hammer, Mail, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WriteProposal } from "@/lib/jarvis-actions";
import { readDemoSendProposal } from "./demo-build";
import { AutopilotProposalCard } from "./AutopilotProposal";
import { isAutopilotProposal } from "./autopilot-proposal";

export type ProposalState = "building" | "done" | undefined;

type Props = {
  proposal: WriteProposal;
  /** In-flight or finished approval; undefined means not yet approved. */
  state: ProposalState;
  /** The pull request or GitHub issue opened by an approval, when there is one. */
  url?: string | undefined;
  onApprove: () => void;
};

const card = "mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3";
const disclaimer = "mt-2 text-xs leading-5 text-muted-foreground";
const linkButton = "mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted";

/** One write proposal from Jarvis. Nothing happens until the owner approves it here. */
export function ProposalCard({ proposal, state, url, onApprove }: Props) {
  if (isAutopilotProposal(proposal)) return <AutopilotProposalCard proposal={proposal} state={state} onApprove={onApprove} />;
  if (proposal.id === "instagram.post") return (
    <div className={card}>
      <p className="text-sm font-medium">Instagram draft</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{proposal.draft.caption}</p>
      <a className="mt-2 block break-all text-xs underline" href={proposal.draft.imageUrl} target="_blank" rel="noreferrer">Review image</a>
      <Button className="mt-3" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Saving…" : state === "done" ? "Draft saved" : "Save for review"}</Button>
      <p className={disclaimer}>Nothing posts here. Review and approve the saved draft under Operations → Instagram.</p>
    </div>
  );
  if (proposal.id === "image.create") return (
    <div className={card}>
      <p className="text-sm font-medium">AI picture ({proposal.aspectRatio})</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{proposal.prompt}</p>
      <p className="mt-1 break-words text-xs text-muted-foreground">Alt text: {proposal.altText}</p>
      <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Creating…" : state === "done" ? "Saved to pictures" : "Approve and create"}</Button>
      <p className={disclaimer}>Uses workspace AI credits within your spending cap. Saved to that website's pictures, labelled AI-generated, never as real work.</p>
    </div>
  );
  if (proposal.id === "research.ask") return (
    <div className={card}>
      <p className="flex items-start gap-1.5 text-sm font-medium"><Globe className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 break-words">Paid web research{proposal.preset !== "fast" ? ` (${proposal.preset})` : ""}</span></p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{proposal.question}</p>
      <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Researching…" : state === "done" ? "Researched" : "Approve and research"}</Button>
      <p className={disclaimer}>One grounded answer with citations, paid from your Perplexity credits. Approving runs it once; nothing else is unblocked.</p>
    </div>
  );
  if (proposal.id === "code.pr") {
    return (
      <div className={card}>
        <p className="flex items-start gap-1.5 text-sm font-medium"><GitPullRequest className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 break-words">Pull request: {proposal.pr.title}</span></p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{proposal.pr.summary}</p>
        <details className="mt-2 rounded-md border border-border bg-background/60">
          <summary className="flex min-h-10 cursor-pointer items-center px-2 text-xs">{proposal.pr.changes.length} file{proposal.pr.changes.length === 1 ? "" : "s"} · review the exact changes</summary>
          <div className="space-y-3 border-t border-border p-2">
            {proposal.pr.changes.map((change) => (
              <div key={change.path} className="min-w-0 space-y-1">
                <p className="break-all font-mono text-xs font-semibold">{change.path} {"content" in change ? "(new file)" : ""}</p>
                {"content" in change ? (
                  <pre className="rounded bg-muted p-2 font-mono text-xs leading-5">{change.content}</pre>
                ) : change.edits.map((edit, editIndex) => (
                  <div key={editIndex} className="grid min-w-0 gap-1">
                    <pre aria-label="Removed" className="rounded bg-destructive/10 p-2 font-mono text-xs leading-5">{edit.find}</pre>
                    <pre aria-label="Added" className="rounded bg-emerald-500/10 p-2 font-mono text-xs leading-5">{edit.replace}</pre>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className={linkButton}><ExternalLink className="size-4" aria-hidden />View on GitHub</a>
        ) : (
          <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Opening…" : "Approve and open pull request"}</Button>
        )}
        <p className={disclaimer}>Opens a pull request into lovable-sync. Nothing merges until you merge it on GitHub.</p>
      </div>
    );
  }
  if (proposal.id === "claude.code") {
    return (
      <div className={card}>
        <p className="flex items-center gap-1.5 text-sm font-medium"><GitPullRequest className="size-4 text-primary" aria-hidden />Hand this to Claude Code</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{proposal.request.length > 600 ? `${proposal.request.slice(0, 600)}…` : proposal.request}</p>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className={linkButton}>Follow it on GitHub <ExternalLink className="size-4" aria-hidden /></a>
        ) : (
          <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Sending…" : "Approve and send to Claude Code"}</Button>
        )}
        <p className={disclaimer}>Claude Code works on its own branch and opens a pull request. Nothing merges until you merge it.</p>
      </div>
    );
  }
  if (proposal.id === "claude.fix") {
    return (
      <div className={card}>
        <p className="flex items-center gap-1.5 text-sm font-medium"><GitPullRequest className="size-4 text-primary" aria-hidden />Ask Claude Code to fix pull request #{proposal.pr}</p>
        {proposal.note ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{proposal.note.length > 600 ? `${proposal.note.slice(0, 600)}…` : proposal.note}</p> : null}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className={linkButton}>Follow it on GitHub <ExternalLink className="size-4" aria-hidden /></a>
        ) : (
          <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Sending…" : "Approve and ask Claude Code"}</Button>
        )}
        <p className={disclaimer}>Claude Code reads the failing checks and review comments, fixes them on that pull request's branch and runs the checks. Nothing merges until you merge it.</p>
      </div>
    );
  }
  if (proposal.id === "builds.recover") {
    return (
      <div className={card}>
        <p className="flex items-center gap-1.5 text-sm font-medium"><RefreshCw className="size-4 text-primary" aria-hidden />Recover stalled builds</p>
        <p className="mt-1 text-sm text-muted-foreground">Closes builds whose worker died, re-queues orphaned ones and restarts the build worker. Builds that are still running are left alone.</p>
        <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Recovering…" : state === "done" ? "Done" : "Approve and recover"}</Button>
      </div>
    );
  }
  if (proposal.id === "demo.send") {
    // Approving opens the review sheet, not a send.
    const send = readDemoSendProposal(proposal);
    if (!send) return null;
    return (
      <div className={card}>
        <p className="flex items-start gap-1.5 text-sm font-medium">{send.channel === "sms" ? <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <Mail className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}<span className="min-w-0 break-words">{send.channel === "sms" ? "Text" : "Email"} the demo site{send.to ? ` to ${send.to}` : ""}</span></p>
        <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Opening…" : state === "done" ? "Sent" : "Review and send"}</Button>
        <p className={disclaimer}>You see and can edit the exact message first. Nothing is sent until you tap Send.</p>
      </div>
    );
  }
  if (proposal.id === "memory.forget") {
    return (
      <div className={card}>
        <p className="flex items-center gap-1.5 text-sm font-medium"><Brain className="size-4 text-primary" aria-hidden />Forget a memory</p>
        <p className="mt-1 text-sm text-muted-foreground">Permanently deletes one saved memory. Jarvis will not bring it back in future conversations.</p>
        <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Forgetting…" : state === "done" ? "Forgotten" : "Approve and forget"}</Button>
      </div>
    );
  }
  if (proposal.id === "routine.create" || proposal.id === "routine.update") {
    const isCreate = proposal.id === "routine.create";
    const routine = isCreate ? proposal.routine : { ...proposal.patch, name: proposal.patch.name ?? "this routine", prompt: proposal.patch.prompt ?? "" };
    const time = typeof routine.hour === "number" ? `${String(routine.hour).padStart(2, "0")}:${String(routine.minute ?? 0).padStart(2, "0")}` : "the scheduled time";
    const frequency = routine.frequency === "weekly" ? "weekly on Mondays" : "daily";
    return (
      <div className={card}>
        <p className="flex items-start gap-1.5 text-sm font-medium"><CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 break-words">{isCreate ? "Create" : "Change"} routine: {routine.name}</span></p>
        {routine.prompt ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{routine.prompt.length > 400 ? `${routine.prompt.slice(0, 400)}…` : routine.prompt}</p> : null}
        <p className="mt-1 text-sm text-muted-foreground">Runs {frequency} at {time} Eastern and posts the result into this chat.</p>
        <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Saving…" : state === "done" ? "Saved" : `Approve and ${isCreate ? "create" : "save"}`}</Button>
        <p className={disclaimer}>A routine runs through the normal Jarvis loop — model caps still apply and anything it wants to change still needs your approval.</p>
      </div>
    );
  }
  if (proposal.id === "routine.delete") {
    return (
      <div className={card}>
        <p className="flex items-center gap-1.5 text-sm font-medium"><Trash2 className="size-4 text-primary" aria-hidden />Delete a routine</p>
        <p className="mt-1 text-sm text-muted-foreground">Permanently removes the scheduled routine. Its past chat results stay in the conversation.</p>
        <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Deleting…" : state === "done" ? "Deleted" : "Approve and delete"}</Button>
      </div>
    );
  }
  const facts = [proposal.input.industry, [proposal.input.city, proposal.input.state].filter(Boolean).join(", "), proposal.input.phone, proposal.input.email].filter(Boolean).join(" · ");
  return (
    <div className={card}>
      <p className="flex items-start gap-1.5 text-sm font-medium"><Hammer className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0 break-words">Build demo site: {proposal.input.businessName}</span></p>
      <p className="mt-1 break-words text-sm text-muted-foreground">{facts}</p>
      {proposal.input.services.length ? <p className="mt-1 text-sm text-muted-foreground">Services: {proposal.input.services.join(", ")}</p> : null}
      <Button type="button" className="mt-3" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>{state === "building" ? "Starting…" : state === "done" ? "Build started" : "Approve and build"}</Button>
    </div>
  );
}
