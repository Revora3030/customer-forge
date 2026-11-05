import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import {
  useAnalytics,
  useAppointments,
  useLeads,
  useQuoteBuilder,
  useServices,
  useWebsiteSettings,
} from "@/lib/queries";
import { readSeo } from "@/lib/site-seo";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { MIN_VIEWS, optimizerActions, type PageInsight } from "@/lib/growth-optimizer";

const DAY = 86_400_000;
const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const VERDICT: Record<
  PageInsight["verdict"],
  { label: string; tone: "signal" | "attention" | "neutral" | "info" }
> = {
  strong: { label: "Converting", tone: "signal" },
  average: { label: "Average", tone: "info" },
  weak: { label: "Low", tone: "attention" },
  insufficient: { label: "Too few visits", tone: "neutral" },
};

/**
 * Post-launch optimisation. Reads what the published site actually recorded and
 * recommends specific changes to the call to action, the form fields and where
 * the quote/booking block sits. No recommendation is made without the numbers
 * to support it.
 */
export function ConversionOptimizer({ organizationId }: { organizationId: string | undefined }) {
  const [days, setDays] = useState(30);
  const { data: events } = useAnalytics(organizationId, days);
  const { data: leads } = useLeads(organizationId);
  const { data: appointments } = useAppointments(organizationId);
  const { data: settings } = useWebsiteSettings(organizationId);
  const { data: services } = useServices(organizationId);
  const { data: quote } = useQuoteBuilder(organizationId);
  const { data: content } = useWebsiteContent(organizationId);

  const seo = readSeo(settings?.seo);
  // The home page's first three visible sections — is a capture block already there?
  const home = (content ?? []).find((page) => page.kind === "home") ?? (content ?? [])[0];
  const captureAboveFold = (home?.sections ?? [])
    .filter((section) => section.is_visible)
    .slice(0, 3)
    .some((section) => ["quote", "booking", "contact", "lead_form", "cta"].includes(section.kind));

  const model = useMemo(() => {
    const since = Date.now() - days * DAY;
    return optimizerActions({
      events: (events ?? []).map((e) => ({
        event_type: e.event_type,
        path: e.path ?? null,
        device: e.device ?? null,
        created_at: e.created_at,
      })),
      leads: (leads ?? []).filter((l) => new Date(l.created_at).getTime() >= since).length,
      bookings: (appointments ?? []).filter(
        (a) => new Date(a.starts_at).getTime() >= since && a.status !== "cancelled",
      ).length,
      primaryCtaLabel: seo.primary_cta_label ?? null,
      quoteFormQuestions: quote?.questions?.length ?? 0,
      bookableServices: (services ?? []).filter((s) => (s as { bookable?: boolean }).bookable)
        .length,
      captureAboveFold,
    });
  }, [events, leads, appointments, days, seo.primary_cta_label, quote, services, captureAboveFold]);

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionHeading
              eyebrow="Post-launch optimisation"
              title="What to change next, based on real visits"
            />
            <p className="mt-2 max-w-xl text-[13px] text-muted-foreground">
              Revora watches how visitors behave on your live site and only recommends a change when
              the numbers support it. Pages with fewer than {MIN_VIEWS} visits are left alone.
            </p>
          </div>
          <div className="flex gap-1.5">
            {WINDOWS.map((window) => (
              <Button
                key={window.days}
                size="sm"
                variant={days === window.days ? "signal" : "outline"}
                onClick={() => setDays(window.days)}
              >
                {window.label}
              </Button>
            ))}
          </div>
        </div>

        <ul className="mt-5 grid gap-3">
          {model.actions.map((action) => (
            <li key={action.key} className="rounded-md border border-border/60 bg-elevated p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-center gap-2 text-[13px] font-medium">
                  {action.impact === "high" ? (
                    <TrendingDown className="size-3.5 text-accent" aria-hidden="true" />
                  ) : action.impact === "low" ? (
                    <TrendingUp className="size-3.5 text-primary" aria-hidden="true" />
                  ) : (
                    <Gauge className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                  {action.title}
                </p>
                <Pill
                  tone={
                    action.impact === "high"
                      ? "attention"
                      : action.impact === "low"
                        ? "signal"
                        : "info"
                  }
                >
                  {action.impact === "high"
                    ? "Fix first"
                    : action.impact === "low"
                      ? "Healthy"
                      : "Worth doing"}
                </Pill>
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">{action.evidence}</p>
              <p className="mt-1.5 text-[13px]">{action.action}</p>
              {action.to ? (
                <Button asChild size="sm" variant="ghost" className="mt-2 -ml-2">
                  <Link to={action.to}>
                    Go there <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      {model.pages.length ? (
        <Panel className="p-5">
          <SectionHeading eyebrow="By page" title="Where visitors act — and where they don't" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 font-normal">Page</th>
                  <th className="pb-2 font-normal">Visits</th>
                  <th className="pb-2 font-normal">Actions</th>
                  <th className="pb-2 font-normal">Rate</th>
                  <th className="pb-2 font-normal">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {model.pages.slice(0, 12).map((page) => (
                  <tr key={page.path} className="border-t border-border/50">
                    <td className="py-2 pr-3 font-mono text-xs">{page.path}</td>
                    <td className="py-2 pr-3">{page.views}</td>
                    <td className="py-2 pr-3">{page.actions}</td>
                    <td className="py-2 pr-3">{(page.rate * 100).toFixed(1)}%</td>
                    <td className="py-2">
                      <Pill tone={VERDICT[page.verdict].tone}>{VERDICT[page.verdict].label}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
