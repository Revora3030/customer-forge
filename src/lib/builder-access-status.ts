export type BuilderAccessStatus = {
  allowed: boolean;
  canManage: boolean;
  state: string;
  reason: string;
};
export type BuilderAccessUiState = "checking" | "error" | "blocked" | "readonly" | "ready";
export type BuilderAccessView = {
  state: BuilderAccessUiState;
  title: string;
  detail: string;
  action?: { label: string; href: "/auth" | "/app" | "/app/billing" };
};

/** Presentation only; never authorizes a request or substitutes for server checks. */
export function builderAccessView(input: {
  signedIn: boolean;
  hasWorkspace: boolean;
  checking: boolean;
  failed: boolean;
  access?: BuilderAccessStatus;
}): BuilderAccessView {
  if (input.checking) return { state: "checking", title: "Checking workspace access", detail: "Account access has not been verified yet." };
  if (input.failed) return { state: "error", title: "Access check unavailable", detail: "We could not verify account access. Retry the check; your draft has not been changed." };
  if (!input.signedIn) return { state: "blocked", title: "Sign in to continue", detail: "A verified session is required for this workspace.", action: { label: "Sign in", href: "/auth" } };
  if (!input.hasWorkspace) return { state: "blocked", title: "Choose a workspace", detail: "Open a workspace before requesting changes.", action: { label: "Open workspace", href: "/app" } };
  const access = input.access;
  if (!access) return { state: "checking", title: "Checking workspace access", detail: "Account access has not been verified yet." };
  if (!access.allowed) {
    if (access.state === "EXPIRED" || access.state === "CANCELED")
      return { state: "blocked", title: access.state === "EXPIRED" ? "Free access ended" : "Subscription canceled", detail: "Your saved work remains available. Review Billing to restore editing access.", action: { label: "Review billing", href: "/app/billing" } };
    if (access.state === "SUSPENDED") return { state: "blocked", title: "Workspace suspended", detail: "Contact support before requesting further changes." };
    return { state: "blocked", title: "Editing access unavailable", detail: "The server has not authorized editing in this workspace." };
  }
  if (!access.canManage) return { state: "readonly", title: "Read-only workspace", detail: "You can review this workspace. Ask the owner for permission to make changes." };
  if (access.state === "PAST_DUE") return { state: "ready", title: "Editing access verified; payment needs attention", detail: "The server currently allows builder access. Review your payment details.", action: { label: "Review billing", href: "/app/billing" } };
  return { state: "ready", title: access.state === "DEMO" ? "Demo workspace access verified" : "Editing access verified", detail: "Each editing and publishing request is still checked on the server." };
}
