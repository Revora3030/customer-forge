import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Building2 } from "lucide-react";
import {
  EmptyState,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { getPlatformActivity, getPlatformMetrics, listClients } from "@/lib/admin.functions";
import { getConversionReport } from "@/lib/conversion.functions";
import { DOMAIN_STATES, PUBLISH_STATES } from "@/lib/readiness";
import { currency, dateShort, number } from "@/lib/format";
import { REVORA } from "@/lib/brand";

const ACTIVITY_LABELS: Record<string, string> = {
  signup: "New business",
  lead: "Enquiry",
  booking: "Booking",
  payment: "Payment",
  website: "Website",
};

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [{ title: "Admin — Revora" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const metricsFn = useServerFn(getPlatformMetrics);
  const conversionsFn = useServerFn(getConversionReport);
  const clientsFn = useServerFn(listClients);
  const metrics = useQuery({ queryKey: ["admin", "metrics"], queryFn: () => metricsFn({}) });
  const clients = useQuery({ queryKey: ["admin", "clients"], queryFn: () => clientsFn({}) });
  const activityFn = useServerFn(getPlatformActivity);
  const activity = useQuery({
    queryKey: ["admin", "activity"],
    queryFn: () => activityFn({ data: { limit: 30 } }),
    refetchInterval: 60_000,
  });
  const conversions = useQuery({
    queryKey: ["admin", "conversions", 30],
    queryFn: () => conversionsFn({ data: { days: 30 } }),
  });

  return (
    <div className="product-page">
      <SectionHeading
        eyebrow="Platform"
        title="Every client business, one platform"
        action={
          <Button asChild variant="signal" size="sm">
            <Link to="/admin/clients">Create new client</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Client businesses"
          value={number(metrics.data?.clients ?? 0)}
          tone="signal"
        />
        <MetricCard
          label="Live websites"
          value={number(metrics.data?.published ?? 0)}
          hint={`${metrics.data?.domainsLive ?? 0} on their own domain`}
          tone="info"
        />
        <MetricCard
          label="Leads (30 days)"
          value={number(metrics.data?.leads30d ?? 0)}
          hint={`${metrics.data?.bookings30d ?? 0} bookings`}
          tone="attention"
        />
        <MetricCard
          label="Recurring revenue"
          value={currency(metrics.data?.mrr ?? 0)}
          hint={`${metrics.data?.trialing ?? 0} on trial · ${metrics.data?.suspended ?? 0} suspended`}
        />
      </div>

      <Panel className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="eyebrow">Live activity</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Real recorded events from client businesses over the last{" "}
              {activity.data?.windowDays ?? 14} days. Revora's own internal pages are never
              included.
            </p>
          </div>
          <Link to="/admin/analytics" className="text-[12px] text-primary hover:underline">
            Public traffic
          </Link>
        </div>
        {activity.isLoading ? (
          <div className="p-4">
            <LoadingRows rows={4} />
          </div>
        ) : (activity.data?.items.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nothing has happened yet"
              description="New businesses, enquiries, bookings, payments and website changes appear here the moment they are recorded."
            />
          </div>
        ) : (
          <>
            <p className="px-4 pt-3 text-[11px] text-muted-foreground">
              {number(activity.data?.counts.signups ?? 0)} new businesses ·{" "}
              {number(activity.data?.counts.leads ?? 0)} enquiries ·{" "}
              {number(activity.data?.counts.bookings ?? 0)} bookings ·{" "}
              {number(activity.data?.counts.payments ?? 0)} payments ·{" "}
              {number(activity.data?.counts.websiteChanges ?? 0)} website changes
            </p>
            <ul className="mt-2 divide-y divide-border">
              {(activity.data?.items ?? []).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px]">{item.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {item.business ?? "Unknown business"} · {dateShort(item.at)}
                    </p>
                  </div>
                  <Pill tone="neutral">{ACTIVITY_LABELS[item.kind]}</Pill>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="eyebrow">Newest clients</p>
          <Link to="/admin/clients" className="text-[12px] text-primary hover:underline">
            All clients
          </Link>
        </div>
        {clients.isLoading ? (
          <div className="p-4">
            <LoadingRows rows={3} />
          </div>
        ) : (clients.data ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Building2 className="size-5" />}
              title="No client businesses yet"
              description="Create your first client and the platform provisions their workspace, website and CRM instantly."
              action={
                <Button asChild variant="signal" size="sm">
                  <Link to="/admin/clients">Create new client</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(clients.data ?? []).slice(0, 8).map((client) => (
              <li key={client.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{client.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {client.city ?? "No city"} · added {dateShort(client.created_at)} ·{" "}
                    {number(client.leads)} leads
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pill tone={PUBLISH_STATES[client.publish_state]?.tone ?? "neutral"}>
                    {PUBLISH_STATES[client.publish_state]?.label ?? client.publish_state}
                  </Pill>
                  <Pill tone={DOMAIN_STATES[client.domain_status]?.tone ?? "neutral"}>
                    {DOMAIN_STATES[client.domain_status]?.label ?? client.domain_status}
                  </Pill>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/admin/clients/$orgId" params={{ orgId: client.id }}>
                      Open <ArrowUpRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel className="p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-display text-[13px] font-semibold tracking-[0.12em] uppercase">
            Revora company information
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Platform identity used across Revora marketing, CTAs and system emails. Client
            businesses keep their own contact details in their workspace settings.
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-3 px-4 py-4 sm:grid-cols-2">
          {[
            ["Company name", REVORA.name],
            ["Founder", REVORA.founder.name],
            ["Business email", REVORA.email],
            ["Business phone", REVORA.phone],
            ["Brand tagline", REVORA.tagline],
            ["Primary message", REVORA.primaryMessage],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {label}
              </dt>
              <dd className="mt-1 text-[13px]">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-3 border-t border-border px-4 py-3">
          <span className="grid size-8 place-items-center rounded-full bg-primary/15 font-display text-[12px] font-semibold text-primary">
            A
          </span>
          <div>
            <p className="text-[13px] font-medium">{REVORA.founder.name}</p>
            <p className="text-[11px] text-muted-foreground">Founder profile · platform owner</p>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-[15px] font-semibold">Marketing funnel — last 30 days</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Landing views through paid checkout, grouped by industry page or entry path.
          </p>
        </div>
        {conversions.isLoading ? (
          <LoadingRows rows={3} />
        ) : (conversions.data?.report.length ?? 0) === 0 ? (
          <EmptyState
            title="No tracked visits yet"
            description="Publish the industry landing pages and share the links to start collecting funnel data."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Views</th>
                  <th className="px-4 py-2">Signups started</th>
                  <th className="px-4 py-2">Signups completed</th>
                  <th className="px-4 py-2">Checkouts started</th>
                  <th className="px-4 py-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {conversions.data?.report.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="px-4 py-2 capitalize">{row.label}</td>
                    <td className="px-4 py-2">{number(row.landingViews)}</td>
                    <td className="px-4 py-2">{number(row.signupsStarted)}</td>
                    <td className="px-4 py-2">{number(row.signupsCompleted)}</td>
                    <td className="px-4 py-2">{number(row.checkoutsStarted)}</td>
                    <td className="px-4 py-2 font-semibold text-primary">
                      {number(row.checkoutsCompleted)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
