import { AlertCircle, Check, Target, Users } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { INTENT_META, type BuildReport, type SiteBrief } from "@/lib/site-brief";
import { dateShort } from "@/lib/format";

/**
 * What Revora understood about the business before it built anything. Every
 * line comes from the information the owner supplied — missing facts are listed
 * as requests, never guessed.
 */
export function BusinessBriefPanel({ brief }: { brief: SiteBrief | null }) {
  if (!brief) return null;

  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="What Revora understood" title="Your business, in Revora's words" />
      <p className="mt-2 max-w-2xl text-[13px] text-muted-foreground">{brief.positioning}</p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-medium">
            <Users className="size-3.5 text-primary" aria-hidden="true" /> Who your website talks to
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{brief.buyer}</p>
          {brief.buyerGoal ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              They want to: {brief.buyerGoal}
            </p>
          ) : null}
        </div>
        <div>
          <p className="flex items-center gap-2 text-[12px] font-medium">
            <Target className="size-3.5 text-primary" aria-hidden="true" /> Main action on the page
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {brief.primaryAction}
            {brief.secondaryAction ? ` — with “${brief.secondaryAction}” as the backup.` : ""}
          </p>
        </div>
      </div>

      {brief.intents.length ? (
        <div className="mt-5">
          <p className="text-[12px] font-medium">Visitor types your site handles</p>
          <ul className="mt-2 grid gap-1.5">
            {brief.intents.map((intent) => (
              <li key={intent} className="text-[12px] text-muted-foreground">
                <span className="text-foreground">{INTENT_META[intent].label}</span> —{" "}
                {INTENT_META[intent].path}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.objections.length ? (
        <div className="mt-5">
          <p className="text-[12px] font-medium">
            Questions the page answers before someone enquires
          </p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {brief.objections.map((objection) => (
              <li key={objection} className="flex gap-2 text-[12px] text-muted-foreground">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {objection}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {brief.missingFacts.length ? (
        <div className="mt-5 rounded-md border border-accent/30 bg-accent/10 p-3.5">
          <p className="flex items-center gap-2 text-[12px] font-medium text-accent">
            <AlertCircle className="size-3.5" aria-hidden="true" /> Give Revora these and the site
            gets stronger
          </p>
          <ul className="mt-2 grid gap-1">
            {brief.missingFacts.map((fact) => (
              <li key={fact} className="text-[12px] text-accent">
                {fact}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] text-muted-foreground">
        {brief.source === "rules"
          ? "Prepared from your information without AI analysis."
          : "Prepared by Revora's business analysis, then checked against your information only."}
      </p>
    </Panel>
  );
}

/** The plain-language build report shown after a generation run. */
export function BuildReportPanel({ report }: { report: BuildReport | null }) {
  if (!report) return null;

  const rows: { label: string; value: string; ok: boolean }[] = [
    { label: "Pages created", value: String(report.pages), ok: report.pages > 0 },
    { label: "Sections created", value: String(report.sections), ok: report.sections > 0 },
    { label: "Services added", value: String(report.services), ok: report.services > 0 },
    { label: "FAQs written", value: String(report.faqs), ok: report.faqs > 0 },
    { label: "Photos in use", value: String(report.photos), ok: report.photos > 0 },
    { label: "Quote forms live", value: String(report.leadForms), ok: report.leadForms > 0 },
    {
      label: "Bookable services",
      value: String(report.bookableServices),
      ok: report.bookableServices > 0,
    },
    {
      label: "Search settings",
      value: report.seoConfigured ? "Configured" : "Incomplete",
      ok: report.seoConfigured,
    },
    {
      label: "Leads go to your CRM",
      value: report.crmConnected ? "Connected" : "Not connected",
      ok: report.crmConnected,
    },
    {
      label: "Visitor tracking",
      value: report.analyticsConfigured ? "Connected" : "Not connected",
      ok: report.analyticsConfigured,
    },
  ];

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading eyebrow="Build report" title="What Revora built for you" />
        <Pill tone="neutral">Built {dateShort(report.builtAt)}</Pill>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 rounded-md bg-elevated px-3 py-2"
          >
            <dt className="text-[12px] text-muted-foreground">{row.label}</dt>
            <dd className={row.ok ? "text-[12px]" : "text-[12px] text-accent"}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {report.checks.length ? (
        <div className="mt-5">
          <p className="text-[12px] font-medium">Lead capture and booking checks</p>
          <ul className="mt-2 grid gap-1.5">
            {report.checks.map((check) => (
              <li
                key={check.key}
                className="flex flex-wrap items-start gap-2 rounded-md bg-elevated px-3 py-2 text-[12px]"
              >
                <span
                  className={
                    check.ok
                      ? "text-primary"
                      : check.severity === "blocker"
                        ? "text-accent"
                        : "text-muted-foreground"
                  }
                >
                  {check.ok ? "\u2713" : check.severity === "blocker" ? "\u2715" : "!"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{check.label}</span>
                  <span className="block text-muted-foreground">{check.detail}</span>
                  {!check.ok && check.fix ? (
                    <span className="mt-0.5 block">{check.fix}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.attention.length ? (
        <div className="mt-4">
          <p className="text-[12px] font-medium">Needs your attention</p>
          <ul className="mt-2 grid gap-1.5">
            {report.attention.map((item) => (
              <li key={item} className="text-[12px] text-muted-foreground">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-muted-foreground">
          Nothing outstanding from this build.
        </p>
      )}
    </Panel>
  );
}
