/**
 * "Ask for a review" for a lead the owner marked Completed with no booking.
 * Shows a DRAFT the owner reads and sends themselves. This panel never sends,
 * queues or saves anything: the only things it can do are copy the wording and
 * open the owner's own email or messages app with it filled in.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Mail, MessageSquare, Star } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { getLeadReviewDraft } from "@/lib/lead-review-draft.functions";
import { DRAFT_BLOCK_MESSAGES, type ChannelDraft } from "@/lib/lead-review-draft";
import { friendlyError } from "@/lib/user-error";

export function LeadReviewDraftPanel({ organizationId, leadId }: { organizationId: string | undefined; leadId: string }) {
  const [open, setOpen] = useState(false);
  const draft = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Workspace not loaded yet.");
      return getLeadReviewDraft({ data: { organizationId, leadId } });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't prepare that draft.")),
  });
  const result = draft.data;

  if (result && !result.eligible && result.reason === "has_booking") {
    return (
      <Panel className="p-3.5">
        <p className="eyebrow">Ask for a review</p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          This lead has a booking. Ask for the review from that booking on the Calendar.
        </p>
      </Panel>
    );
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied. Nothing has been sent.");
    } catch {
      toast.error("Couldn't copy that. Select the text and copy it by hand.");
    }
  };

  return (
    <Panel className="space-y-2.5 p-3.5">
      <div>
        <p className="eyebrow">Ask for a review</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          This job is completed. We can write a review request for you to check and send yourself. We never send it for you.
        </p>
      </div>
      {!open ? (
        <Button
          size="sm"
          variant="outline"
          disabled={draft.isPending}
          onClick={() => {
            setOpen(true);
            draft.mutate();
          }}
        >
          <Star className="size-4" /> {draft.isPending ? "Preparing…" : "Prepare a review request draft"}
        </Button>
      ) : null}
      {open && draft.isPending ? <p className="text-[13px] text-muted-foreground">Preparing your draft…</p> : null}
      {open && draft.isError ? (
        <Button size="sm" variant="outline" onClick={() => draft.mutate()}>
          Try again
        </Button>
      ) : null}
      {result && result.eligible ? (
        <div className="space-y-3">
          {result.needsReviewLink ? (
            <p className="text-[12px] text-muted-foreground" role="status">
              No review link saved yet, so this draft has no link. Add it on the Reviews page first.
            </p>
          ) : null}
          {result.drafts.map((d: ChannelDraft) =>
            d.allowed ? (
              <div key={d.channel} className="space-y-1.5 rounded-md border border-border p-2.5">
                <p className="text-[12px] font-medium">
                  {d.channel === "email" ? "Email" : "Text"} to {d.recipient}
                </p>
                {d.channel === "email" ? <p className="text-[12px] text-muted-foreground">Subject: {d.subject}</p> : null}
                <p className="whitespace-pre-wrap break-words text-[13px]">{d.body}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copy(d.body)}>
                    <Copy className="size-4" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={d.href}>
                      {d.channel === "email" ? <Mail className="size-4" /> : <MessageSquare className="size-4" />}
                      {d.channel === "email" ? "Open in my email app" : "Open in my messages app"}
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <p key={d.channel} className="text-[12px] text-muted-foreground">
                {d.channel === "email" ? "Email" : "Text"}: {DRAFT_BLOCK_MESSAGES[d.reason]}
              </p>
            ),
          )}
        </div>
      ) : null}
    </Panel>
  );
}
