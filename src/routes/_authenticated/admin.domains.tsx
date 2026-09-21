import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { Globe, RefreshCw } from "lucide-react";
import { EmptyState, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { listClients, verifyClientDomain } from "@/lib/admin.functions";
import { DOMAIN_STATES } from "@/lib/readiness";
import { dateLong } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/domains")({
  head: () => ({
    meta: [{ title: "Domains — Revora admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminDomains,
});

function AdminDomains() {
  const clientsFn = useServerFn(listClients);
  const verify = useServerFn(verifyClientDomain);
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: ["admin", "clients"], queryFn: () => clientsFn({}) });

  const recheck = useMutation({
    mutationFn: (organizationId: string) => verify({ data: { organizationId } }),
    onSuccess: async (result) => {
      toast.message(DOMAIN_STATES[result.status]?.label ?? result.status, {
        description: result.detail,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const rows = (clients.data ?? []).filter((client) => client.custom_domain);

  return (
    <div className="space-y-5">
      <SectionHeading eyebrow="Domains" title="Custom domain connections" />
      <p className="max-w-2xl text-[13px] text-muted-foreground">
        Each domain is bound to exactly one client workspace. A domain is only reported as connected
        after DNS actually resolves to the platform, and SSL only once HTTPS answers on that
        hostname.
      </p>

      {clients.isLoading ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Globe className="size-5" />}
          title="No custom domains requested"
          description="Add a desired domain on a client to start the DNS verification flow."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((client) => (
            <Panel key={client.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-[13px]">{client.custom_domain}</p>
                <p className="mt-1 truncate text-[12px] text-muted-foreground">
                  {client.name} · workspace {client.slug}
                  {client.domain_checked_at
                    ? ` · checked ${dateLong(client.domain_checked_at)}`
                    : ""}
                </p>
                {client.domain_error ? (
                  <p className="mt-0.5 text-[11px] text-destructive">{client.domain_error}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={DOMAIN_STATES[client.domain_status]?.tone ?? "neutral"}>
                  {DOMAIN_STATES[client.domain_status]?.label ?? client.domain_status}
                </Pill>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recheck.isPending}
                  onClick={() => recheck.mutate(client.id)}
                >
                  <RefreshCw className="mr-1 size-3.5" /> Re-check
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/admin/clients/$orgId" params={{ orgId: client.id }}>
                    Open
                  </Link>
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
