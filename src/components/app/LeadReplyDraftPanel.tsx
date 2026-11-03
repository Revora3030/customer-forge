/**
 * "Draft a reply" on a lead card. Asks Jarvis for a first-reply DRAFT only when
 * the owner taps the button (no background drafting). The panel never sends or
 * saves: it can copy the wording or open the owner's own email or messages app.
 */
import { useMutation } from "@tanstack/react-query";
import { Copy, Mail, MessageSquare, Sparkles } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { getLeadReplyDraft } from "@/lib/lead-reply-draft.functions";
import { friendlyError } from "@/lib/user-error";

export function LeadReplyDraftPanel({ organizationId, leadId }: { organizationId: string | undefined; leadId: string }) {
  const draft = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Workspace not loaded yet.");
      return getLeadReplyDraft({ data: { organizationId, leadId } });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't draft that reply.")),
  });
  const result = draft.data;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };

  return (
    <Panel className="space-y-2.5 p-3.5">
      <p className="eyebrow">First reply</p>
      {!result ? (
        <Button size="sm" variant="outline" disabled={draft.isPending} onClick={() => draft.mutate()}>
          <Sparkles className="size-4" /> {draft.isPending ? "Drafting…" : "Draft a reply with Jarvis"}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-[13px]">{result.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy(result.body)}>
              <Copy className="size-4" /> Copy
            </Button>
            {result.emailHref ? (
              <Button size="sm" variant="outline" asChild>
                <a href={result.emailHref}>
                  <Mail className="size-4" /> Open in my email app
                </a>
              </Button>
            ) : null}
            {result.smsHref ? (
              <Button size="sm" variant="outline" asChild>
                <a href={result.smsHref}>
                  <MessageSquare className="size-4" /> Open in my messages app
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={draft.isPending} onClick={() => draft.mutate()}>
              {draft.isPending ? "Drafting…" : "Try another"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Draft only. Nothing is sent until you send it yourself.</p>
        </div>
      )}
    </Panel>
  );
}
