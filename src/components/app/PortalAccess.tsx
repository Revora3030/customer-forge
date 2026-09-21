/**
 * Self-serve portal access for a workspace.
 *
 * Owners/admins can turn on a shareable portal code and hand the link to a
 * client, who then creates their own account and joins as a viewer from the
 * public /portal page. Rotating the code instantly invalidates the old link.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { Button } from "@/components/ui/button";
import { getPortalCode, setPortalCode } from "@/lib/portal.functions";

export function portalJoinUrl(code: string, origin?: string) {
  const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${base}/portal?code=${encodeURIComponent(code)}`;
}

export function PortalAccess({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const readCode = useServerFn(getPortalCode);
  const writeCode = useServerFn(setPortalCode);

  const codeQuery = useQuery({
    queryKey: ["portal-code", organizationId],
    enabled: !!organizationId && canManage,
    queryFn: async () => {
      const result = await readCode({ data: { organizationId: organizationId! } });
      if ("error" in result) throw new Error(result.error);
      return result.code;
    },
  });

  const update = useMutation({
    mutationFn: async (enabled: boolean) => {
      const result = await writeCode({ data: { organizationId: organizationId!, enabled } });
      if ("error" in result) throw new Error(result.error);
      return result.code;
    },
    onSuccess: (code) => {
      queryClient.setQueryData(["portal-code", organizationId], code);
      toast.success(code ? "Portal link ready to share." : "Self-serve joining turned off.");
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Could not update portal access.")),
  });

  const code = codeQuery.data ?? null;

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(portalJoinUrl(code));
      toast.success("Portal link copied.");
    } catch {
      toast.error("Copy failed — select the link and copy it manually.");
    }
  };

  if (!canManage) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Only owners and admins can share portal access.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <p className="text-[13px] font-medium">Self-serve portal link</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        Share one link and your client creates their own account and joins this workspace as a
        viewer — no invite email needed. Rotate it any time to cut off the old link.
      </p>

      {codeQuery.isLoading ? (
        <p className="mt-3 text-[12px] text-muted-foreground">Checking portal access…</p>
      ) : code ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 text-[12px]">
              {portalJoinUrl(code)}
            </code>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="mr-1.5 size-3.5" aria-hidden /> Copy
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Code: <span className="tracking-[0.2em]">{code}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate(true)}
            >
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden /> Rotate link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => update.mutate(false)}
            >
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="sm"
          variant="signal"
          className="mt-3"
          disabled={update.isPending}
          onClick={() => update.mutate(true)}
        >
          {update.isPending ? "Creating…" : "Create portal link"}
        </Button>
      )}
    </div>
  );
}
