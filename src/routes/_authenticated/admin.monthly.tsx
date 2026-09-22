import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, BarChart3, Minus } from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  KeyLabel,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { getMonthlyBusinessReport } from "@/lib/admin.functions";
import { conversionRate, growth, type MonthTotals } from "@/lib/monthly-report";
import { currency, number } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/monthly")({
  head: () => ({
    meta: [
      { title: "Monthly business report — Revora" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MonthlyReport,
});

const RANGES = [
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
];

function Delta({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined) return null;
  const change = growth(current, previous);
  if (change === null) return null;
  const flat = Math.abs(change) < 0.5;
  const up = change > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 text-[11px]",
        flat ? "text-muted-foreground" : up ? "text-primary" : "text-destructive",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {flat ? "flat" : `${Math.abs(change).toFixed(0)}%`}
    </span>
  );
}

/** Bar for one month, scaled against the biggest month in the window. */
function MonthBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
      <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

function MonthlyReport() {
  const reportFn = useServerFn(getMonthlyBusinessReport);
  const [months, setMonths] = useState(6);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ["admin", "monthly", months],
    queryFn: () => reportFn({ data: { months } }),
  });

  const data = report.data;
  const monthRows: MonthTotals[] = data?.months ?? [];
  const current = monthRows[0];
  const previous = monthRows[1];
  const maxRevenue = Math.max(1, ...monthRows.map((m) => m.revenue));
  const selected = openMonth ?? current?.month ?? null;
  const workspaceRows = (data?.rows ?? []).filter((row) => row.month === selected);
  const workspaces = data?.workspaces ?? {};

  const windowRevenue = monthRows.reduce((sum, m) => sum + m.revenue, 0);
  const windowLeads = monthRows.reduce((sum, m) => sum + m.leads, 0);

  return (
    <div className="product-page">
      <SectionHeading
        eyebrow="Business"
        title="Monthly report — every workspace, real numbers"
        description="Revenue is money actually collected (refunds removed). Leads, bookings and traffic come from each client's own workspace, kept separate."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/clients">Clients</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Report range">
        {RANGES.map((range) => (
          <Button
            key={range.months}
            size="sm"
            variant={months === range.months ? "signal" : "outline"}
            aria-pressed={months === range.months}
            onClick={() => {
              setMonths(range.months);
              setOpenMonth(null);
            }}
          >
            {range.label}
          </Button>
        ))}
      </div>

      {report.isError ? (
        <ErrorNote
          message={
            report.error instanceof Error ? report.error.message : "Could not load the report."
          }
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={current ? `Revenue · ${current.label}` : "Revenue this month"}
          value={currency(current?.revenue ?? 0)}
          hint={
            current?.refunded
              ? `${currency(current.refunded)} refunded · ${currency(windowRevenue)} in range`
              : `${currency(windowRevenue)} across ${monthRows.length} months`
          }
          tone="signal"
          {...(current && previous ? {} : { badge: "Live" })}
        />
        <MetricCard
          label="Leads this month"
          value={number(current?.leads ?? 0)}
          hint={`${number(windowLeads)} in range · ${
            current && conversionRate(current) !== null
              ? `${conversionRate(current)!.toFixed(1)}% of visits`
              : "no traffic yet"
          }`}
          tone="attention"
        />
        <MetricCard
          label="Bookings this month"
          value={number(current?.bookings ?? 0)}
          hint={`${number(current?.visits ?? 0)} website visits`}
          tone="info"
        />
        <MetricCard
          label="Workspaces earning"
          value={number(current?.workspaces ?? 0)}
          hint={`${number(current?.visitors ?? 0)} unique sessions this month (one browsing visit each)`}
        />
      </div>

      <Panel className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="eyebrow flex items-center gap-1.5">
            <BarChart3 className="size-3.5 text-primary" aria-hidden />
            Month by month
          </p>
          <KeyLabel>Tap a month</KeyLabel>
        </div>

        {report.isLoading ? (
          <div className="p-4">
            <LoadingRows rows={6} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {monthRows.map((month, index) => {
              const isOpen = month.month === selected;
              return (
                <li key={month.month}>
                  <button
                    type="button"
                    onClick={() => setOpenMonth(month.month)}
                    aria-pressed={isOpen}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-elevated/60",
                      isOpen ? "bg-elevated/50" : null,
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-display text-[15px] font-semibold">{month.label}</span>
                      <span className="tnum flex items-center gap-2 text-[13px]">
                        {currency(month.revenue)}
                        <Delta current={month.revenue} previous={monthRows[index + 1]?.revenue} />
                      </span>
                    </div>
                    <div className="mt-2">
                      <MonthBar value={month.revenue} max={maxRevenue} />
                    </div>
                    <p className="tnum mt-2 text-[11px] text-muted-foreground">
                      {number(month.leads)} leads · {number(month.bookings)} bookings ·{" "}
                      {number(month.visits)} visits · {number(month.workspaces)} workspaces
                      {month.refunded ? ` · ${currency(month.refunded)} refunded` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="eyebrow">
            Workspaces{selected ? ` · ${monthRows.find((m) => m.month === selected)?.label}` : ""}
          </p>
          <KeyLabel>{number(workspaceRows.length)} active</KeyLabel>
        </div>

        {report.isLoading ? (
          <div className="p-4">
            <LoadingRows rows={4} />
          </div>
        ) : workspaceRows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No workspace activity in this month"
              description="Revenue, leads, bookings and traffic all show up here the moment a client's site starts working."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {workspaceRows.map((row) => {
              const workspace = workspaces[row.organizationId];
              return (
                <li key={`${row.month}-${row.organizationId}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">
                        {workspace?.name ?? "Unknown workspace"}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {workspace?.industry ? <span>{workspace.industry}</span> : null}
                        {workspace?.status ? <Pill tone="info">{workspace.status}</Pill> : null}
                        {workspace?.suspended ? <Pill tone="danger">suspended</Pill> : null}
                        {workspace?.demo ? <Pill>demo</Pill> : null}
                      </p>
                    </div>
                    <p className="tnum shrink-0 text-[14px] font-semibold text-primary">
                      {currency(row.revenue)}
                    </p>
                  </div>
                  <dl className="tnum mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Leads</dt>
                      <dd className="font-medium">{number(row.leads)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Bookings</dt>
                      <dd className="font-medium">{number(row.bookings)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Visits</dt>
                      <dd className="font-medium">{number(row.visits)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Unique sessions</dt>
                      <dd className="font-medium">{number(row.visitors)}</dd>
                    </div>
                  </dl>
                  {row.refunded ? (
                    <p className="mt-1.5 text-[11px] text-destructive">
                      {currency(row.refunded)} refunded
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {data?.generatedAt ? (
        <p className="text-[11px] text-muted-foreground">
          Live data from your workspaces, read at {new Date(data.generatedAt).toLocaleString()}.
        </p>
      ) : null}
    </div>
  );
}
