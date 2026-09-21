import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { CheckCircle2, Circle, ExternalLink, RefreshCw } from "lucide-react";
import { LoadingRows, MetricCard, PageHead, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/lib/use-tenant";
import {
  useAnalytics,
  useBusinessProfile,
  useServices,
  useTeam,
  useWebsiteSettings,
  useSaveWebsiteSettings,
  useQuoteBuilder,
  useSetWebsiteReviewState,
} from "@/lib/queries";
import { reviewStateMeta, revoraShareAddress } from "@/lib/website-plan";
import { saveOwnDomain } from "@/lib/domain.functions";
import { clientSiteUrl } from "@/lib/revora-address";

import { DOMAIN_STATES, PUBLISH_STATES, readiness } from "@/lib/readiness";
import { dateLong, number } from "@/lib/format";
import { canManage } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/app/launch")({
  head: () => ({
    meta: [
      { title: "Launch checklist — get your site live" },
      {
        name: "description",
        content:
          "Track website readiness, connect your domain, publish your site, and review your full business handoff sheet.",
      },
      { property: "og:title", content: "Launch checklist — get your site live" },
      {
        property: "og:description",
        content: "Website readiness, domain status, publishing controls and your handoff summary.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Launch,
});

function Launch() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const org = ws?.workspace?.organization;
  const role = ws?.workspace?.role;
  const manage = role ? canManage(role) : false;

  const { data: profile, isLoading: loadingProfile } = useBusinessProfile(orgId);
  const { data: settings } = useWebsiteSettings(orgId);
  const { data: services } = useServices(orgId);
  const { data: analytics } = useAnalytics(orgId, 30);
  const { data: team } = useTeam(orgId);
  const saveSettings = useSaveWebsiteSettings(orgId);
  const { data: quoteBuilder } = useQuoteBuilder(orgId);
  const setReviewState = useSetWebsiteReviewState(orgId);
  const domainFn = useServerFn(saveOwnDomain);
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState<string | null>(null);

  const domainMutation = useMutation({
    mutationFn: (value: string) => domainFn({ data: { organizationId: orgId!, domain: value } }),
    onSuccess: async (result) => {
      toast.message(DOMAIN_STATES[result.status]?.label ?? result.status, {
        description: result.detail,
      });
      await queryClient.invalidateQueries({ queryKey: ["website_settings"] });
    },
    onError: (error: Error) => toast.error(friendlyError(error)),
  });

  if (loadingProfile || !orgId) return <LoadingRows rows={5} />;

  const active = (services ?? []).filter((s) => s.is_active);
  const score = readiness({
    profile,
    settings,
    servicesCount: active.length,
    bookableCount: active.filter((s) => s.bookable).length,
    mediaCount: profile?.hero_image_url ? 1 : 0,
    quoteFormCount: quoteBuilder?.form ? 1 : 0,
    analyticsCount: (analytics ?? []).length,
  });

  const domainStatus = settings?.domain_status ?? "not_connected";
  const publishState = settings?.publish_state ?? "draft";
  // The live address an owner should share: their own domain once it is verified
  // and secure, otherwise the Revora share link that always works.
  const siteUrl =
    settings?.custom_domain && settings?.dns_ok && settings?.ssl_ok
      ? `https://${settings.custom_domain}`
      : (clientSiteUrl(org?.slug) ?? `/s/${org?.slug ?? ""}`);

  const reviewState = (settings?.review_state as string | undefined) ?? "onboarding";
  const reviewMeta = reviewStateMeta(reviewState);
  const approved = ["approved", "domain_setup", "publishing", "live"].includes(reviewState);

  const setPublish = (state: string) => {
    if (state === "published") {
      setReviewState.mutate({ state: "live", message: "Website live." });
    } else if (state === "unpublished") {
      setReviewState.mutate({ state: "approved", message: "Website taken offline." });
    }
    saveSettings.mutate(
      {
        publish_state: state,
        published: state === "published",
        ...(state === "published" ? { last_published_at: new Date().toISOString() } : {}),
      },
      {
        onSuccess: () => toast.success(`Website ${PUBLISH_STATES[state]?.label.toLowerCase()}.`),
        onError: (error: Error) => toast.error(friendlyError(error)),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Launch"
        title="Website readiness"
        purpose="What is left to check before your site goes live to visitors."
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/s/$slug" params={{ slug: org?.slug ?? "" }} target="_blank">
              Preview site <ExternalLink className="ml-1 size-3.5" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Website readiness"
          value={`${score.score}%`}
          hint={`${score.done} of ${score.total} steps complete`}
          tone={score.score >= 90 ? "signal" : "attention"}
          progress={score.score}
        />
        <MetricCard label="Live services" value={number(active.length)} />
        <MetricCard
          label="Publishing"
          value={PUBLISH_STATES[publishState]?.label ?? publishState}
          tone={PUBLISH_STATES[publishState]?.tone ?? "neutral"}
        />
        <MetricCard
          label="Domain"
          value={DOMAIN_STATES[domainStatus]?.label ?? domainStatus}
          tone={DOMAIN_STATES[domainStatus]?.tone ?? "neutral"}
        />
      </div>

      <Panel className="space-y-3">
        <SectionHeading eyebrow="Checklist" title="What's left before launch" />
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
                {!item.done ? (
                  <span className="block text-[11px]">
                    {item.fix}
                    {item.to ? (
                      <Link to={item.to} className="ml-1 text-primary hover:underline">
                        Fix now
                      </Link>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="space-y-3">
        <SectionHeading
          eyebrow="Publishing"
          title="Website status"
          action={
            <Pill tone={PUBLISH_STATES[publishState]?.tone ?? "neutral"}>
              {PUBLISH_STATES[publishState]?.label}
            </Pill>
          }
        />
        <p className="text-[12px] text-muted-foreground">{PUBLISH_STATES[publishState]?.help}</p>
        <div className="rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={reviewMeta.tone}>{reviewMeta.label}</Pill>
            <span className="text-[12px] text-muted-foreground">{reviewMeta.help}</span>
          </div>
          {!approved ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Approve your website on the{" "}
              <Link to="/app/website" className="text-primary hover:underline">
                Website
              </Link>{" "}
              page before publishing.
            </p>
          ) : null}
          <p className="mt-2 text-[12px] text-muted-foreground">
            Revora share link: {revoraShareAddress(org?.slug ?? "")} (available once published)
          </p>
        </div>
        {manage ? (
          <div className="flex flex-wrap gap-2">
            {(["draft", "preview", "published", "unpublished"] as const).map((state) => (
              <Button
                key={state}
                size="sm"
                variant={
                  state === publishState
                    ? "secondary"
                    : state === "published"
                      ? "signal"
                      : "outline"
                }
                disabled={saveSettings.isPending || (state === "published" && !approved)}
                onClick={() => setPublish(state)}
              >
                {PUBLISH_STATES[state]?.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Ask an owner or admin on your team to change publishing.
          </p>
        )}
        {settings?.last_published_at ? (
          <p className="text-[11px] text-muted-foreground">
            Last published {dateLong(settings.last_published_at)}
          </p>
        ) : null}
      </Panel>

      <Panel className="space-y-3">
        <SectionHeading
          eyebrow="Domain"
          title="Your web address"
          action={
            <Pill tone={DOMAIN_STATES[domainStatus]?.tone ?? "neutral"}>
              {DOMAIN_STATES[domainStatus]?.label}
            </Pill>
          }
        />
        <p className="text-[12px] text-muted-foreground">{DOMAIN_STATES[domainStatus]?.help}</p>
        <Button size="sm" variant="outline" asChild>
          <Link to="/app/domain">Open domain setup</Link>
        </Button>
        {manage ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Label className="mb-1.5 block text-[12px]">Your domain</Label>
              <Input
                placeholder="yourbusiness.com"
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
              <RefreshCw className="mr-1 size-3.5" /> Save & check
            </Button>
          </div>
        ) : null}
        {settings?.custom_domain ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium">DNS check</p>
                <Pill tone={settings.dns_ok ? "signal" : "attention"}>
                  {settings.dns_ok ? "Resolving here" : "Not pointing here"}
                </Pill>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Add an A record for <span className="font-mono">@</span> and{" "}
                <span className="font-mono">www</span> pointing to{" "}
                <span className="font-mono">185.158.133.1</span>.
              </p>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium">Secure certificate (SSL)</p>
                <Pill tone={settings.ssl_ok ? "signal" : settings.dns_ok ? "info" : "neutral"}>
                  {settings.ssl_ok
                    ? "HTTPS active"
                    : settings.dns_ok
                      ? "Being issued"
                      : "Waiting on DNS"}
                </Pill>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Certificates are issued automatically once DNS resolves here — usually within a few
                hours.
              </p>
            </div>
          </div>
        ) : null}
        {settings?.custom_domain && !(settings.dns_ok && settings.ssl_ok) ? (
          <p className="text-[12px] text-accent">
            Your domain isn't live yet. Until both checks pass, your site stays on its Revora
            address.
          </p>
        ) : null}
        {settings?.domain_error ? (
          <p className="text-[12px] text-destructive">{settings.domain_error}</p>
        ) : null}
        {settings?.domain_checked_at ? (
          <p className="text-[11px] text-muted-foreground">
            Last checked {dateLong(settings.domain_checked_at)}
          </p>
        ) : null}
      </Panel>

      <Panel className="space-y-3">
        <SectionHeading
          eyebrow="Handoff"
          title="Your system at a glance"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const lines = [
                  `Business: ${org?.name ?? ""}`,
                  `Website: ${siteUrl}`,
                  `Revora share link: ${revoraShareAddress(org?.slug ?? "")}`,
                  `Website status: ${reviewMeta.label}`,
                  `Publishing: ${PUBLISH_STATES[publishState]?.label ?? publishState}`,
                  `Domain: ${DOMAIN_STATES[domainStatus]?.label ?? domainStatus}`,
                  `Phone: ${profile?.phone ?? "Not set"}`,
                  `Email: ${profile?.email ?? "Not set"}`,
                  `Service area: ${profile?.service_area ?? "Not set"}`,
                  `Services live: ${active.length}`,
                  `Setup complete: ${score.score}%`,
                ].join("\n");
                const url = URL.createObjectURL(new Blob([lines], { type: "text/plain" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = `${org?.slug ?? "business"}-revora-handoff.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download handoff sheet
            </Button>
          }
        />
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <Row label="Website address" value={siteUrl} />
          <Row label="Revora share link" value={revoraShareAddress(org?.slug ?? "")} />
          <Row label="Website status" value={reviewMeta.label} />
          <Row label="Login page" value="/auth" />
          <Row label="Business phone" value={profile?.phone ?? "Not set"} />
          <Row label="Business email" value={profile?.email ?? "Not set"} />
          <Row
            label="Address"
            value={
              [profile?.address, profile?.city, profile?.state, profile?.zip]
                .filter(Boolean)
                .join(", ") || "Not set"
            }
          />
          <Row label="Service area" value={profile?.service_area ?? "Not set"} />
          <Row
            label="Plan"
            value={`${org?.plan_id ?? "No plan"} · ${org?.subscription_status ?? ""}`}
          />
          <Row label="Support" value={profile?.support_email ?? "Revorabusiness0@gmail.com"} />
          <Row label="Team members" value={number((team ?? []).length)} />
          <Row label="Setup complete" value={`${score.score}%`} />
        </dl>
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
