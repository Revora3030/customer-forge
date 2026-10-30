import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PRIVATE_ROBOTS } from "@/lib/app-meta";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: PRIVATE_ROBOTS }] }),
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
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
