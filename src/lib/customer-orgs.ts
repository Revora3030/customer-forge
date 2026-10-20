/**
 * Who counts as a customer on admin reports. A workspace is a customer only
 * when it is not a demo, not Revora's own workspace, and at least one of its
 * members is not Revora staff. Workspaces staff created only for themselves
 * (tests, internal builds) are never customers.
 */
import { isPlatformOwnerOrg } from "@/lib/platform-owner";

export function customerOrgIds(
  orgs: { id: string; is_demo: boolean | null }[],
  memberships: { organization_id: string; user_id: string }[],
  staffIds: Iterable<string>,
): Set<string> {
  const staff = new Set(staffIds);
  const hasCustomerMember = new Set(
    memberships.filter((m) => !staff.has(m.user_id)).map((m) => m.organization_id),
  );
  return new Set(
    orgs
      .filter((o) => !o.is_demo && !isPlatformOwnerOrg(o.id) && hasCustomerMember.has(o.id))
      .map((o) => o.id),
  );
}
