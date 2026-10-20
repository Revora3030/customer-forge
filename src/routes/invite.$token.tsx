import * as React from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { acceptTeamInvitation } from "@/lib/team.functions";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Accept your Revora invite" },
      {
        name: "description",
        content: "Join your team's Revora workspace to work leads, bookings and the website.",
      },
      { property: "og:title", content: "Accept your Revora invite" },
      { property: "og:description", content: "Join your team’s Revora workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcceptInvitePage,
});

type State =
  | { step: "checking" }
  | { step: "signin" }
  | { step: "joining" }
  | { step: "joined"; workspace: string | null }
  | { step: "error"; message: string };

function AcceptInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptTeamInvitation);
  const [state, setState] = React.useState<State>({ step: "checking" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        setState({ step: "signin" });
        return;
      }
      setState({ step: "joining" });
      try {
        const result = await accept({ data: { token } });
        if (cancelled) return;
        if ("error" in result) setState({ step: "error", message: result.error });
        else setState({ step: "joined", workspace: result.organizationName });
      } catch (error) {
        if (!cancelled)
          setState({
            step: "error",
            message: error instanceof Error ? error.message : "Could not accept this invite.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accept, token]);

  const authLink = `/auth?redirect=${encodeURIComponent(`/invite/${token}`)}`;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-5 py-16">
      <p className="eyebrow">Team invitation</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold">
        {state.step === "joined" ? "You're in" : "Join your Revora workspace"}
      </h1>

      {state.step === "checking" || state.step === "joining" ? (
        <p className="mt-3 text-[14px] text-muted-foreground">Checking your invitation…</p>
      ) : null}

      {state.step === "signin" ? (
        <>
          <p className="mt-3 text-[14px] text-muted-foreground">
            Sign in — or create your account with the email this invite was sent to — and you'll
            join the workspace automatically.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to={authLink}>Sign in or create account</Link>
            </Button>
          </div>
        </>
      ) : null}

      {state.step === "joined" ? (
        <>
          <p className="mt-3 text-[14px] text-muted-foreground">
            You now have access to {state.workspace ?? "your team's workspace"}.
          </p>
          <div className="mt-6">
            <Button onClick={() => navigate({ to: "/app", replace: true })}>
              Open the dashboard
            </Button>
          </div>
        </>
      ) : null}

      {state.step === "error" ? (
        <>
          <p className="mt-3 text-[14px] text-muted-foreground">{state.message}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to={authLink}>Use a different account</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">Back to Revora</Link>
            </Button>
          </div>
        </>
      ) : null}
    </main>
  );
}
