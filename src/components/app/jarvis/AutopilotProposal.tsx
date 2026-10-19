import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeAutopilotPatch } from "@/lib/prospect-autopilot";
import type { AutopilotProposal } from "./autopilot-proposal";

/** Jarvis's proposal to change or run the prospect autopilot. Nothing happens until approved. */
export function AutopilotProposalCard({
  proposal,
  state,
  onApprove,
}: {
  proposal: AutopilotProposal;
  state: "building" | "done" | undefined;
  onApprove: () => void;
}) {
  const configure = proposal.id === "autopilot.configure";
  return (
    <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Bot className="size-4 text-primary" aria-hidden />
        {configure ? "Change the prospect autopilot" : "Run the prospect autopilot now"}
      </p>
      <p className="mt-1 break-words text-sm text-muted-foreground">
        {configure
          ? describeAutopilotPatch(proposal.settings)
          : "Searches the saved targets, builds free demo sites up to today's limit and sends links where the outreach rules allow."}
      </p>
      <Button type="button" className="mt-3 min-h-11" data-jarvis-tap="" disabled={Boolean(state)} onClick={onApprove}>
        {state === "building" ? "Working…" : state === "done" ? "Done" : configure ? "Approve and save" : "Approve and run"}
      </Button>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Texts only go to numbers that opted in. Every send checks the do-not-contact list and daily limits.
      </p>
    </div>
  );
}
