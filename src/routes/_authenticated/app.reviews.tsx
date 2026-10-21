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
import { Label } from "@/components/ui/label";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
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
import {
  useRequestReview,
  useReviewRequestedAppointments,
  useSetReviewPublished,
} from "@/lib/growth-hooks";
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
  const reviews = useReviews(orgId);
  const profile = useBusinessProfile(orgId);
  const appointments = useAppointments(orgId);
  const setPublished = useSetReviewPublished(orgId);
  const request = useRequestReview(orgId);
  const asked = useReviewRequestedAppointments(orgId);
  /** The completed booking being asked about, and the channel to use. */
  const [asking, setAsking] = useState<{ appointmentId: string; channel: "email" | "sms" } | null>(
    null,
  );

  const reviewLink = profile.data?.review_link ?? null;
  const rows = reviews.data ?? [];
  const average = rows.length
    ? rows.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / rows.length
    : null;
  const published = rows.filter((review) => review.is_published).length;

  const allCompleted = useMemo(
    () =>
      (appointments.data ?? []).filter(
        (appointment) =>
          appointment.status === "completed" && Boolean(appointment.email?.trim() || appointment.phone?.trim()),
      ),
    [appointments.data],
  );
  const completed = allCompleted.slice(0, 8);
  const askingAppointment = asking
    ? (allCompleted.find((appointment) => appointment.id === asking.appointmentId) ?? null)
    : null;

  /** Review requests go to a completed job's own email or phone, never a typed-in address. */
  const startAsking = (appointment: { id: string; email: string | null; phone: string | null }) =>
    setAsking({ appointmentId: appointment.id, channel: appointment.email?.trim() ? "email" : "sms" });

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
            disabled={!allCompleted.length}
            onClick={() => allCompleted[0] && startAsking(allCompleted[0])}
          >
            <Send className="size-4" /> Request a review
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="eyebrow">Average rating</p>
          <p className="tnum mt-1 font-display text-[24px] font-semibold">
            {reviews.isError ? "—" : average ? average.toFixed(1) : "—"}
          </p>
        </Panel>
        <Panel>
          <p className="eyebrow">Total reviews</p>
          <p className="tnum mt-1 font-display text-[24px] font-semibold">
            {reviews.isError ? "—" : rows.length}
          </p>
        </Panel>
        <Panel>
          <p className="eyebrow">Shown on your website</p>
          <p className="tnum mt-1 font-display text-[24px] font-semibold">
            {reviews.isError ? "—" : published}
          </p>
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

      {appointments.isError ? (
        <QueryErrorNotice
          title="Your completed jobs couldn't be loaded."
          retry={appointments.refetch}
          retrying={appointments.isFetching}
        />
      ) : completed.length ? (
        <Panel className="space-y-2">
          <p className="text-[13px] font-medium">Recently completed jobs</p>
          <div className="space-y-1.5">
            {completed.map((appointment) => {
              const already = asked.data?.has(appointment.id) ?? false;
              return (
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
                    disabled={already || !asked.isSuccess}
                    onClick={() => startAsking(appointment)}
                  >
                    <Send className="size-3.5" /> {already ? "Review requested" : "Ask for a review"}
                  </Button>
                </div>
              );
            })}
          </div>
          {asked.isError ? (
            <QueryErrorNotice
              title="Earlier review requests couldn't be checked."
              retry={asked.refetch}
              retrying={asked.isFetching}
            />
          ) : null}
        </Panel>
      ) : null}

      {reviews.isError ? (
        <QueryErrorNotice
          title="Your reviews couldn't be loaded."
          retry={reviews.refetch}
          retrying={reviews.isFetching}
        />
      ) : reviews.isLoading ? (
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
              Goes to the contact details saved on the completed job. The message is queued
              through your follow-up pipeline and marked sent only once it is actually delivered.
            </DialogDescription>
          </DialogHeader>
          {asking && askingAppointment ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                request.mutate(
                  { appointmentId: askingAppointment.id, channel: asking.channel },
                  { onSuccess: () => setAsking(null) },
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="r-job">Completed job</Label>
                <select
                  id="r-job"
                  value={askingAppointment.id}
                  onChange={(e) => {
                    const next = allCompleted.find((appointment) => appointment.id === e.target.value);
                    if (next) startAsking(next);
                  }}
                  className="h-11 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                >
                  {allCompleted.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.name} · {relative(appointment.starts_at)}
                      {asked.data?.has(appointment.id) ? " · already asked" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                {(["email", "sms"] as const).map((channel) => {
                  const contact =
                    channel === "email" ? askingAppointment.email?.trim() : askingAppointment.phone?.trim();
                  return (
                    <Button
                      key={channel}
                      type="button"
                      variant={asking.channel === channel ? "signal" : "outline"}
                      size="sm"
                      disabled={!contact}
                      onClick={() => setAsking({ ...asking, channel })}
                    >
                      {channel === "email" ? "Email" : "Text"}
                    </Button>
                  );
                })}
              </div>
              <p className="text-[12px] text-muted-foreground">
                To:{" "}
                {(asking.channel === "email" ? askingAppointment.email : askingAppointment.phone) ??
                  "—"}
                {asking.channel === "sms"
                  ? " · Texting needs the customer's opt-in (a START reply); without it the text isn't sent."
                  : ""}
              </p>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAsking(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="signal"
                  disabled={request.isPending || !asked.isSuccess || asked.data.has(askingAppointment.id)}
                >
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
