import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IntegrationFacts } from "@/lib/integrations";
import { alertInbox } from "@/lib/lead-alert-recipient";

/**
 * Reads the real facts behind the Integration Center. Every source that fails is
 * reported in `unavailable` so the UI can say "can't check right now" instead of
 * pretending something is connected.
 */
export function useIntegrationFacts(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["integration_facts", organizationId],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async (): Promise<IntegrationFacts> => {
      const orgId = organizationId!;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [org, profile, site, automations, runs, alerts, ai] = await Promise.all([
        supabase
          .from("organizations")
          .select("setup_payment_status, subscription_status")
          .eq("id", orgId)
          .maybeSingle(),
        supabase
          .from("business_profiles")
          .select("notification_email, owner_email, email, notify_on_lead")
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("website_settings")
          .select(
            "custom_domain, domain_verified, dns_ok, ssl_ok, domain_error, published, last_published_at, seo, pages",
          )
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("automations")
          .select("id")
          .eq("organization_id", orgId)
          .eq("is_active", true),
        supabase
          .from("automation_runs")
          .select("status, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", since),
        supabase
          .from("lead_alert_log")
          .select("status, reason, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("ai_generations")
          .select("id")
          .eq("organization_id", orgId)
          .gte("created_at", since),
      ]);

      const unavailable: string[] = [];
      if (org.error) unavailable.push("billing");
      if (profile.error) unavailable.push("profile");
      if (site.error) unavailable.push("website");
      if (automations.error || runs.error) unavailable.push("automations");

      const p = (profile.data ?? null) as {
        notification_email?: string | null;
        owner_email?: string | null;
        email?: string | null;
        notify_on_lead?: boolean | null;
      } | null;
      // Same inbox, same order, same validation as the real sender; the on/off
      // switch is reported separately so the card can say "switched off".
      const alertEmail = p ? alertInbox(p) : null;

      const s = (site.data ?? null) as Record<string, unknown> | null;
      const seo = (s?.["seo"] ?? null) as Record<string, unknown> | null;
      const noindex = seo?.["noindex"] === true;

      const failedRuns = (runs.data ?? []).filter(
        (run) => (run as { status?: string }).status === "failed",
      ).length;
      // The newest attempt decides health: an older success must never mask a
      // newer failure.
      const alertRows = (alerts.data ?? []) as { status?: string; reason?: string | null; created_at?: string }[];
      const newestAlert = alertRows[0] ?? null;

      return {
        setupPaymentStatus:
          (org.data as { setup_payment_status?: string } | null)?.setup_payment_status ?? null,
        subscriptionStatus:
          (org.data as { subscription_status?: string } | null)?.subscription_status ?? null,
        leadAlertsEmail: alertEmail,
        leadAlertsEnabled: !!alertEmail && p?.notify_on_lead !== false,
        lastLeadAlertAt: newestAlert?.created_at ?? null,
        lastLeadAlertStatus: newestAlert?.status ?? null,
        lastLeadAlertReason: newestAlert?.reason ?? null,
        customDomain: (s?.["custom_domain"] as string | null) ?? null,
        domainVerified: s?.["domain_verified"] === true,
        dnsOk: s?.["dns_ok"] === true,
        sslOk: s?.["ssl_ok"] === true,
        domainError: (s?.["domain_error"] as string | null) ?? null,
        published: s?.["published"] === true,
        lastPublishedAt: (s?.["last_published_at"] as string | null) ?? null,
        seoIndexable: !noindex,
        activeAutomations: (automations.data ?? []).length,
        automationFailures: failedRuns,
        aiGenerationsLast30: ai.error ? null : (ai.data ?? []).length,
        unavailable,
      };
    },
  });
}
