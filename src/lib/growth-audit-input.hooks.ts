import { useMemo } from "react";
import { useBusinessProfile, useServices, useWebsiteSettings } from "@/lib/queries";
import { useScoreFacts } from "@/lib/site-engine.hooks";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { readSeo } from "@/lib/site-seo";
import { readCopy } from "@/lib/site-engine";
import { growthAudit } from "@/lib/growth-command";
import { buildGrowthAuditInput } from "@/lib/growth-audit-input";

/** Read-only growth audit for a workspace (same score as /app/command). */
export function useGrowthAudit(
  organizationId: string | undefined,
  businessName: string | null | undefined,
) {
  const profileQuery = useBusinessProfile(organizationId);
  const settingsQuery = useWebsiteSettings(organizationId);
  const { data: services } = useServices(organizationId);
  const { data: pages } = useWebsiteContent(organizationId);
  const facts = useScoreFacts(organizationId);

  const settings = settingsQuery.data;
  const isLoading = profileQuery.isLoading || settingsQuery.isLoading || facts.isLoading;
  const audit = useMemo(() => {
    const generation = (settings?.generation ?? null) as Record<string, unknown> | null;
    return growthAudit(
      buildGrowthAuditInput({
        businessName,
        profile: profileQuery.data as Record<string, unknown> | null | undefined,
        seo: readSeo(settings?.seo),
        copy: readCopy(generation?.["copy"]),
        facts: facts.data,
        servicesLength: (services ?? []).length,
        pages,
        publishState: settings?.publish_state,
        domainStatus: settings?.domain_status,
      }),
    );
  }, [businessName, profileQuery.data, settings, facts.data, services, pages]);

  return { audit, isLoading, isError: profileQuery.isError || settingsQuery.isError };
}
