/**
 * Shown in place of a lead form when the database would refuse the submission
 * (the ORG_NOT_PUBLIC publish gate): a shareable preview of a site that has
 * not been published yet. Visitors are told plainly that the forms start
 * working once the site is live; a signed-in owner, admin or manager of the
 * workspace also gets a direct link to publish it.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SITE_NOT_LIVE_MESSAGE } from "@/lib/site-submission-gate";

const PUBLISH_ROLES = new Set(["owner", "admin", "manager"]);

export function canPublishRole(role: string | null | undefined): boolean {
  return PUBLISH_ROLES.has(String(role ?? ""));
}

export function SiteNotLiveNotice({ organizationId }: { organizationId: string }) {
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getSession();
        const userId = auth.session?.user.id;
        if (!userId || !organizationId) return;
        const { data } = await supabase
          .from("memberships")
          .select("role")
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (active) setCanPublish(canPublishRole((data as { role?: string } | null)?.role));
      } catch {
        /* visitors without a session simply see the plain note */
      }
    })();
    return () => {
      active = false;
    };
  }, [organizationId]);

  return (
    <div role="status" className="panel px-6 py-8 text-center" data-testid="site-not-live">
      <p className="text-[15px] font-medium">{SITE_NOT_LIVE_MESSAGE}</p>
      {canPublish ? (
        <p className="mt-2 text-[13px] text-muted-foreground" data-testid="site-not-live-owner">
          You're seeing this because your site is still a draft.{" "}
          <Link to="/app/launch" className="font-medium text-primary underline underline-offset-2">
            Publish your site
          </Link>{" "}
          to start receiving leads from this form.
        </p>
      ) : null}
    </div>
  );
}
