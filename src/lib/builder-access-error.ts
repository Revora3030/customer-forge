export type BuilderAccessBlock = {
  kind: "expired" | "canceled" | "suspended" | "authentication" | "permission";
  message: string;
  retryable: false;
};

/** Presentation only. Never grants entitlement or changes server authorization. */
export function builderAccessBlock(message: string): BuilderAccessBlock | null {
  const text = message.trim().toLowerCase();
  if (text.includes("your free access has ended"))
    return { kind: "expired", message: "Your free access has ended. Your work is saved. Open Billing to restore access.", retryable: false };
  if (text.includes("your subscription is canceled") || text.includes("your subscription is cancelled"))
    return { kind: "canceled", message: "Your subscription is canceled. Your work is saved. Open Billing to restore access.", retryable: false };
  if (text.includes("this workspace is suspended"))
    return { kind: "suspended", message: "This workspace is suspended. Contact support before trying this action again.", retryable: false };
  if (["authentication required", "not authenticated", "sign in to continue", "session has expired"].some((part) => text.includes(part)))
    return { kind: "authentication", message: "Your session has expired. Sign in to continue.", retryable: false };
  if (["access_denied:", "you do not have access to this organization", "you do not have permission", "you don't have permission"].some((part) => text.includes(part)))
    return { kind: "permission", message: "You don't have permission to build in this workspace. Ask the workspace owner for manager access. Support staff: start a support session for this workspace, then try again.", retryable: false };
  return null;
}
