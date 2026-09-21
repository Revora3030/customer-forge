import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { isTransientFailure, withTransientRetry } from "@/lib/transient";
import { trackConversion } from "@/lib/conversion";
import {
  activateProduction,
  checkProductionReadiness,
  getProductionStatus,
  type ActivationResult,
  type ProductionReadiness,
  type ProductionStatus,
} from "@/lib/production.functions";

/** Sandbox/production state for this workspace, read from the server. */
export function useProductionStatus(organizationId: string | undefined) {
  return useQuery<ProductionStatus>({
    queryKey: ["production-status", organizationId],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: () => getProductionStatus({ data: { organizationId: organizationId! } }),
  });
}

/** Deployment readiness — recomputed server-side from live workspace data. */
export function useProductionReadiness(organizationId: string | undefined) {
  return useQuery<ProductionReadiness>({
    queryKey: ["production-readiness", organizationId],
    enabled: !!organizationId,
    staleTime: 15_000,
    queryFn: () => checkProductionReadiness({ data: { organizationId: organizationId! } }),
  });
}

/**
 * Sorts a server refusal into the short reason codes the drop-off report reads,
 * so "where owners get stuck" is answered from what actually happened rather
 * than from free-text wording that changes.
 */
function blockReason(result: ActivationResult): string {
  const text = `${result.reason} ${result.readiness.blockers.join(" ")}`.toLowerCase();
  if (text.includes("suspend")) return "suspended";
  if (text.includes("setup") || text.includes("payment") || text.includes("$750"))
    return "setup_unpaid";
  if (!result.readiness.unlocked) return "locked";
  if (text.includes("permission") || text.includes("owner") || text.includes("allowed"))
    return "not_permitted";
  if (text.includes("nothing") || text.includes("empty") || text.includes("no page"))
    return "no_content";
  if (result.readiness.blockers.length > 0) return "not_ready";
  return "unknown";
}

/**
 * One launch path for every publish button in the builder.
 *
 * The server decides the outcome: locked → the activation panel opens,
 * not-ready → the blockers are shown, ready → the site goes live. A publish
 * that fails on a passing glitch (dropped connection, service hiccup) is
 * retried automatically, and if it still will not go through the owner is left
 * with a plain "Try again" rather than a dead end. A refusal is never retried,
 * because it would be refused identically every time.
 */
export function useLaunchFlow(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const [lockedOpen, setLockedOpen] = useState(false);
  const [result, setResult] = useState<ActivationResult | null>(null);
  /** Set only when trying again could plausibly work. */
  const [retryable, setRetryable] = useState<string | null>(null);

  const mutation = useMutation<ActivationResult>({
    mutationFn: () =>
      withTransientRetry(() => activateProduction({ data: { organizationId: organizationId! } }), {
        attempts: 3,
        onRetry: (attempt) => {
          toast.loading(
            attempt === 1
              ? "The connection dropped — trying again…"
              : "Still trying to take your website live…",
            { id: "launch-retry" },
          );
        },
      }),
    onSuccess: (data) => {
      toast.dismiss("launch-retry");
      setResult(data);
      setRetryable(null);
      if (data.activated) {
        // Recorded only now: a button press is not a live website.
        trackConversion("site_published", {
          metadata: { organization_id: organizationId ?? "" },
        });
        toast.success("Your website is live.");
        setLockedOpen(false);
      } else if (!data.readiness.unlocked) {
        trackConversion("publish_blocked", {
          metadata: { organization_id: organizationId ?? "", reason: blockReason(data) },
        });
        setLockedOpen(true);
      } else {
        trackConversion("publish_blocked", {
          metadata: { organization_id: organizationId ?? "", reason: blockReason(data) },
        });
        toast.error(data.reason);
      }
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
      void queryClient.invalidateQueries({ queryKey: ["production-status"] });
      void queryClient.invalidateQueries({ queryKey: ["production-readiness"] });
      void queryClient.invalidateQueries({ queryKey: ["website_versions"] });
    },
    onError: (error: Error) => {
      toast.dismiss("launch-retry");
      const transient = isTransientFailure(error);
      const message = friendlyError(error, "We couldn't take the website live.");
      setRetryable(transient ? message : null);
      trackConversion(transient ? "publish_failed" : "publish_blocked", {
        metadata: {
          organization_id: organizationId ?? "",
          reason: transient ? "service_unavailable" : "unknown",
        },
      });
      if (transient) {
        toast.error(`${message} Your work is saved — you can try again.`, {
          action: { label: "Try again", onClick: () => mutation.mutate() },
          duration: 12_000,
        });
      } else {
        toast.error(message);
      }
    },
  });

  const launch = useCallback(() => {
    if (!organizationId) return;
    setRetryable(null);
    mutation.mutate();
  }, [mutation, organizationId]);

  return {
    launch,
    /** Plain-language reason a retry is worth offering, or null. */
    retryable,
    retry: launch,
    dismissRetry: () => setRetryable(null),
    isLaunching: mutation.isPending,
    lockedOpen,
    openLocked: () => setLockedOpen(true),
    closeLocked: () => setLockedOpen(false),
    result,
  };
}
