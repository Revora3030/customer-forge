import { useQuery } from "@tanstack/react-query";
import { getVisitorErrorFeed } from "@/lib/visitor-errors.functions";
import { VISITOR_ERROR_KIND_LABEL } from "@/lib/visitor-errors";

/** Short list of problems real visitors hit on the live site (LOV-4). Hidden when there are none. */
export function VisitorProblems({ organizationId }: { organizationId: string }) {
  const feed = useQuery({
    queryKey: ["visitor-errors", organizationId],
    queryFn: () => getVisitorErrorFeed({ data: { organizationId } }),
    staleTime: 5 * 60_000,
  });
  const groups = feed.data?.groups ?? [];
  if (groups.length === 0) return null;
  return (
    <section className="panel mt-3 p-4" aria-label="Problems visitors hit">
      <p className="eyebrow">Problems visitors hit (last 30 days)</p>
      <ul className="mt-2 space-y-2">
        {groups.slice(0, 5).map((group) => (
          <li key={`${group.kind}-${group.hash}`} className="text-[12px]">
            <span className="font-medium">{VISITOR_ERROR_KIND_LABEL[group.kind]}</span>
            <span className="text-muted-foreground">
              {" "}
              · {group.total} time{group.total === 1 ? "" : "s"}
              {group.today > 0 ? `, ${group.today} today` : ""} · {group.pagePath}
            </span>
            <p className="break-words text-muted-foreground">{group.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
