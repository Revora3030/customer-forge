import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleDashed, Lock, MapPin, Sparkles } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/use-tenant";
import { useBillingState } from "@/lib/stripe.hooks";
import { SendTestLeadCard } from "@/components/app/SendTestLeadCard";
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";
import { onboardingJourney, type JourneyFacts, type JourneyPlan } from "@/lib/onboarding-journey";

const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** One pass over the counts the onboarding journey needs. */
function useJourneyFacts(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["journey_facts", organizationId],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async () => {
      const orgId = organizationId!;
      const [profile, settings, services, media, forms, automations, reviews, leads, testLeads, analytics] =
        await Promise.all([
          supabase
            .from("business_profiles")
            .select("phone, city, service_area, description, hours, logo_url, primary_color")
            .eq("organization_id", orgId)
            .maybeSingle(),
          supabase
            .from("website_settings")
            .select("publish_state, domain_status, generated_at")
            .eq("organization_id", orgId)
            .maybeSingle(),
          supabase
            .from("services")
            .select("bookable")
            .eq("organization_id", orgId)
            .eq("is_active", true),
          supabase
            .from("media")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId),
          supabase
            .from("quote_forms")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .eq("is_active", true),
          supabase
            .from("automations")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .eq("is_active", true),
          supabase
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .neq("source", TEST_LEAD_SOURCE),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .eq("source", TEST_LEAD_SOURCE),
          supabase
            .from("analytics_events")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId),
        ]);

      const p = profile.data;
      const s = settings.data;
      const rows = services.data ?? [];
      return {
        brandingReady: has(p?.logo_url) && has(p?.primary_color),
        siteGenerated: Boolean(s?.generated_at) || s?.publish_state === "published",
        sitePublished: s?.publish_state === "published",
        domainConnected: s?.domain_status === "connected" || s?.domain_status === "ssl_active",
        servicesCount: rows.length,
        bookableCount: rows.filter((r) => r.bookable).length,
        mediaCount: media.count ?? 0,
        quoteFormCount: forms.count ?? 0,
        automationsCount: automations.count ?? 0,
        reviewsCount: reviews.count ?? 0,
        leadsCount: leads.count ?? 0,
        testLeadCount: testLeads.count ?? 0,
        analyticsCount: analytics.count ?? 0,
        localSeo: {
          city: has(p?.city),
          serviceArea: has(p?.service_area),
          hours: Boolean(
            p?.hours && typeof p.hours === "object" && Object.keys(p.hours).length > 0,
          ),
          phone: has(p?.phone),
          description: has(p?.description),
        },
      };
    },
  });
}

/** The client's ordered setup plan with today's exact next action first. */
export function OnboardingJourney() {
  const { data: ws } = useWorkspace();
  const org = ws?.workspace?.organization;
  const orgId = ws?.workspace?.organizationId;
  const { data: facts } = useJourneyFacts(orgId);
  const { data: billing } = useBillingState(orgId);

  if (!facts || !org) return null;

  const input: JourneyFacts = {
    signedUpAt: org.created_at ?? null,
    onboardingCompleted: Boolean(org.onboarding_completed),
    setupPaid: Boolean(billing?.setupPaid),
    ...facts,
  };
  const testLead = (
    <SendTestLeadCard organizationId={orgId} hasTestLead={facts.testLeadCount > 0} />
  );
  const plan: JourneyPlan = onboardingJourney(input);
  const next = plan.next;

  if (!next) {
    return (
      <Panel className="p-5">
        <SectionHeading eyebrow="Setup complete" title="Your system is fully set up" />
        <p className="mt-2 text-[13px] text-muted-foreground">
          Every setup step is done. Keep momentum in the Command Center — it scans your live site
          and hands you the next improvement.
        </p>
        <Button asChild variant="signal" size="sm" className="mt-4">
          <Link to="/app/command">Open the Command Center</Link>
        </Button>
        <div className="-mx-5 -mb-5 mt-5 overflow-hidden rounded-b-[inherit]">{testLead}</div>
      </Panel>
    );
  }

  return (
    <Panel className="gold-glow overflow-hidden p-0">
      <div className="border-b border-border bg-primary/5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="signal">
            <Sparkles className="size-3" aria-hidden="true" /> START HERE
          </Pill>
          <Pill tone="neutral">{plan.dayLabel}</Pill>
          <Pill tone="neutral">
            {plan.done}/{plan.total} done · {plan.percent}%
          </Pill>
          {plan.localSeoReady ? (
            <Pill tone="signal">
              <MapPin className="size-3" aria-hidden="true" /> LOCAL SEO ON
            </Pill>
          ) : null}
        </div>

        <h2 className="mt-3 font-display text-[20px] leading-tight font-semibold">
          Next: <span className="gold-text">{next.label}</span>
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {next.why}
        </p>

        <div
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={plan.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${plan.percent}%` }}
          />
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="signal" size="lg" className="h-auto py-3 whitespace-normal">
            <Link to={next.to}>
              {next.action} <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/app/launch">See the full checklist</Link>
          </Button>
        </div>
      </div>

      <ol className="divide-y divide-border">
        {plan.steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-center gap-3 p-4">
            {step.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : step.gate ? (
              <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <CircleDashed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-[13px] ${step.done ? "" : "font-medium"}`}>
                {step.label}
                {step.key === next.key ? <span className="gold-hl"> · do this now</span> : null}
              </p>
              {!step.done ? (
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  {step.action}
                </p>
              ) : null}
            </div>
            {!step.done ? (
              <Button asChild variant={step.key === next.key ? "signal" : "ghost"} size="sm">
                <Link to={step.to}>Open</Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      {testLead}
    </Panel>
  );
}
