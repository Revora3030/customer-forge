import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import type { PagePlan } from "@/lib/builder/page-plan";
import {
  getPagePlan,
  restorePagePlanVersion,
  revisePlanPart,
  savePagePlan,
  type PagePlanState,
} from "@/lib/builder/page-plan.functions";

const key = (organizationId: string | undefined) => ["page_plan", organizationId] as const;

export function usePagePlan(organizationId: string | undefined, enabled: boolean) {
  const read = useServerFn(getPagePlan);
  return useQuery({
    queryKey: key(organizationId),
    enabled: !!organizationId && enabled,
    queryFn: () => read({ data: { organizationId: organizationId! } }),
  });
}

function useApply(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return (state: PagePlanState) => queryClient.setQueryData(key(organizationId), state);
}

export function useSavePagePlan(organizationId: string | undefined) {
  const save = useServerFn(savePagePlan);
  const apply = useApply(organizationId);
  return useMutation({
    mutationFn: (vars: { plan: PagePlan; approve: boolean }) =>
      save({ data: { organizationId: organizationId!, plan: vars.plan, approve: vars.approve } }),
    onSuccess: (state, vars) => {
      apply(state);
      toast.success(vars.approve ? "Plan approved — the build will follow it." : "Plan saved.");
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save the plan.")),
  });
}

export function useRevisePlanPart(organizationId: string | undefined) {
  const revise = useServerFn(revisePlanPart);
  const apply = useApply(organizationId);
  return useMutation({
    mutationFn: (vars: { slug: string; pointIndex?: number; request: string }) =>
      revise({ data: { organizationId: organizationId!, ...vars } }),
    onSuccess: (result) => {
      apply(result);
      if (!result.changed) toast.info("Nothing changed — try asking in different words.");
      else if (result.ignoredOutsideEdits > 0)
        toast.success("Changed the part you highlighted. Everything else stayed as it was.");
      else toast.success("Changed the part you highlighted.");
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't change that part of the plan.")),
  });
}

export function useRestorePagePlan(organizationId: string | undefined) {
  const restore = useServerFn(restorePagePlanVersion);
  const apply = useApply(organizationId);
  return useMutation({
    mutationFn: (version: number) => restore({ data: { organizationId: organizationId!, version } }),
    onSuccess: (state) => {
      apply(state);
      toast.success("Went back to that version. It's saved as the newest one.");
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't go back to that version.")),
  });
}
