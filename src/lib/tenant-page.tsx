/**
 * Shared address handling for paths that exist on BOTH Revora's own site and on
 * client websites (for example `/contact`, `/pricing`, `/about`).
 *
 * On `revoragrowthsystems.com` these paths are Revora's marketing pages. On a
 * customer's verified custom domain the same path must be that client's own
 * page — a visitor on `joesplumbing.com` should never see Revora's pricing
 * page.
 */
import type { ReactNode } from "react";
import type { HostSiteResult } from "@/lib/host-site.functions";
import { PublicSiteView } from "@/routes/s.$slug";

/**
 * Loads the client page for this address, or null on Revora's own addresses.
 * On a client address a page that doesn't exist is a plain "page not found" —
 * Revora's marketing page is never shown on a client's website.
 */
/** Renders the client's page when the visitor is on a client address. */
export function TenantOrMarketing({
  tenant,
  children,
}: {
  tenant: HostSiteResult;
  children: ReactNode;
}) {
  if (tenant?.site?.content) return <PublicSiteView site={tenant.site} />;
  return <>{children}</>;
}
