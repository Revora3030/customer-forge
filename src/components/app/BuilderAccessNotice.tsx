import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/use-tenant";
import { getBuilderAccessStatus } from "@/lib/builder-access-status.functions";
import { builderAccessView, type BuilderAccessUiState } from "@/lib/builder-access-status";

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
  const Icon = view.state === "checking" ? Loader2 : view.state === "ready" ? ShieldCheck : view.state === "error" ? TriangleAlert : LockKeyhole;
  return (
    <section className="mb-3 rounded-xl border border-border bg-card/70 px-3 py-3" aria-label="Verified workspace access" data-testid="builder-access-notice" data-access-state={view.state}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon className={`mt-0.5 size-4 shrink-0 text-muted-foreground ${view.state === "checking" ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="text-[13px] font-medium">{view.title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{view.detail}</p>
        </div>
        {view.action ? <Button asChild variant="outline" size="sm"><a href={view.action.href}>{view.action.label}</a></Button> : null}
        {view.state === "error" ? <Button type="button" variant="outline" size="sm" disabled={workspace.isFetching || access.isFetching}
          onClick={() => { if (workspace.isError) void workspace.refetch(); else void access.refetch(); }}>Retry access check</Button> : null}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">This checks account access, not AI-provider availability.</p>
    </section>
  );
}
