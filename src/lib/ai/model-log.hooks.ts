import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBuilderModelLog, type ModelLog } from "@/lib/ai/model-log.functions";

/** Recent model activity for one workspace: what each model was asked to do. */
export function useBuilderModelLog(organizationId: string | undefined, limit = 60) {
  const read = useServerFn(getBuilderModelLog);
  return useQuery<ModelLog>({
    queryKey: ["builder_model_log", organizationId, limit],
    enabled: !!organizationId,
    staleTime: 15_000,
    queryFn: () => read({ data: { organizationId: organizationId!, limit } }),
  });
}
