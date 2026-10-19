import { ExternalLink, GitPullRequest, Hammer, Mail, MessageSquare, RefreshCw } from "lucide-react";
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
