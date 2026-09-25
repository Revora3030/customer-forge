import type { GeneratedSiteQualityAssessment } from "../../lib/generated-site-quality-evidence";
import { Button } from "@/components/ui/button";

interface GeneratedSiteQualityPanelProps {
  assessment: GeneratedSiteQualityAssessment;
  onFix?: (action: string) => void;
}

const labelize = (value: string) =>
  value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

export function GeneratedSiteQualityPanel({
  assessment,
  onFix,
}: GeneratedSiteQualityPanelProps) {
  const { result, recommendations } = assessment;
  const status = result.publishable ? "Ready to publish" : "Needs attention";

  return (
    <section aria-labelledby="site-quality-heading" className="panel p-5 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Site quality</p>
          <h2 id="site-quality-heading" className="text-xl font-semibold text-foreground">{status}</h2>
        </div>
        <output aria-label={`Overall site quality score: ${result.score.toFixed(1)} out of 5`} className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
          {result.score.toFixed(1)} / 5
        </output>
      </div>

      {result.blockedReasons.length > 0 ? (
        <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-semibold">Publish blockers</p>
          <ul className="mt-1 list-disc pl-5">
            {result.blockedReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      ) : null}

      {result.failedDimensions.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-foreground">Checks to improve</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.failedDimensions.map((dimension) => <span key={dimension} className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">{labelize(dimension)}</span>)}
          </div>
        </div>
      ) : null}

      <ol className="mt-5 space-y-3" aria-label="Recommended improvements">
        {recommendations.map((recommendation, index) => (
          <li key={`${recommendation.dimension}-${recommendation.action}`} className="flex items-start justify-between gap-3 rounded-lg bg-elevated p-3">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">{recommendation.priority}</p>
              <p className="mt-1 text-sm text-foreground">{recommendation.action}</p>
            </div>
            {onFix ? <Button type="button" size="sm" variant="signal" onClick={() => onFix(recommendation.action)} className="shrink-0">Fix</Button> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
