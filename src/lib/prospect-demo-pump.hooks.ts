import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { listProspectDemoBuilds } from "@/lib/jarvis-demo-site.functions";
import { pumpSiteEngineQueue } from "@/lib/site-engine.functions";

export const ACTIVE_DEMO_STATUSES = new Set(["queued", "processing"]);
type DemoList = Awaited<ReturnType<typeof listProspectDemoBuilds>>;

export const pollWhileActive = (data: DemoList | undefined) =>
  (data ?? []).some((demo) => demo.build && ACTIVE_DEMO_STATUSES.has(demo.build.status)) ? 5_000 : false;

/**
 * Keeps active demo builds moving, even without a scheduler: pumps each active
 * build's queue every 20s. Called by the Jarvis page so it runs while the page
 * is open, not only while the operations sheet happens to be mounted.
 */
export function useProspectDemoPump(enabled: boolean) {
  const list = useServerFn(listProspectDemoBuilds);
  const pump = useServerFn(pumpSiteEngineQueue);
  const demos = useQuery({
    queryKey: ["jarvis", "prospect-demos"],
    queryFn: () => list(),
    refetchInterval: (query) => pollWhileActive(query.state.data),
    enabled,
  });
  const activeIds = (demos.data ?? [])
    .filter((demo) => demo.build && ACTIVE_DEMO_STATUSES.has(demo.build.status))
    .map((demo) => demo.organizationId)
    .join(",");
  useEffect(() => {
    if (!enabled || !activeIds) return;
    let stopped = false;
    const tick = async () => {
      for (const organizationId of activeIds.split(",")) {
        if (stopped) return;
        await pump({ data: { organizationId } }).catch(() => undefined);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 20_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeIds, enabled, pump]);
}
