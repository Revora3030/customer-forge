/**
 * Measured speed of the live business website.
 *
 * Every figure here comes from real visits recorded in visitors' browsers — not
 * from a guess about page structure. A measurement with no visits yet is shown
 * as "not measured yet" rather than scored, so the owner is never told
 * something was verified when it wasn't.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { supabase } from "@/integrations/supabase/client";
import {
  formatVital,
  summariseVitals,
  VITAL_THRESHOLDS,
  type VitalSummary,
} from "@/lib/performance/web-vitals";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

function toneFor(rating: VitalSummary["rating"]) {
  if (rating === "good") return "signal" as const;
  if (rating === "not-measured") return "muted" as const;
  return "attention" as const;
}

function wording(rating: VitalSummary["rating"]) {
  if (rating === "good") return "Good";
  if (rating === "needs-improvement") return "Could be faster";
  if (rating === "poor") return "Too slow";
  return "Not measured yet";
}

export function SitePerformance({
  organizationId,
  days = 30,
}: {
  organizationId: string | undefined;
  days?: number;
}) {
  const query = useQuery({
    queryKey: ["site-vitals", organizationId, days],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - days * DAY).toISOString();
      const { data, error } = await supabase
        .from("site_vitals")
        .select("metric, value, created_at")
        .eq("organization_id", organizationId!)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = query.data ?? [];
  const summary = React.useMemo(() => summariseVitals(rows), [rows]);
  const visits = rows.filter((row) => row.metric === "lcp").length;

  return (
    <Panel className="space-y-4">
      <SectionHeading
        eyebrow="Measured"
        title="Real website speed"
        description={
          visits > 0
            ? `From ${visits} recorded visit${visits === 1 ? "" : "s"} in the last ${days} days.`
            : "Recorded automatically as people visit your published website."
        }
      />

      {query.isLoading ? (
        <p className="text-[13px] text-muted-foreground">Reading your measurements…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No visits measured yet. As soon as people open your published website, their real
          experience is recorded here — nothing is estimated.
        </p>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {summary.map((row) => (
            <li
              key={row.metric}
              className="rounded-xl border border-border bg-card/60 px-3.5 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-medium">{row.label}</p>
                <Pill tone={toneFor(row.rating)}>{wording(row.rating)}</Pill>
              </div>
              <p
                className={cn(
                  "mt-1.5 font-display text-[20px] font-semibold",
                  row.rating === "not-measured" && "text-muted-foreground",
                )}
              >
                {row.p75 === null ? "—" : formatVital(row.metric, row.p75)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {row.samples === 0
                  ? "No visits recorded"
                  : `${row.samples} visit${row.samples === 1 ? "" : "s"} · good is under ${formatVital(
                      row.metric,
                      VITAL_THRESHOLDS[row.metric].good,
                    )}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
