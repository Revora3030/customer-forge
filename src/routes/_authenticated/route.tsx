import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PRIVATE_ROBOTS } from "@/lib/app-meta";
import { RoutePending } from "@/components/app/RouteStates";
import { SESSION_CHECK_TIMEOUT_MS, withTimeout } from "@/lib/with-timeout";
import { needsSecondFactor } from "@/lib/two-factor";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Rendered by the server for this client-only route and while the session
  // check runs, so a first load shows a Revora loading screen, never black.
  pendingComponent: RoutePending,
  pendingMs: 0,
  head: () => ({ meta: [{ name: "robots", content: PRIVATE_ROBOTS }] }),
  beforeLoad: async ({ location }) => {
    const { data, error } = await withTimeout(
      supabase.auth.getUser(),
      SESSION_CHECK_TIMEOUT_MS,
      "Checking your sign-in took too long. Try again.",
    );
    if (error || !data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    // LOV-12: a session that still owes its authenticator code (e.g. arrived by
    // magic link or Google) finishes the code step on /auth before any app page.
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null);
    if (aal && !aal.error && needsSecondFactor(aal.data)) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    // A client who signed up through a portal link may land here after
    // confirming their email. Finish the join they started instead of
    // dropping them into an empty workspace.
    const pending =
      typeof window === "undefined" ? null : window.localStorage.getItem("revora.portal_code");
    if (pending) throw redirect({ to: "/portal", search: { code: pending } });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
