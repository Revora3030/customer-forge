import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  capacityWaitDetail,
  capacityWaitHeadline,
  capacityWaitState,
  type CapacityWaitState,
} from "@/lib/builder/capacity-wait";

/**
 * "Waiting for AI capacity — resumes about HH:MM" for a build the server
 * parked through its capacity deferral. Renders nothing otherwise. Times are
 * formatted after hydration so the viewer's local time zone is used.
 */
export function CapacityWaitNotice({
  job,
  state,
  compact = false,
}: {
  job?: Parameters<typeof capacityWaitState>[0];
  state?: CapacityWaitState | null;
  compact?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (now == null) return null;
  const wait = state ?? capacityWaitState(job, now);
  if (!wait || Date.parse(wait.resumesAt) <= now) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12.5px]">
      <Clock className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{capacityWaitHeadline(wait)}</p>
        {compact ? null : <p className="mt-0.5 break-words text-muted-foreground">{capacityWaitDetail(wait)}</p>}
      </div>
    </div>
  );
}
