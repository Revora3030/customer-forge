/**
 * Shared data for the chat's checkpoints (CU-5): one cached list for the
 * timeline and every "restore to before this message" action, and one restore
 * that goes through the normal publish path and runs the same live check.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listCheckpoints,
  restoreCheckpoint,
  updateCheckpoint,
} from "@/lib/builder/checkpoints.functions";
import { recordPublishAndSmoke } from "@/lib/publish-records.functions";
import { friendlyError } from "@/lib/user-error";
import { toast } from "@/lib/ui/notify";

export const checkpointsKey = (organizationId: string | null | undefined) =>
  ["builder_checkpoints", organizationId] as const;

export function useCheckpoints(organizationId: string | null | undefined) {
  const load = useServerFn(listCheckpoints);
  return useQuery({
    queryKey: checkpointsKey(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    retry: false,
    queryFn: () => load({ data: { organizationId: organizationId! } }),
  });
}

/** Refreshes everything that shows versions after a restore or a rename. */
function useRefreshVersions(organizationId: string | null | undefined) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      "builder_checkpoints",
      "site_versions",
      "website_versions",
      "publish_events",
      "website_settings",
    ])
      void queryClient.invalidateQueries({ queryKey: [key, organizationId] });
  };
}

export function useRestoreCheckpoint(
  organizationId: string | null | undefined,
  onDone?: () => void,
) {
  const restore = useServerFn(restoreCheckpoint);
  const smoke = useServerFn(recordPublishAndSmoke);
  const refresh = useRefreshVersions(organizationId);
  return useMutation({
    mutationFn: (entry: { id: string; version: number }) =>
      restore({ data: { organizationId: organizationId!, versionId: entry.id } }).then(
        (result) => ({
          ...result,
          source: entry.version,
        }),
      ),
    onSuccess: (result) => {
      onDone?.();
      if (!result.activated) {
        toast.error(result.reason);
        return;
      }
      toast.success(`${result.reason} Your draft is unchanged.`);
      // The same live check a normal publish gets.
      if (result.version)
        void smoke({
          data: {
            organizationId: organizationId!,
            version: result.version,
            sourceVersion: result.source,
          },
        })
          .then((check) => {
            if (check.status === "failed")
              toast.warning(
                "The checkpoint is restored, but the live check found a problem. See Publish history.",
                {
                  duration: 12_000,
                },
              );
            refresh();
          })
          .catch(() => undefined);
      refresh();
    },
    onError: (error: Error) =>
      toast.error(
        friendlyError(error, "Couldn't restore that checkpoint. Your live site is unchanged."),
      ),
  });
}

export function useUpdateCheckpoint(organizationId: string | null | undefined) {
  const update = useServerFn(updateCheckpoint);
  const refresh = useRefreshVersions(organizationId);
  return useMutation({
    mutationFn: (patch: { versionId: string; name?: string | null; pinned?: boolean }) =>
      update({ data: { organizationId: organizationId!, ...patch } }),
    onSuccess: () => refresh(),
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't save that checkpoint right now.")),
  });
}
