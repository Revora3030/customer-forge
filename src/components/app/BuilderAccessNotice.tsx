import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/use-tenant";
import { getBuilderAccessStatus } from "@/lib/builder-access-status.functions";
import { builderAccessView, type BuilderAccessUiState } from "@/lib/builder-access-status";

/**
 * The verified account access for this workspace. Presentation only: every
 * editing and publishing request is still checked on the server.
 *
 * - ready / checking (incl. demo): takes no space, announced to screen readers.
 * - readonly, past due, error: one slim strip with its single action.
 * - blocked: the only prominent state, one banner with its call to action.
 */
export function BuilderAccessNotice({ onStateChange }: { onStateChange: (state: BuilderAccessUiState) => void }) {
  const workspace = useWorkspace();
  const userId = workspace.data?.user?.id;
  const organizationId = workspace.data?.workspace?.organizationId;
  const getStatus = useServerFn(getBuilderAccessStatus);
  const access = useQuery({
    queryKey: ["builder-access-status", userId, organizationId],
    enabled: Boolean(userId && organizationId),
    queryFn: () => getStatus({ data: { organizationId: organizationId! } }),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const view = builderAccessView({
    signedIn: Boolean(userId), hasWorkspace: Boolean(organizationId),
    checking: workspace.isPending || Boolean(userId && organizationId && access.isPending),
    failed: workspace.isError || access.isError,
    ...(access.data !== undefined ? { access: access.data } : {}),
  });
  useEffect(() => { onStateChange(view.state); }, [onStateChange, view.state]);

  const footnote = <p className="sr-only">This checks account access, not AI-provider availability.</p>;

  // Ready with an action is "payment needs attention" (past due): that one
  // keeps a slim strip so the owner can reach Billing.
  if (view.state === "checking" || (view.state === "ready" && !view.action)) {
    return (
      <section data-testid="builder-access-notice" data-access-state={view.state} aria-label="Verified workspace access" className="sr-only">
        <p role="status" aria-live="polite">{view.title}</p>
        {footnote}
      </section>
    );
  }

  if (view.state === "blocked") {
    return (
      <section data-testid="builder-access-notice" data-access-state={view.state} aria-label="Verified workspace access" className="mb-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <div className="flex flex-wrap items-start gap-2.5">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 flex-1" role="status" aria-live="polite">
            <p className="font-medium">{view.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{view.detail}</p>
          </div>
          {view.action ? (
            <Button asChild variant="signal" size="sm" data-tap="primary">
              <a href={view.action.href}>{view.action.label}</a>
            </Button>
          ) : null}
        </div>
        {footnote}
      </section>
    );
  }

  // readonly, past due and error: one quiet strip with a single action.
  return (
    <section data-testid="builder-access-notice" data-access-state={view.state} aria-label="Verified workspace access" className="mb-2 flex min-h-10 items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-1.5 text-xs">
      <TriangleAlert className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate" role="status" aria-live="polite" title={view.detail}>{view.title}</p>
      {view.state === "error" ? (
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" disabled={workspace.isFetching || access.isFetching}
          onClick={() => { if (workspace.isError) void workspace.refetch(); else void access.refetch(); }}>Retry access check</Button>
      ) : view.action ? (
        <Button asChild variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs">
          <a href={view.action.href}>{view.action.label}</a>
        </Button>
      ) : null}
      {footnote}
    </section>
  );
}
