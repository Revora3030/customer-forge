import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { captureSiteState, restoreSiteState } from "@/lib/site-restore.functions";
import { countSnapshot, type FullSnapshot } from "@/lib/site-restore";
import { friendlyError } from "@/lib/user-error";

/**
 * Restore points: an exact copy of the website taken before a risky change, so
 * one click puts everything back — pages, sections, elements, links and
 * settings. The copy is held in this browser only; it is never a source of
 * truth for billing, access or publishing.
 */

export type RestorePoint = {
  label: string;
  takenAt: string;
  snapshot: FullSnapshot;
};

const keyFor = (organizationId: string) => `revora.restore-point.${organizationId}`;

function readStored(organizationId: string): RestorePoint | null {
  try {
    const raw = window.localStorage.getItem(keyFor(organizationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestorePoint;
    return parsed?.snapshot?.format === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function useRestorePoint(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const capture = useServerFn(captureSiteState);
  const restore = useServerFn(restoreSiteState);
  const [point, setPoint] = useState<RestorePoint | null>(null);

  useEffect(() => {
    if (!organizationId || typeof window === "undefined") return;
    setPoint(readStored(organizationId));
  }, [organizationId]);

  const save = useMutation({
    mutationFn: async (label?: string) => {
      return (await capture({
        data: { organizationId: organizationId!, label: label ?? "Restore point" },
      })) as { snapshot: FullSnapshot; label: string };
    },
    onSuccess: (result) => {
      const next: RestorePoint = {
        label: result.label,
        takenAt: result.snapshot.takenAt,
        snapshot: result.snapshot,
      };
      try {
        window.localStorage.setItem(keyFor(organizationId!), JSON.stringify(next));
        setPoint(next);
        const counts = countSnapshot(next.snapshot);
        toast.success(
          `Restore point saved — ${counts.pages} pages, ${counts.sections} sections, ${counts.components} elements.`,
        );
      } catch {
        toast.error("This website is too large to store a restore point in this browser.");
      }
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't save a restore point right now.")),
  });

  const rollback = useMutation({
    mutationFn: async () => {
      if (!point) throw new Error("There's no restore point saved yet.");
      return restore({ data: { organizationId: organizationId!, snapshot: point.snapshot } });
    },
    onSuccess: (raw) => {
      const result = raw as { exact: boolean; summary: string };
      if (result.exact) toast.success(result.summary);
      else toast.warning(result.summary);
      void queryClient.invalidateQueries({ queryKey: ["website_pages"] });
      void queryClient.invalidateQueries({ queryKey: ["website_content"] });
      void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't put your website back.")),
  });

  const clear = useCallback(() => {
    if (!organizationId) return;
    window.localStorage.removeItem(keyFor(organizationId));
    setPoint(null);
  }, [organizationId]);

  return { point, save, rollback, clear };
}
