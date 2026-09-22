import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, LifeBuoy, RefreshCw } from "lucide-react";
import {
  ErrorNote,
  LoadingRows,
  MetricCard,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  endSupportSession,
  getClientDetail,
  setClientDomain,
  setClientPublishState,
  startSupportSession,
  updateClientOrg,
  verifyClientDomain,
} from "@/lib/admin.functions";
import { usePlans } from "@/lib/queries";
import { DOMAIN_STATES, PUBLISH_STATES, readiness } from "@/lib/readiness";
import { writeSupportMode } from "@/lib/support-mode";
import { currency, dateShort, dateLong, number } from "@/lib/format";
import { Sparkline } from "@/components/demo/DemoCharts";

export const Route = createFileRoute("/_authenticated/admin/clients/$orgId")({
  head: () => ({
    meta: [
      { title: "Client workspace — Revora admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ClientDetail,
});

function ClientDetail() {
  const { orgId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detailFn = useServerFn(getClientDetail);
  const detail = useQuery({
    queryKey: ["admin", "client", orgId],
    queryFn: () => detailFn({ data: { organizationId: orgId } }),
  });

  const update = useServerFn(updateClientOrg);
  const saveDomain = useServerFn(setClientDomain);
  const verifyDomain = useServerFn(verifyClientDomain);
  const publish = useServerFn(setClientPublishState);
  const startSupport = useServerFn(startSupportSession);
  const endSupport = useServerFn(endSupportSession);
  const { data: plans } = usePlans();

  const [domain, setDomain] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const orgMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      update({ data: { organizationId: orgId, ...patch } }),
    onSuccess: async () => {
      toast.success("Client updated.");
      await refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const domainMutation = useMutation({
    mutationFn: (value: string) => saveDomain({ data: { organizationId: orgId, domain: value } }),
    onSuccess: async (result) => {
      toast.message(DOMAIN_STATES[result.status]?.label ?? result.status, {
        description: result.detail,
      });
      await refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyDomain({ data: { organizationId: orgId } }),
    onSuccess: async (result) => {
      toast.message(DOMAIN_STATES[result.status]?.label ?? result.status, {
        description: result.detail,
      });
      await refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const publishMutation = useMutation({
    mutationFn: (state: string) => publish({ data: { organizationId: orgId, state } }),
    onSuccess: async () => {
      toast.success("Publishing state updated.");
      await refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const supportMutation = useMutation({
    mutationFn: () => startSupport({ data: { organizationId: orgId, reason } }),
    onSuccess: (session) => {
      writeSupportMode({
        sessionId: session.id,
        organizationId: orgId,
        organizationName: detail.data?.org.name ?? "Client",
        reason,
        startedAt: session.started_at,
      });
      queryClient.clear();
      navigate({ to: "/app" });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  const endMutation = useMutation({
    mutationFn: (sessionId: string) => endSupport({ data: { sessionId } }),
    onSuccess: async () => {
      toast.success("Support session closed.");
      await refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  if (detail.isLoading) return <LoadingRows rows={5} />;
  if (detail.error) return <ErrorNote message={(detail.error as Error).message} />;
  const data = detail.data!;
  const org = data.org;
  const settings = data.settings;
  const profile = data.profile;

  const score = readiness({
    profile,
    settings,
    servicesCount: data.services.filter((s) => s.is_active).length,
    bookableCount: data.services.filter((s) => s.bookable && s.is_active).length,
    mediaCount: data.mediaCount,
    quoteFormCount: data.quoteFormCount,
    analyticsCount: data.analyticsCount,
  });

  const domainStatus = settings?.domain_status ?? "not_connected";
  const publishState = settings?.publish_state ?? "draft";
  const openSession = data.supportSessions.find((s) => !s.ended_at);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/clients"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All clients
        </Link>
      </div>

      <SectionHeading
        eyebrow={
          profile?.city ? `${profile.city}${profile.state ? `, ${profile.state}` : ""}` : "Client"
        }
        title={org.name}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/s/$slug" params={{ slug: org.slug }} target="_blank">
                View website <ExternalLink className="ml-1 size-3.5" />
              </Link>
            </Button>
            <Button
              size="sm"
              variant={org.is_suspended ? "signal" : "outline"}
              disabled={orgMutation.isPending}
              onClick={() => orgMutation.mutate({ is_suspended: !org.is_suspended })}
            >
              {org.is_suspended ? "Reactivate" : "Suspend"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Website readiness"
          value={`${score.score}%`}
          hint={`${score.done} of ${score.total} complete`}
          tone={score.score >= 90 ? "signal" : "attention"}
          progress={score.score}
        />
        <MetricCard label="Leads" value={number(data.leads.length)} tone="info" />
        <MetricCard label="Bookings" value={number(data.appointments.length)} />
        <MetricCard label="Site views (30d)" value={number(data.views30d)} />
      </div>

      {/* Workspace usage */}
      <Panel className="space-y-4">
        <SectionHeading
          eyebrow="Usage"
          title="What this client is actually using"
          action={<Pill tone="neutral">Last 30 days</Pill>}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Website pages" value={number(data.usage.pages.length)} />
          <MetricCard label="New leads (30d)" value={number(data.usage.leads30d)} tone="info" />
          <MetricCard
            label="Upcoming bookings"
            value={number(data.usage.bookingsUpcoming)}
            hint={`${number(data.usage.bookingsTotal)} all time`}
          />
          <MetricCard
            label="Quote requests"
            value={number(data.usage.quoteRequests30d)}
            hint={`${number(data.usage.quoteRequestsTotal)} all time`}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Site visits trend
            </p>
            <Sparkline values={data.usage.visitSeries} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Leads trend</p>
            <Sparkline values={data.usage.leadSeries} tone="info" />
          </div>
        </div>
        {data.usage.pages.length ? (
          <ul className="divide-y divide-border border-t border-border text-[13px]">
            {data.usage.pages.map((page) => (
              <li key={page.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {page.title}
                  <span className="ml-1.5 text-[11px] text-muted-foreground">/{page.slug}</span>
                </span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {number(page.sections)} sections
                  <Pill tone={page.is_visible ? "signal" : "neutral"}>
                    {page.is_visible ? "Visible" : "Hidden"}
                  </Pill>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            This client has not built any website pages yet.
          </p>
        )}
        {data.usage.versions.length ? (
          <p className="text-[11px] text-muted-foreground">
            Latest saved version v{data.usage.versions[0]!.version}
            {data.usage.versions[0]!.published_at
              ? ` · published ${dateShort(data.usage.versions[0]!.published_at)}`
              : " · not published yet"}
          </p>
        ) : null}
      </Panel>

      {/* Launch checklist */}
      <Panel className="space-y-3">
        <SectionHeading eyebrow="Deployment" title="Launch checklist" />
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {score.items.map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-[13px]">
              {item.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={item.done ? "" : "text-muted-foreground"}>
                {item.label}
                {!item.done ? <span className="block text-[11px]">{item.fix}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Publishing */}
      <Panel className="space-y-3">
        <SectionHeading
          eyebrow="Website"
          title="Publishing"
          action={
            <Pill tone={PUBLISH_STATES[publishState]?.tone ?? "neutral"}>
              {PUBLISH_STATES[publishState]?.label}
            </Pill>
          }
        />
        <p className="text-[12px] text-muted-foreground">{PUBLISH_STATES[publishState]?.help}</p>
        <div className="flex flex-wrap gap-2">
          {(["draft", "preview", "published", "unpublished"] as const).map((state) => (
            <Button
              key={state}
              size="sm"
              variant={state === publishState ? "secondary" : "outline"}
              disabled={publishMutation.isPending}
              onClick={() => publishMutation.mutate(state)}
            >
              {PUBLISH_STATES[state]?.label}
            </Button>
          ))}
        </div>
        {settings?.last_published_at ? (
          <p className="text-[11px] text-muted-foreground">
            Last published {dateLong(settings.last_published_at)}
          </p>
        ) : null}
      </Panel>

      {/* Domain */}
      <Panel className="space-y-3">
        <SectionHeading
          eyebrow="Domain"
          title="Custom domain"
          action={
            <Pill tone={DOMAIN_STATES[domainStatus]?.tone ?? "neutral"}>
              {DOMAIN_STATES[domainStatus]?.label}
            </Pill>
          }
        />
        <p className="text-[12px] text-muted-foreground">{DOMAIN_STATES[domainStatus]?.help}</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Label className="mb-1.5 block text-[12px]">Domain</Label>
            <Input
              placeholder="clientbusiness.com"
              value={domain ?? settings?.custom_domain ?? ""}
              onChange={(event) => setDomain(event.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="signal"
            disabled={domainMutation.isPending}
            onClick={() => domainMutation.mutate(domain ?? settings?.custom_domain ?? "")}
          >
            Save & check
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={verifyMutation.isPending || !settings?.custom_domain}
            onClick={() => verifyMutation.mutate()}
          >
            <RefreshCw className="mr-1 size-3.5" /> Re-check DNS
          </Button>
        </div>
        <div className="product-tile">
          <p className="eyebrow">DNS record</p>
          <p className="mt-1.5">
            CNAME <span className="text-muted-foreground">@ or www</span> →{" "}
            <code className="rounded bg-elevated px-1.5 py-0.5">{data.domainTarget}</code>
          </p>
          {settings?.domain_error ? (
            <p className="mt-2 text-destructive">{settings.domain_error}</p>
          ) : null}
          {settings?.domain_checked_at ? (
            <p className="mt-2 text-muted-foreground">
              Last checked {dateLong(settings.domain_checked_at)}
            </p>
          ) : null}
        </div>
      </Panel>

      {/* Subscription */}
      <Panel className="space-y-3">
        <SectionHeading eyebrow="Billing" title="Subscription" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-[12px]">Plan</Label>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
              value={org.plan_id ?? ""}
              onChange={(event) => orgMutation.mutate({ plan_id: event.target.value || null })}
            >
              <option value="">No plan</option>
              {(plans ?? []).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {currency(Number(plan.monthly_price))}/mo
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block text-[12px]">Status</Label>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
              value={org.subscription_status}
              onChange={(event) => orgMutation.mutate({ subscription_status: event.target.value })}
            >
              {["trialing", "active", "past_due", "canceled", "suspended"].map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        {org.trial_ends_at ? (
          <p className="text-[11px] text-muted-foreground">
            Trial ends {dateShort(org.trial_ends_at)}
          </p>
        ) : null}
      </Panel>

      {/* Support access */}
      <Panel className="space-y-3">
        <SectionHeading
          eyebrow="Support"
          title="Support access"
          action={openSession ? <Pill tone="attention">Session open</Pill> : null}
        />
        <p className="text-[12px] text-muted-foreground">
          Entering a client workspace is explicit, time-boxed to 4 hours, shown to the client with a
          banner, and recorded below. Access is never silent.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label className="mb-1.5 block text-[12px]">Reason for access</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Fixing the booking form at the owner's request (ticket #182)"
            />
          </div>
          <Button
            size="sm"
            variant="attention"
            disabled={supportMutation.isPending || reason.trim().length < 4}
            onClick={() => supportMutation.mutate()}
          >
            <LifeBuoy className="mr-1 size-3.5" /> Enter support mode
          </Button>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.supportSessions.length === 0 ? (
            <li className="px-3 py-3 text-[12px] text-muted-foreground">
              No support sessions recorded.
            </li>
          ) : (
            data.supportSessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px]">{session.admin_email ?? "Platform admin"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {session.reason} · {dateLong(session.started_at)}
                    {session.ended_at ? ` → ${dateLong(session.ended_at)}` : " · open"}
                  </p>
                </div>
                {!session.ended_at ? (
                  <Button size="sm" variant="ghost" onClick={() => endMutation.mutate(session.id)}>
                    End
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </Panel>

      {/* Handoff */}
      <Panel className="space-y-3">
        <SectionHeading eyebrow="Handoff" title="Client handoff sheet" />
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <Row
            label="Website URL"
            value={settings?.custom_domain ? `https://${settings.custom_domain}` : `/s/${org.slug}`}
          />
          <Row label="Client login" value="/auth" />
          <Row label="Domain status" value={DOMAIN_STATES[domainStatus]?.label ?? domainStatus} />
          <Row label="Publishing" value={PUBLISH_STATES[publishState]?.label ?? publishState} />
          <Row
            label="Business owner"
            value={`${profile?.owner_name ?? "—"} · ${profile?.owner_email ?? "—"}`}
          />
          <Row label="Phone" value={profile?.phone ?? "—"} />
          <Row
            label="Address"
            value={
              [profile?.address, profile?.city, profile?.state, profile?.zip]
                .filter(Boolean)
                .join(", ") || "—"
            }
          />
          <Row label="Service area" value={profile?.service_area ?? "—"} />
          <Row
            label="Subscription"
            value={`${org.plan_id ?? "No plan"} · ${org.subscription_status}`}
          />
          <Row label="Support contact" value={profile?.support_email ?? "—"} />
          <Row label="Setup completion" value={`${score.score}% (${score.done}/${score.total})`} />
          <Row label="Team members" value={number(data.team.length)} />
        </dl>
        {score.missing.length ? (
          <div className="rounded-md border border-accent/30 bg-accent/10 p-3">
            <p className="eyebrow">Before launch</p>
            <ul className="mt-1.5 space-y-1 text-[12px]">
              {score.missing.map((item) => (
                <li key={item.key}>
                  {item.label}: {item.fix}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
