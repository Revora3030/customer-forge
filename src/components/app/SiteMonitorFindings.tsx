import { useQuery } from "@tanstack/react-query";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { getSiteMonitorFindings } from "@/lib/site-monitor.functions";

/**
 * Problems the live-site monitor (LOV-3) found on the published site, in plain
 * sentences. Hidden when there are none. The alert email links here
 * (`?finding=<check>#site-monitor`) until LOV-5's shared fix card lands.
 */
export function SiteMonitorFindings({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: ["site-monitor-findings", organizationId],
    queryFn: () => getSiteMonitorFindings({ data: { organizationId } }),
    staleTime: 5 * 60_000,
  });
  const findings = query.data?.findings ?? [];
  if (query.isError && !query.data) {
    return (
      <div id="site-monitor" className="mt-3">
        <QueryErrorNotice
          title="We couldn't check your live site just now."
          retry={() => query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }
  if (findings.length === 0) return null;
  return (
    <section id="site-monitor" className="panel mt-3 p-4" aria-label="Problems on your live site">
      <p className="eyebrow">Problems on your live site</p>
      <ul className="mt-2 space-y-2">
        {findings.map((finding) => (
          <li key={finding.id} className="text-[12px]">
            <span className="font-medium">{finding.title}</span>
            <p className="break-words text-muted-foreground">{finding.detail}</p>
            <p className="text-muted-foreground">First noticed {new Date(finding.firstSeenAt).toLocaleString()}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
