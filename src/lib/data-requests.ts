/**
 * Data export / deletion requests from Settings.
 *
 * There is no self-serve delete yet: deleting a workspace touches billing,
 * the published site and shared team data, so a person handles it (see
 * docs/runbooks/data-deletion-request.md). The request is a prefilled email
 * from the account holder, which also proves they control the address.
 */
import { REVORA } from "@/lib/brand";

export type DataRequestKind = "export" | "delete";

export interface DataRequestContext {
  email?: string | null | undefined;
  businessName?: string | null | undefined;
  organizationId?: string | null | undefined;
}

export function dataRequestMailto(kind: DataRequestKind, ctx: DataRequestContext): string {
  const subject =
    kind === "delete" ? "Account and data deletion request" : "Request for a copy of my data";
  const ask =
    kind === "delete"
      ? "Please delete my Revora account and the data in this workspace. I understand billing records you must keep by law are retained, and that my published site will go offline."
      : "Please send me a copy of the personal and business data you hold for this workspace.";
  const body = [
    ask,
    "",
    `Account email: ${ctx.email ?? ""}`,
    `Business: ${ctx.businessName ?? ""}`,
    `Workspace ID: ${ctx.organizationId ?? ""}`,
  ].join("\n");
  return `mailto:${REVORA.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
