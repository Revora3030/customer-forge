import { createFileRoute } from "@tanstack/react-router";

/**
 * Unsubscribe from Revora's demo-website outreach. GET shows a confirmation
 * with one button; POST (that button, or a mail client's one-click
 * unsubscribe) adds the address to the server-side do-not-contact list, which
 * every send checks first.
 */
async function unsubscribe(request: Request, token: string): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { unsubscribeByToken } = await import("@/lib/prospect-outreach.server");
  let done = false;
  try {
    done = await unsubscribeByToken(supabaseAdmin as never, token);
  } catch (error) {
    console.error("[outreach unsubscribe]", error instanceof Error ? error.message : error);
    return new Response("Couldn't unsubscribe right now. Please try again.", { status: 500 });
  }
  const form = (request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")
    ? await request.formData().catch(() => null)
    : null;
  // RFC 8058 one-click posts "List-Unsubscribe=One-Click" and reads only the status.
  if (form?.get("List-Unsubscribe") === "One-Click") return new Response(null, { status: done ? 200 : 404 });
  const url = new URL(request.url);
  url.search = done ? "?done=1" : "?invalid=1";
  return Response.redirect(url.toString(), 303);
}

export const Route = createFileRoute("/unsubscribe/outreach/$token")({
  head: () => ({
    meta: [
      { title: "Unsubscribe · Revora Growth Systems" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    done: search["done"] === "1" || search["done"] === 1 ? true : undefined,
    invalid: search["invalid"] === "1" || search["invalid"] === 1 ? true : undefined,
  }),
  server: {
    handlers: {
      POST: async ({ request, params }) => unsubscribe(request, params.token),
    },
  },
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { done, invalid } = Route.useSearch();
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4 py-12">
      {done ? (
        <>
          <h1 className="text-2xl font-semibold">You're unsubscribed</h1>
          <p className="text-muted-foreground">Revora Growth Systems won't contact you about your demo website again.</p>
        </>
      ) : invalid ? (
        <>
          <h1 className="text-2xl font-semibold">This link isn't valid</h1>
          <p className="text-muted-foreground">It may be incomplete. Reply to the email or contact us and we'll remove you right away.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Stop these emails?</h1>
          <p className="text-muted-foreground">We'll stop contacting you about the free demo website we built for your business.</p>
          <form method="post">
            <button type="submit" className="min-h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground">
              Unsubscribe
            </button>
          </form>
        </>
      )}
    </main>
  );
}
