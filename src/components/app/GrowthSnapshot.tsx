/**
 * Dashboard view of the Growth Command Center: score, grade and the top three
 * things to improve. Display only: no fixes run from here; every action
 * opens the page where the owner makes the change.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useGrowthAudit } from "@/lib/growth-audit-input.hooks";

const TONE = {
  critical: "danger",
  warning: "attention",
  opportunity: "info",
  healthy: "signal",
} as const;

export function GrowthSnapshot({
  organizationId,
  businessName,
}: {
  organizationId: string | undefined;
  businessName: string | null | undefined;
}) {
  const { audit, isLoading, isError } = useGrowthAudit(organizationId, businessName);
  if (!organizationId || isLoading || isError) return null;
  const top = audit.issues.slice(0, 3);

  return (
    <Panel className="p-5" data-testid="growth-snapshot">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading eyebrow="Growth" title="Growth score" />
        <p className="text-right">
          <span className="text-2xl font-semibold tabular-nums">{audit.score}</span>
          <span className="text-[12px] text-muted-foreground">/100 · {audit.grade}</span>
        </p>
      </div>
      {top.length ? (
        <ul className="mt-3 divide-y divide-border">
          {top.map((finding) => (
            <li key={finding.key} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-medium">{finding.title}</p>
                  <Pill tone={TONE[finding.severity]}>
                    {finding.severity === "critical" ? "Needs attention" : "Next"}
                  </Pill>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">{finding.evidence}</p>
              </div>
              {finding.to ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={finding.to}>
                    Open <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12.5px] text-muted-foreground">Nothing to fix right now.</p>
      )}
      <div className="mt-3">
        <Button asChild size="sm" variant="ghost">
          <Link to="/app/command">
            Open the Command Center <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Panel>
  );
}
