/**
 * COMP-11 "Draft replies" for a Google review. Draft only: Revora never posts.
 * Used per review card (reviewId) and as a paste box for reviews that live
 * only on Google. The owner copies a draft and posts it themselves.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Sparkles } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getReviewReplyDrafts } from "@/lib/review-reply-draft.functions";
import { MAX_REVIEW_CHARS, REVIEW_TONES, type ReviewTone } from "@/lib/review-reply-draft";
import { friendlyError } from "@/lib/user-error";

export function ReviewReplyDraftPanel({ organizationId, reviewId }: { organizationId: string | undefined; reviewId?: string }) {
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [tone, setTone] = useState<ReviewTone>("friendly");
  const draft = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Workspace not loaded yet.");
      return getReviewReplyDrafts({ data: { organizationId, reviewId: reviewId ?? null, text, rating, authorName: "", tone } });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't draft replies.")),
  });
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied. Paste it into Google to post.");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };
  const result = draft.data;
  const pasted = !reviewId;

  return (
    <Panel className="space-y-2.5 p-3.5">
      {pasted ? (
        <>
          <p className="eyebrow">Reply to a Google review</p>
          <Textarea
            aria-label="Paste the review"
            placeholder="Paste the review text here"
            maxLength={MAX_REVIEW_CHARS}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Stars">
            <span className="text-[12px] text-muted-foreground">Stars:</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <Button key={n} size="sm" variant={rating === n ? "default" : "outline"} aria-pressed={rating === n} onClick={() => setRating(rating === n ? null : n)}>
                {n}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tone">
        <span className="text-[12px] text-muted-foreground">Tone:</span>
        {REVIEW_TONES.map((option) => (
          <Button key={option} size="sm" variant={tone === option ? "default" : "outline"} aria-pressed={tone === option} onClick={() => setTone(option)}>
            {option[0]!.toUpperCase() + option.slice(1)}
          </Button>
        ))}
      </div>
      <Button size="sm" variant="outline" disabled={draft.isPending || (pasted && text.trim().length < 3)} onClick={() => draft.mutate()}>
        <Sparkles className="size-4" /> {draft.isPending ? "Drafting…" : result ? "Try other drafts" : "Draft replies"}
      </Button>
      {result ? (
        <div className="space-y-2">
          {result.guidance.length ? (
            <ul className="list-disc space-y-0.5 rounded-lg border border-border bg-elevated py-2 pl-6 pr-3 text-[12px] text-muted-foreground">
              {result.guidance.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          ) : null}
          {result.drafts.map((body, index) => (
            <div key={index} className="space-y-1.5 rounded-lg border border-border p-2.5">
              <p className="whitespace-pre-wrap break-words text-[13px]">{body}</p>
              <Button size="sm" variant="ghost" onClick={() => void copy(body)}>
                <Copy className="size-4" /> Copy draft {index + 1}
              </Button>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Drafts only. Revora never posts to Google; you paste and post it yourself.</p>
        </div>
      ) : null}
    </Panel>
  );
}
