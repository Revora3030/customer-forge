import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getReviewFeedback } from "@/lib/review-feedback.functions";
import { parseRating, FEEDBACK_MAX_LENGTH } from "@/lib/review-sequence";

/**
 * A customer's private "How did we do?" page from the post-job review email.
 * GET only reads (inbox link scanners prefetch links), so `?rating=N` from a
 * star in the email just preselects the stars; the customer confirms with a
 * POST. 4–5 stars go on to the business's public Google review page; 1–3
 * stars are asked for a private note first. The public review link is shown
 * for every rating: Google forbids keeping unhappy customers from reviewing.
 */
async function submit(request: Request, token: string): Promise<Response> {
  const back = new URL(request.url);
  back.search = "";
  const form = await request.formData().catch(() => null);
  const [{ supabaseAdmin }, feedback] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/review-feedback.server"),
  ]);
  try {
    if (form?.get("intent") === "feedback") {
      const view = await feedback.recordPrivateFeedback(supabaseAdmin, token, form.get("feedback"));
      if (!view) return Response.redirect(back.toString(), 303);
      back.search = "?sent=1";
      return Response.redirect(back.toString(), 303);
    }
    const rating = parseRating(form?.get("rating"));
    if (rating == null) return Response.redirect(back.toString(), 303);
    const view = await feedback.recordFeedbackRating(supabaseAdmin, token, rating);
    if (view?.routedTo === "google" && view.reviewUrl) return Response.redirect(view.reviewUrl, 303);
    return Response.redirect(back.toString(), 303);
  } catch (error) {
    console.error("[review-feedback]", error instanceof Error ? error.message : "unknown");
    return new Response("Couldn't save that right now. Please try again.", { status: 500 });
  }
}

export const Route = createFileRoute("/feedback/$token")({
  loader: async ({ params }) => ({ view: await getReviewFeedback({ data: { token: params.token } }) }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `How did we do? · ${loaderData?.view?.businessName ?? "Feedback"}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    rating: parseRating(search["rating"]) ?? undefined,
    sent: search["sent"] === "1" || search["sent"] === 1 ? true : undefined,
  }),
  server: {
    handlers: {
      POST: async ({ request, params }) => submit(request, params.token),
    },
  },
  component: FeedbackPage,
});

const STARS = [1, 2, 3, 4, 5] as const;

function PublicReviewLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  return (
    <a href={url} rel="noopener noreferrer" className="text-sm text-muted-foreground underline underline-offset-4">
      {label}
    </a>
  );
}

function FeedbackPage() {
  const { view } = Route.useLoaderData();
  const { rating: preselected, sent } = Route.useSearch();
  const [rating, setRating] = useState<number | null>(preselected ?? null);

  if (!view) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">This link isn't valid</h1>
        <p className="text-muted-foreground">It may be incomplete. Reply to the email and the team will take it from there.</p>
      </main>
    );
  }

  if (view.rating == null) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-5 px-4 py-12">
        <h1 className="text-2xl font-semibold">How did {view.businessName} do, {view.firstName}?</h1>
        <form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="rate" />
          <fieldset className="flex gap-2" aria-label="Your rating">
            {STARS.map((n) => (
              <label key={n} className="cursor-pointer">
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="sr-only"
                  required
                />
                <span
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className={`text-4xl ${rating != null && n <= rating ? "text-amber-400" : "text-muted-foreground/40"}`}
                >
                  ★
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground">
            Send rating
          </button>
        </form>
      </main>
    );
  }

  if (view.routedTo === "google") {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold">Thank you, {view.firstName}!</h1>
        <p className="text-muted-foreground">Would you share that on Google? It helps {view.businessName} more than anything.</p>
        {view.reviewUrl ? (
          <a
            href={view.reviewUrl}
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
          >
            Leave a Google review
          </a>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4 py-12">
      {sent || view.feedbackSent ? (
        <>
          <h1 className="text-2xl font-semibold">Thanks for telling us</h1>
          <p className="text-muted-foreground">Your note went straight to {view.businessName}. They'll be in touch.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Sorry it wasn't great, {view.firstName}</h1>
          <p className="text-muted-foreground">
            Tell {view.businessName} what went wrong. This note goes privately to the owner so they can make it right.
          </p>
          <form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="intent" value="feedback" />
            <textarea
              name="feedback"
              required
              maxLength={FEEDBACK_MAX_LENGTH}
              rows={5}
              className="w-full rounded-md border border-input bg-background p-3"
              aria-label="Your feedback"
            />
            <button type="submit" className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground">
              Send privately
            </button>
          </form>
        </>
      )}
      <PublicReviewLink url={view.reviewUrl} label="Prefer to post a public review on Google instead?" />
    </main>
  );
}
