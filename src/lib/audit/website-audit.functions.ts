import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditPublicWebsite } from "@/lib/audit/website-audit";
import { emitN8nEvent } from "@/lib/connectors/n8n.server";

export const auditExistingWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; url: string }) => {
    const organizationId = String(input?.organizationId ?? "").trim();
    const url = String(input?.url ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace.");
    if (url.length < 4 || url.length > 2048) throw new Error("Enter a valid website URL.");
    return { organizationId, url };
  })
  .handler(async ({ data, context }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("memberships")
      .select("organization_id")
      .eq("organization_id", data.organizationId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (membershipError || !membership) throw new Error("You don't have access to this workspace.");

    const audit = await auditPublicWebsite(data.url);
    const supabase = context.supabase;

    const { data: savedAudit, error: auditError } = await supabase
      .from("website_audits")
      .insert({
        organization_id: data.organizationId,
        requested_url: audit.url,
        final_url: audit.finalUrl,
        status: "completed",
        http_status: audit.httpStatus,
        growth_score: audit.score,
        title: audit.title,
        description: audit.description,
        signals: audit.signals,
        fetched_at: audit.fetchedAt,
      })
      .select("id")
      .single();

    if (auditError || !savedAudit) {
      throw new Error("The website was audited, but Revora could not save the result.");
    }

    if (audit.findings.length) {
      const { error: findingError } = await supabase.from("website_audit_findings").insert(
        audit.findings.map((finding) => ({
          audit_id: savedAudit.id,
          organization_id: data.organizationId,
          finding_key: finding.id,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          explanation: finding.explanation,
          recommendation: finding.recommendation,
          evidence: finding.evidence,
          observed: finding.observed,
        })),
      );
      if (findingError) console.error("[website-audit] findings could not be saved", findingError);
    }

    // Optional: if n8n is not configured this is a no-op, so the audit remains
    // fully functional without any third-party service.
    void emitN8nEvent({
      organizationId: data.organizationId,
      event: "website.audit.completed",
      data: { auditId: savedAudit.id, score: audit.score, url: audit.finalUrl },
    });

    return { ...audit, auditId: savedAudit.id };
  });
