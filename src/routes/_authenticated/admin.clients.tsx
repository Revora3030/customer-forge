import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Search } from "lucide-react";
import { EmptyState, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewClientDialog } from "@/components/admin/NewClientDialog";
import { listClients } from "@/lib/admin.functions";
import { getClientHealth } from "@/lib/retention/client-health.functions";
import { HEALTH_AT_RISK, HEALTH_CRITICAL } from "@/lib/retention/health-score";
import { DOMAIN_STATES, PUBLISH_STATES } from "@/lib/readiness";
import { currency, dateShort, number } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/clients")({
  head: () => ({
    meta: [{ title: "Clients — Revora admin" },
      { name: "description", content: "Review client accounts, workspace status and setup progress." },
      { property: "og:title", content: "Clients — Revora admin" },
      { property: "og:description", content: "Review client accounts, workspace status and setup progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminClientsRoute,
});

const FILTERS = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Awaiting payment" },
  { value: "live", label: "Live" },
  { value: "setup", label: "In setup" },
  { value: "suspended", label: "Suspended" },
  { value: "at_risk", label: "At risk" },
] as const;

function AdminClientsRoute() {
  const children = useChildMatches();
  return children.length > 0 ? <Outlet /> : <AdminClients />;
}

function AdminClients() {
  const clientsFn = useServerFn(listClients);
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: ["admin", "clients"], queryFn: () => clientsFn({}), refetchInterval: 120_000 });
  const healthFn = useServerFn(getClientHealth);
  const health = useQuery({ queryKey: ["admin", "client-health"], queryFn: () => healthFn(), staleTime: 300_000 });
  const healthBy = useMemo(() => new Map((health.data ?? []).map((h) => [h.organizationId, h])), [health.data]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (clients.data ?? []).filter((client) => {
      const matches =
        !term ||
        [client.name, client.owner_name, client.owner_email, client.city, client.custom_domain]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      const paid = Boolean(client.setup_paid_at) && client.subscription_state === "active";
      const state =
        filter === "all"
          ? true
          : filter === "paid"
            ? paid
            : filter === "unpaid"
              ? !paid && !client.is_demo
              : filter === "live"
                ? client.publish_state === "published" && !client.is_suspended
                : filter === "setup"
                  ? client.publish_state !== "published" && !client.is_suspended
                  : filter === "at_risk"
                    ? (healthBy.get(client.id)?.score ?? 100) < HEALTH_AT_RISK
                    : client.is_suspended;
      return matches && state;
    });
  }, [clients.data, search, filter, healthBy]);

  return (
    <div className="product-page">
      <SectionHeading
        eyebrow="Clients"
        title="Client businesses"
        action={
          <Button variant="signal" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 size-3.5" /> Create new client
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search business, owner, city or domain"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? "secondary" : "ghost"}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {clients.isLoading ? (
        <LoadingRows rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title={clients.data?.length ? "No clients match that" : "No client businesses yet"}
          description={
            clients.data?.length
              ? "Try a different search or filter."
              : "Create a client and the platform provisions their isolated workspace in one step — no rebuilding."
          }
          action={
            <Button variant="signal" size="sm" onClick={() => setCreating(true)}>
              Create new client
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((client) => (
            <Panel key={client.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-display text-[14px] font-semibold">{client.name}</p>
                  {client.is_suspended ? <Pill tone="danger">Suspended</Pill> : null}
                  {client.is_demo ? <Pill tone="info">Demo</Pill> : null}
                </div>
                <p className="mt-1 truncate text-[12px] text-muted-foreground">
                  {client.owner_name ?? "No owner name"} · {client.owner_email ?? "no email"} ·{" "}
                  {client.city ?? "no city"}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {client.custom_domain ?? `/s/${client.slug}`} · joined{" "}
                  {dateShort(client.created_at)} · {number(client.leads)} leads ·{" "}
                  {number(client.appointments)} bookings
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {client.setup_paid_at
                    ? `Setup paid ${dateShort(client.setup_paid_at)}`
                    : "Setup unpaid"}{" "}
                  · {currency(client.paid_total)} collected
                  {client.current_period_end
                    ? ` · renews ${dateShort(client.current_period_end)}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill
                  tone={
                    client.setup_paid_at && client.subscription_state === "active"
                      ? "signal"
                      : client.subscription_state === "past_due"
                        ? "danger"
                        : "attention"
                  }
                >
                  {client.is_demo
                    ? "Demo — not a client"
                    : client.setup_paid_at && client.subscription_state === "active"
                    ? "Paid & active"
                    : client.subscription_state
                      ? `Subscription ${client.subscription_state}`
                      : "Awaiting payment"}
                </Pill>
                <HealthPill health={healthBy.get(client.id)} />
                <Pill tone={client.readinessScore >= 90 ? "signal" : "attention"}>
                  {client.readinessScore}% ready
                </Pill>
                <Pill tone={PUBLISH_STATES[client.publish_state]?.tone ?? "neutral"}>
                  {PUBLISH_STATES[client.publish_state]?.label ?? client.publish_state}
                </Pill>

                <Pill tone={DOMAIN_STATES[client.domain_status]?.tone ?? "neutral"}>
                  {DOMAIN_STATES[client.domain_status]?.label ?? client.domain_status}
                </Pill>
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/clients/$orgId" params={{ orgId: client.id }}>
                    Manage
                  </Link>
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <NewClientDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["admin"] });
        }}
      />
    </div>
  );
}

type HealthView = { score: number | null; reasons: string[]; unknown: string[] };

/** Customer health score (Retention Autopilot); hover for the reasons it lost points. */
function HealthPill({ health }: { health: HealthView | undefined }) {
  if (!health || health.score === null) return null;
  const tone = health.score < HEALTH_CRITICAL ? "danger" : health.score < HEALTH_AT_RISK ? "attention" : "signal";
  const title = [
    ...health.reasons,
    health.unknown.length ? `Not scored (no record): ${health.unknown.join(", ")}.` : "",
  ].filter(Boolean).join("\n");
  return (
    <span title={title || "No issues found"}>
      <Pill tone={tone}>Health {health.score}</Pill>
    </span>
  );
}
