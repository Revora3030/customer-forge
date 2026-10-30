import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PRIVATE_ROBOTS } from "@/lib/app-meta";
import { RoutePending } from "@/components/app/RouteStates";
import { SESSION_CHECK_TIMEOUT_MS, withTimeout } from "@/lib/with-timeout";

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
