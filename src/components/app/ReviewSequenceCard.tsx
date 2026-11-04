/**
 * Switch for the automatic post-job review sequence (review-sequence.ts):
 * when a booking is marked completed, the customer gets a "How did we do?"
 * email an hour later and one reminder on day 3. 4–5 stars go on to the
 * owner's Google review page; 1–3 stars reach the owner privately first, and
 * the public review link stays available to everyone.
 */
import { Panel } from "@/components/app/Bits";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSaveBusinessProfile } from "@/lib/queries";

export function ReviewSequenceCard({
  organizationId,
  enabled,
  hasReviewLink,
  canManage,
}: {
  organizationId: string | undefined;
  enabled: boolean;
  hasReviewLink: boolean;
  canManage: boolean;
}) {
  const save = useSaveBusinessProfile(organizationId);
  return (
    <Panel className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="review-sequence" className="text-[13px] font-medium">
            Ask for a review after every job
          </Label>
          <p className="text-[12px] text-muted-foreground">
            When you mark a booking completed, the customer gets a short email an hour later and one reminder on day 3.
            Happy customers (4–5 stars) go to your Google review page; anyone less happy can tell you privately first,
            and can still post publicly.
          </p>
          {!hasReviewLink ? (
            <p className="text-[12px] text-amber-600">Save your Google Place ID or review link above to turn this on.</p>
          ) : null}
        </div>
        <Switch
          id="review-sequence"
          checked={enabled}
          disabled={!canManage || save.isPending || (!enabled && !hasReviewLink)}
          onCheckedChange={(checked) => save.mutate({ review_sequence_enabled: checked })}
        />
      </div>
    </Panel>
  );
}
