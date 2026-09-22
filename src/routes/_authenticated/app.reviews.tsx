import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Copy, Eye, EyeOff, Send, Star } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import {
  EmptyState,
  LoadingRows,
  PageHead,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/use-tenant";
import { useAppointments, useBusinessProfile, useReviews } from "@/lib/queries";
import { useRequestReview, useSetReviewPublished } from "@/lib/growth-hooks";
import { relative } from "@/lib/format";
import { REVIEWS_META } from "@/lib/app-meta";
import { MetaPreview } from "@/components/app/MetaPreview";

export const Route = createFileRoute("/_authenticated/app/reviews")({
  head: () => ({
    meta: [...REVIEWS_META.meta, { name: "robots", content: "noindex, nofollow" }],
    links: REVIEWS_META.links,
  }),

  component: ReviewsPage,
});

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < rating ? "size-3.5 fill-accent text-accent" : "size-3.5 text-muted-foreground"
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function ReviewsPage() {
  const { data } = useWorkspace();
  const orgId = data?.workspace?.organizationId;
  const org = data?.workspace?.organization;
  const reviews = useReviews(orgId);
  const profile = useBusinessProfile(orgId);
  const appointments = useAppointments(orgId);
  const setPublished = useSetReviewPublished(orgId);
  const request = useRequestReview(orgId);
  const [asking, setAsking] = useState<{
    name: string;
    recipient: string;
    channel: "email" | "sms";
  } | null>(null);

  const reviewLink = profile.data?.review_link ?? null;
  const rows = reviews.data ?? [];
  const average = rows.length
    ? rows.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / rows.length
    : null;
  const published = rows.filter((review) => review.is_published).length;

  const completed = useMemo(
    () =>
      (appointments.data ?? [])
        .filter((appointment) => appointment.status === "completed")
        .slice(0, 8),
    [appointments.data],
  );

  return (
    <div className="product-page">
      <PageHead
        eyebrow="Reputation"
        title="Reviews"
        purpose="Ask happy customers for a review, and see what they said."
        action={
          <Button
            variant="signal"
            size="sm"
            onClick={() => setAsking({ name: "", recipient: "", channel: "email" })}
          >
            <Send className="size-4" /> Request a review
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="eyebrow">Average rating</p>
          <p className="tnum mt-1 font-display text-[24px] font-semibold">
            {average ? average.toFixed(1) : "—"}
          </p>
        </Panel>
        <Panel>
          <p className="eyebrow">Total reviews</p>
          <p className="tnum mt-1 font-display text-[24px] font-semibold">{rows.length}</p>
        </Panel>
        <Panel>
          <p className="eyebrow">Shown on your website</p>
          <p className="tnum mt-1 font-display text-[24px] font-semibold">{published}</p>
        </Panel>
      </div>

      <Panel className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Public review link</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {reviewLink ||
              "Add your Google review link in Settings so requests send customers to the right place."}
          </p>
        </div>
        {reviewLink ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void navigator.clipboard
                .writeText(reviewLink)
                .then(() => toast.success("Review link copied."))
                .catch(() => toast.error("Couldn't copy that link."))
            }
          >
            <Copy className="size-4" /> Copy link
          </Button>
        ) : null}
      </Panel>

      {completed.length ? (
        <Panel className="space-y-2">
          <p className="text-[13px] font-medium">Recently completed jobs</p>
          <div className="space-y-1.5">
            {completed.map((appointment) => (
              <div
                key={appointment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px]">{appointment.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {relative(appointment.starts_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAsking({
                      name: appointment.name,
                      recipient: appointment.email || appointment.phone || "",
                      channel: appointment.email ? "email" : "sms",
                    })
                  }
                >
                  <Send className="size-3.5" /> Ask for a review
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {reviews.isLoading ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          description="Request one from a completed job. Approved reviews appear automatically on your website."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((review) => (
            <Panel key={review.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{review.author_name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Stars rating={Number(review.rating ?? 0)} />
                    <span className="text-[11px] text-muted-foreground">
                      {relative(review.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={review.is_published ? "signal" : "neutral"}>
                    {review.is_published ? "On website" : "Hidden"}
                  </Pill>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPublished.mutate({ id: review.id, published: !review.is_published })
                    }
                  >
                    {review.is_published ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    {review.is_published ? "Hide" : "Publish"}
                  </Button>
                </div>
              </div>
              {review.comment ? (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {review.comment}
                </p>
              ) : null}
              {review.private_feedback ? (
                <p className="rounded-lg border border-border bg-elevated px-3 py-2 text-[12px] text-muted-foreground">
                  Private feedback (never shown publicly): {review.private_feedback}
                </p>
              ) : null}
            </Panel>
          ))}
        </div>
      )}

      <MetaPreview meta={REVIEWS_META} label="/app/reviews" />

      <Dialog open={!!asking} onOpenChange={(open) => !open && setAsking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a review</DialogTitle>
            <DialogDescription>
              The message is queued through your follow-up pipeline and marked sent only once it is
              actually delivered.
            </DialogDescription>
          </DialogHeader>
          {asking ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!asking.name.trim() || !asking.recipient.trim()) {
                  toast.error("Add a name and an email or phone number.");
                  return;
                }
                request.mutate(
                  {
                    name: asking.name.trim(),
                    recipient: asking.recipient.trim(),
                    channel: asking.channel,
                    businessName: org?.name ?? "our team",
                    reviewLink,
                  },
                  { onSuccess: () => setAsking(null) },
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="r-name">Customer name</Label>
                <Input
                  id="r-name"
                  value={asking.name}
                  onChange={(e) => setAsking({ ...asking, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-recipient">
                  {asking.channel === "email" ? "Email address" : "Mobile number"}
                </Label>
                <Input
                  id="r-recipient"
                  value={asking.recipient}
                  onChange={(e) => setAsking({ ...asking, recipient: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-2">
                {(["email", "sms"] as const).map((channel) => (
                  <Button
                    key={channel}
                    type="button"
                    variant={asking.channel === channel ? "signal" : "outline"}
                    size="sm"
                    onClick={() => setAsking({ ...asking, channel })}
                  >
                    {channel === "email" ? "Email" : "Text"}
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="signal" disabled={request.isPending}>
                  Queue request
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
