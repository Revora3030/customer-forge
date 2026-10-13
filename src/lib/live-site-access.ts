import { resolveAccess, type AccessOrgFields } from "@/lib/access-state";
import { isPlatformOwnerOrg } from "@/lib/platform-owner";

/**
 * Whether a workspace may publish and keep its site live.
 * Any customer with access (free trial window, setup paid, active
 * subscription, payment grace) may publish. When access ends the live site is
 * served offline automatically; paying the setup fee brings it straight back.
 */
export function liveSiteAllowed(org: AccessOrgFields | null | undefined): boolean {
  if (!org || org.is_suspended) return false;
  if (org.is_demo || isPlatformOwnerOrg(org.id)) return true;
  return resolveAccess(org).allowed;
}
