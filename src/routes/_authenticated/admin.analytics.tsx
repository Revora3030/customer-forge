import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "@/lib/ui/notify";

import {
  EmptyState,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBuilderPublishFunnel, getTrafficReport } from "@/lib/conversion.functions";
import { getFunnelDetails, getPlatformFunnel } from "@/lib/platform-funnel.functions";
import { getPlatformSettings, setGaMeasurementId } from "@/lib/platform-settings.functions";
import { number } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({
    meta: [{ title: "Analytics — Revora admin" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminAnalytics,
});

const STAGE_TITLES: Record<string, string> = {
  visitors: "Unique visitors",
  sessions: "Unique sessions",
  accounts: "Accounts created",
  trials: "Trials started",
  active_trials: "Active trials right now",
  paid: "Paid customers",
};

function AdminAnalytics() {
  const qc = useQueryClient();
  const trafficFn = useServerFn(getTrafficReport);
  const builderFn = useServerFn(getBuilderPublishFunnel);

  const funnelFn = useServerFn(getPlatformFunnel);
  const detailsFn = useServerFn(getFunnelDetails);
  const settingsFn = useServerFn(getPlatformSettings);
  const saveFn = useServerFn(setGaMeasurementId);

  const [days, setDays] = useState(30);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [gaId, setGaId] = useState("");

  const traffic = useQuery({
    queryKey: ["admin", "traffic", days],
    queryFn: () => trafficFn({ data: { days } }),
  });
  const builder = useQuery({
    queryKey: ["admin", "builder-publish", days],
    queryFn: () => builderFn({ data: { days } }),
  });

  const funnel = useQuery({
    queryKey: ["admin", "funnel", days],
    queryFn: () => funnelFn({ data: { days } }),
  });
  const details = useQuery({
    queryKey: ["admin", "funnel-details", days],
    queryFn: () => detailsFn({ data: { days } }),
    enabled: openStage !== null,
  });
  const settings = useQuery({
    queryKey: ["admin", "platform-settings"],
    queryFn: () => settingsFn({}),
  });

  useEffect(() => {
    if (settings.data) setGaId(settings.data.gaMeasurementId ?? "");
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { measurementId: gaId } }),
    onSuccess: (result) => {
      toast.success(
        result.measurementId
          ? `Google Analytics connected (${result.measurementId}). It starts collecting on the next page load.`
          : "Google Analytics disconnected. Revora's own tracking keeps running.",
      );
      void qc.invalidateQueries({ queryKey: ["admin", "platform-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const report = traffic.data;

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Funnel"
        title="Unique visitors → unique sessions → accounts → trials → paid customers"
        description="Accounts come from real sign-ups, trials from provisioned workspaces, paid customers from verified Stripe billing. Nothing is estimated. Select a stage to see the records behind the number."
      />

      <div className="flex flex-wrap items-center gap-2">
        {[1, 7, 30, 90].map((option) => (
          <Button
            key={option}
            size="sm"
            variant={days === option ? "signal" : "outline"}
            onClick={() => setDays(option)}
          >
            {option === 1 ? "Today" : `Last ${option} days`}
          </Button>
        ))}
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Custom
          <input
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            aria-label="Custom number of days"
            value={days}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) setDays(Math.min(365, Math.max(1, Math.round(next))));
            }}
            className="h-8 w-20 rounded-md border border-border bg-background px-2 text-[13px] text-foreground"
          />
          days
        </label>
      </div>

      {funnel.isLoading ? (
        <LoadingRows rows={3} />
      ) : funnel.isError ? (
        <EmptyState
          title="Analytics unavailable"
          description="The funnel could not be read from the database. This is not zero — retry in a moment."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(funnel.data?.stages ?? []).map((stage) => (
              <button
                key={stage.key}
                type="button"
                onClick={() => setOpenStage(openStage === stage.key ? null : stage.key)}
                aria-pressed={openStage === stage.key}
                className={`rounded-xl text-left transition ${
                  openStage === stage.key ? "ring-2 ring-ring" : "hover:opacity-90"
                }`}
              >
                <MetricCard
                  label={`${stage.label} — ${stage.source === "database" ? "exact" : "measured"}`}
                  value={stage.count === null ? "Analytics unavailable" : number(stage.count)}
                  hint={
                    stage.count === null
                      ? "Query failed — this is not zero"
                      : stage.rate !== null
                        ? `${stage.rate}% ${stage.rateLabel ?? ""}`.trim()
                        : (stage.rateLabel ?? `Last ${funnel.data?.days} days`)
                  }
                  {...(stage.key === "paid" ? { tone: "signal" as const } : {})}
                />
              </button>
            ))}
          </div>

          <Panel className="space-y-3">
            <p className="font-display text-[15px] font-semibold">Conversion rates</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Visitors → Accounts", funnel.data?.rates.visitorsToAccounts, "estimate"],
                  ["Accounts → Trials", funnel.data?.rates.accountsToTrials, "exact"],
                  ["Trials → Paid", funnel.data?.rates.trialsToPaid, "exact"],
                  ["Visitors → Paid", funnel.data?.rates.visitorsToPaid, "estimate"],
                ] as const
              ).map(([label, value, kind]) => (
                <MetricCard
                  key={label}
                  label={`${label} — ${kind}`}
                  value={value === null || value === undefined ? "—" : `${value}%`}
                  hint={
                    kind === "exact"
                      ? "Both numbers come from the database"
                      : "Visitor side is browser-measured, so the real rate is likely a little lower"
                  }
                />
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Rates marked <strong className="font-semibold text-foreground">exact</strong> compare
              two numbers the server wrote itself (sign-ups, workspaces, confirmed payments). Rates
              marked <strong className="font-semibold text-foreground">estimate</strong> divide by
              visitors, which are counted in the browser — ad blockers and private windows hide some
              visits, so the true visitor number is a little higher and the true rate a little
              lower.
              {funnel.data?.convertedTrials !== null && funnel.data?.convertedTrials !== undefined
                ? ` ${funnel.data.convertedTrials} trial${funnel.data.convertedTrials === 1 ? "" : "s"} in this window turned into a paid subscription, confirmed by the payment webhook.`
                : ""}
            </p>
          </Panel>
        </>
      )}

      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-[15px] font-semibold">
            {openStage
              ? `${STAGE_TITLES[openStage] ?? "Stage"} — the records behind it`
              : "Where each number comes from"}
          </p>
          {openStage ? (
            <Button size="sm" variant="outline" onClick={() => setOpenStage(null)}>
              Close
            </Button>
          ) : null}
        </div>

        <p className="text-[12px] text-muted-foreground">
          <strong className="font-semibold text-foreground">Unique visitors</strong> counts
          browsers, each one once however often it returns, using a random ID stored in that browser
          — no names, emails, IP addresses or device fingerprints.{" "}
          <strong className="font-semibold text-foreground">Unique sessions</strong> counts separate
          browsing visits, so one visitor coming back three times is 1 visitor and 3 sessions.
          Accounts are one record per sign-in identity, trials one per workspace, paid customers one
          per active Stripe subscription — so nobody can be counted twice.
        </p>

        {!openStage ? (
          <p className="text-[12px] text-muted-foreground">
            Select any stage above to open its records.
          </p>
        ) : details.isError ? (
          <p className="text-[12px] text-muted-foreground">
            Analytics unavailable — the underlying records could not be read.
          </p>
        ) : details.isLoading ? (
          <LoadingRows rows={3} />
        ) : openStage === "visitors" || openStage === "sessions" ? (
          <ul className="divide-y divide-border text-[12px]">
            {(details.data?.traffic ?? []).slice(0, 60).map((row) => (
              <li key={row.day} className="flex items-center justify-between gap-3 py-1.5">
                <span className="font-mono text-[11px]">{row.day}</span>
                <span className="shrink-0 text-muted-foreground">
                  {number(row.visitors)} visitors · {number(row.sessions)} sessions ·{" "}
                  {number(row.views)} views
                </span>
              </li>
            ))}
            {(details.data?.traffic ?? []).length === 0 ? (
              <li className="py-1.5 text-muted-foreground">No traffic recorded in this range.</li>
            ) : null}
          </ul>
        ) : openStage === "accounts" ? (
          <ul className="divide-y divide-border text-[12px]">
            {(details.data?.accounts ?? []).slice(0, 100).map((row) => (
              <li key={row.id} className="flex justify-between gap-3 py-1.5">
                <span className="truncate font-mono text-[11px]">{row.id}</span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(row.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
              </li>
            ))}
            {(details.data?.accounts ?? []).length === 0 ? (
              <li className="py-1.5 text-muted-foreground">No accounts in this range.</li>
            ) : null}
          </ul>
        ) : openStage === "trials" || openStage === "active_trials" ? (
          <ul className="divide-y divide-border text-[12px]">
            {(details.data?.trials ?? [])
              .filter((row) => (openStage === "active_trials" ? row.active : true))
              .slice(0, 100)
              .map((row) => (
                <li key={row.organizationId} className="flex justify-between gap-3 py-1.5">
                  <span className="truncate">{row.name ?? row.organizationId}</span>
                  <span className="shrink-0 text-muted-foreground">
                    started {new Date(row.startedAt).toISOString().slice(0, 10)} · ends{" "}
                    {new Date(row.trialEndsAt).toISOString().slice(0, 10)} ·{" "}
                    {row.active ? "active" : row.status}
                  </span>
                </li>
              ))}
            {(details.data?.trials ?? []).filter((row) =>
              openStage === "active_trials" ? row.active : true,
            ).length === 0 ? (
              <li className="py-1.5 text-muted-foreground">
                {openStage === "active_trials"
                  ? "No trials are running right now."
                  : "No trials in this range."}
              </li>
            ) : null}
          </ul>
        ) : (
          <ul className="divide-y divide-border text-[12px]">
            {(details.data?.paid ?? []).slice(0, 100).map((row) => (
              <li key={row.organizationId} className="flex justify-between gap-3 py-1.5">
                <span className="truncate">{row.name ?? row.organizationId}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {row.subscriptionId ?? "—"}
                </span>
              </li>
            ))}
            {(details.data?.paid ?? []).length === 0 ? (
              <li className="py-1.5 text-muted-foreground">No paid customers yet.</li>
            ) : null}
          </ul>
        )}
      </Panel>

      <SectionHeading
        eyebrow="Builder"
        title="How many reach a live website"
        description="Counted per workspace, not per click. Opening the builder counts once per browsing visit; asking Revora for anything counts as an attempt; published means the site actually went live."
      />

      {builder.isLoading ? (
        <LoadingRows rows={2} />
      ) : builder.isError ? (
        <EmptyState
          title="Builder numbers unavailable"
          description="These could not be read from the database right now."
        />
      ) : (builder.data?.opened ?? 0) === 0 ? (
        <EmptyState
          title="No builder visits recorded yet"
          description="As soon as a workspace opens the builder, its progress through to publish appears here."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Opened the builder" value={number(builder.data?.opened ?? 0)} />
            <MetricCard
              label="Asked Revora to build"
              value={`${number(builder.data?.requested ?? 0)} (${builder.data?.requestRate ?? 0}%)`}
            />
            <MetricCard label="Went live" value={number(builder.data?.published ?? 0)} />
            <MetricCard
              label="Opened → live"
              value={`${builder.data?.publishRate ?? 0}%`}
              hint="Share of workspaces that got all the way live"
            />
          </div>

          <Panel className="space-y-3">
            <PanelHeading
              title="Where they stop"
              description="Each workspace is counted once, at the furthest step it actually reached."
            />
            <ol className="divide-y divide-border text-[13px]">
              {(builder.data?.stages ?? []).map((stage) => (
                <li
                  key={stage.key}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                >
                  <span className="min-w-0 flex-1 font-medium">{stage.label}</span>
                  <span className="tnum text-muted-foreground">
                    {number(stage.count)} ({stage.rate}%)
                  </span>
                  <span className="tnum w-full text-muted-foreground sm:w-auto">
                    {stage.droppedHere > 0
                      ? `${number(stage.droppedHere)} stopped here (${stage.dropRate}%)`
                      : "—"}
                  </span>
                  <span className="w-full text-[12px] text-muted-foreground">{stage.blurb}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel className="space-y-3">
              <PanelHeading
                title="Why publishing was refused"
                description="Recorded by the server when it declined to take a website live."
              />
              {(builder.data?.publishBlockers ?? []).length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No workspace was refused in this window.
                </p>
              ) : (
                <ul className="divide-y divide-border text-[13px]">
                  {(builder.data?.publishBlockers ?? []).map((item) => (
                    <li key={item.reason} className="flex items-baseline gap-3 py-2">
                      <span className="min-w-0 flex-1">{item.label}</span>
                      <span className="tnum text-muted-foreground">
                        {number(item.workspaces)} workspace{item.workspaces === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[12px] text-muted-foreground">
                {number(builder.data?.publishGlitches ?? 0)} workspace
                {(builder.data?.publishGlitches ?? 0) === 1 ? "" : "s"} hit a passing error and were
                offered a retry. {number(builder.data?.stuckAtPublish ?? 0)} tried to go live and
                still have not.
              </p>
            </Panel>

            <Panel className="space-y-3">
              <PanelHeading
                title="Why a build request failed"
                description="Requests Revora could not carry out on the website."
              />
              {(builder.data?.buildFailures ?? []).length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Every build request in this window was carried out.
                </p>
              ) : (
                <ul className="divide-y divide-border text-[13px]">
                  {(builder.data?.buildFailures ?? []).map((item) => (
                    <li key={item.reason} className="flex items-baseline gap-3 py-2">
                      <span className="min-w-0 flex-1">{item.label}</span>
                      <span className="tnum text-muted-foreground">
                        {number(item.workspaces)} workspace{item.workspaces === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}

      <SectionHeading
        eyebrow="Marketing traffic"
        title="Who reaches revoragrowthsystems.com"
        description="Public page views only. Your own admin and workspace screens, plus customer website previews, are never counted here — so these numbers are visitors, not you working. A unique session is one browsing visit."
      />

      {traffic.isLoading ? (
        <LoadingRows rows={3} />
      ) : traffic.isError ? (
        <EmptyState
          title="Analytics unavailable"
          description="Traffic could not be read from the database right now."
        />
      ) : !report || report.views === 0 ? (
        <EmptyState
          title="No visits recorded yet"
          description="Every public page view is counted from the moment the site is live. Share the link, run the local SEO pages, and traffic will appear here."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Page views" value={number(report.views)} />
            <MetricCard label="Unique sessions" value={number(report.sessions)} />
            <MetricCard
              label="Reached the portal"
              value={`${number(report.portalSessions)} (${report.portalRate}%)`}
            />
            <MetricCard label="Signup starts (event)" value={number(report.signupStarts)} />
            <MetricCard
              label="Returns from Stripe (event)"
              value={number(report.checkoutReturns)}
              hint="Not a payment — see paid customers above"
            />
            <MetricCard label="Session → signup start" value={`${report.signupStartRate}%`} />
          </div>

          {report.internalExcluded > 0 ? (
            <p className="text-[12px] text-muted-foreground">
              {number(report.internalExcluded)} recorded{" "}
              {report.internalExcluded === 1 ? "event was" : "events were"} left out because they
              happened on your own admin or workspace screens, or on a customer website preview.
            </p>
          ) : null}

          {report.daily.length > 1 ? (
            <Panel className="space-y-3">
              <p className="font-display text-[15px] font-semibold">Sessions per day</p>
              <div className="flex h-28 items-end gap-1">
                {report.daily.map((day) => {
                  const peak = Math.max(...report.daily.map((d) => d.sessions), 1);
                  return (
                    <div
                      key={day.day}
                      title={`${day.day} — ${day.sessions} sessions`}
                      className="min-w-[3px] flex-1 rounded-t bg-primary/70"
                      style={{ height: `${Math.max(3, (day.sessions / peak) * 100)}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{report.daily[0]?.day}</span>
                <span>{report.daily[report.daily.length - 1]?.day}</span>
              </div>
            </Panel>
          ) : null}

          <Panel className="space-y-3">
            <p className="font-display text-[15px] font-semibold">Most visited pages</p>
            <ul className="divide-y divide-border text-[12px]">
              {report.topPages.map((page) => (
                <li key={page.path} className="space-y-1 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[11px]">{page.path}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {number(page.views)} views · {number(page.sessions)} sessions ·{" "}
                      {report.views > 0 ? Math.round((page.views / report.views) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{
                        width: `${report.views > 0 ? Math.max(2, (page.views / report.views) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="space-y-3">
            <p className="font-display text-[15px] font-semibold">Where they come from</p>
            <ul className="divide-y divide-border text-[12px]">
              {report.topSources.map((source) => (
                <li key={source.source} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{source.source}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {number(source.sessions)} sessions · {number(source.signupStarts)} signup starts
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-[15px] font-semibold">Google Analytics 4</p>
          <Pill tone={settings.data?.gaMeasurementId ? "signal" : "info"}>
            {settings.data?.gaMeasurementId ? "Connected" : "Not connected"}
          </Pill>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Paste the measurement ID from your GA4 property (Admin → Data streams → Web). Until a real
          ID is saved, no Google script loads at all. Revora's own tracking above runs either way,
          so ad blockers can't hide your numbers.
        </p>
        <div className="space-y-2">
          <Label htmlFor="ga-id">Measurement ID</Label>
          <Input
            id="ga-id"
            value={gaId}
            onChange={(event) => setGaId(event.target.value)}
            placeholder="G-XXXXXXXXXX"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="signal"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">
              Open Google Analytics <ExternalLink className="ml-1 size-3.5" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </Panel>

      <Panel className="space-y-3">
        <p className="font-display text-[15px] font-semibold">Google Search Console</p>
        <p className="text-[12px] text-muted-foreground">
          {SITE_URL} is verified and its sitemap has been submitted, so Google is crawling the
          public pages. Search Console shows the queries people used to find you — impressions and
          clicks appear there within a few days of indexing.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a
              href="https://search.google.com/search-console"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Search Console <ExternalLink className="ml-1 size-3.5" aria-hidden="true" />
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={`${SITE_URL}/sitemap.xml`} target="_blank" rel="noopener noreferrer">
              View sitemap
            </a>
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/** Small title + one line of explanation above a panel's numbers. */
function PanelHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-display text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
