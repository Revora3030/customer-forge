import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole, type MinRole } from "@/lib/org-authz.server";

/**
 * Every domain operation below changes where a business's website and email
 * live, so authentication is not enough: the caller must actually hold a
 * managing role in the workspace whose id they sent. Read-only reports need
 * only staff access.
 */
async function authorize(
  context: { supabase: Parameters<typeof requireOrgRole>[0]; userId: string },
  organizationId: string,
  min: MinRole = "manager",
) {
  return requireOrgRole(context.supabase, organizationId, context.userId, min);
}

/** Saves which address is canonical and whether HTTPS is forced. */
export const saveDomainRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { organizationId: string; primaryHost: "root" | "www"; forceHttps: boolean }) => ({
      organizationId: String(input?.organizationId ?? ""),
      primaryHost: input?.primaryHost === "www" ? ("www" as const) : ("root" as const),
      forceHttps: input?.forceHttps !== false,
    }),
  )
  .handler(async ({ data, context }) => {
    await authorize(context, data.organizationId);
    const { error } = await context.supabase
      .from("website_settings")
      .update({ domain_primary_host: data.primaryHost, domain_force_https: data.forceHttps })
      .eq("organization_id", data.organizationId);
    if (error) throw new Error("Couldn't save your address settings.");
    return { primaryHost: data.primaryHost, forceHttps: data.forceHttps };
  });

/**
 * Certificate monitor. Certificates are issued and renewed automatically by the
 * hosting layer; this proves it actually happened and records when it last
 * answered, so an expiry or failure is caught instead of assumed away.
 */
export const monitorCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await authorize(context, data.organizationId);
    const { checkDomain } = await import("@/lib/admin.server");
    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("custom_domain, ssl_last_ok_at, ssl_issued_at")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");
    if (!settings.custom_domain)
      return { domain: null, sslOk: false, detail: "No custom domain connected yet." };

    const check = await checkDomain(settings.custom_domain);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      domain_status: check.status,
      dns_ok: check.dnsOk,
      ssl_ok: check.sslOk,
      domain_verified: check.dnsOk,
      ssl_active: check.sslOk,
      domain_records: check.records,
      domain_checked_at: now,
      ssl_checked_at: now,
      ssl_detail: check.detail,
    };
    if (check.sslOk) {
      patch["ssl_last_ok_at"] = now;
      if (!settings.ssl_issued_at) patch["ssl_issued_at"] = now;
    }
    await context.supabase
      .from("website_settings")
      .update(patch as never)
      .eq("organization_id", data.organizationId);

    // A certificate that used to answer and now doesn't is worth interrupting for.
    if (!check.sslOk && settings.ssl_last_ok_at) {
      await context.supabase.from("notifications").insert({
        organization_id: data.organizationId,
        title: "Secure connection stopped answering",
        body: `HTTPS isn't responding on ${settings.custom_domain}. ${check.detail}`,
        kind: "domain",
        link: "/app/domain",
      });
    }

    return { domain: settings.custom_domain, ...check, checkedAt: now };
  });

/** Prepares a move to a new domain. The current address stays live throughout. */
export const startDomainTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; toDomain: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
    toDomain: String(input?.toDomain ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await authorize(context, data.organizationId);
    const { normalizeDomain, isValidDomain } = await import("@/lib/admin.server");
    const toDomain = normalizeDomain(data.toDomain);
    if (!isValidDomain(toDomain)) throw new Error("That doesn't look like a valid domain name.");

    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("custom_domain")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");

    const transfer = {
      state: "prepared" as const,
      from_domain: settings.custom_domain,
      to_domain: toDomain,
      started_at: new Date().toISOString(),
      detail:
        "Add the DNS records for the new domain. Your current address keeps working until the new one is proven.",
    };
    const { error: saveError } = await context.supabase
      .from("website_settings")
      .update({ domain_transfer: transfer })
      .eq("organization_id", data.organizationId);
    if (saveError) throw new Error("Couldn't start the transfer.");
    return transfer;
  });

/**
 * Completes the cutover — but only when the new domain has been proven to
 * resolve here and answer over HTTPS. Anything less rolls back automatically.
 */
export const completeDomainTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await authorize(context, data.organizationId);
    const { checkDomain, DOMAIN_TARGET } = await import("@/lib/admin.server");
    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("custom_domain, domain_transfer")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");

    const transfer = (settings.domain_transfer ?? {}) as {
      to_domain?: string;
      from_domain?: string | null;
    };
    if (!transfer.to_domain) throw new Error("Start a transfer first.");

    const check = await checkDomain(transfer.to_domain);
    const now = new Date().toISOString();

    if (!check.dnsOk || !check.sslOk) {
      const rolledBack = {
        ...transfer,
        state: "rolled_back" as const,
        rolled_back_at: now,
        detail: `Cutover cancelled and your old address left untouched. ${check.detail}`,
      };
      await context.supabase
        .from("website_settings")
        .update({ domain_transfer: rolledBack })
        .eq("organization_id", data.organizationId);
      return { ok: false, transfer: rolledBack, check };
    }

    const completed = {
      ...transfer,
      state: "completed" as const,
      completed_at: now,
      detail: `${transfer.to_domain} is now your live address. The previous address redirects to it.`,
    };
    const { error: saveError } = await context.supabase
      .from("website_settings")
      .update({
        custom_domain: transfer.to_domain,
        domain_transfer: completed,
        domain_status: check.status,
        dns_ok: true,
        ssl_ok: true,
        domain_verified: true,
        ssl_active: true,
        domain_records: check.records,
        domain_target: DOMAIN_TARGET,
        domain_checked_at: now,
        ssl_last_ok_at: now,
        ssl_detail: check.detail,
      })
      .eq("organization_id", data.organizationId);
    if (saveError) throw new Error("Couldn't finish the cutover.");
    return { ok: true, transfer: completed, check };
  });

/** Puts the previous domain back, exactly as it was before the cutover. */
export const rollbackDomainTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await authorize(context, data.organizationId);
    const { checkDomain } = await import("@/lib/admin.server");
    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("domain_transfer")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");
    const transfer = (settings.domain_transfer ?? {}) as { from_domain?: string | null };
    const back = transfer.from_domain ?? null;
    const check = back ? await checkDomain(back) : null;
    const now = new Date().toISOString();

    const rolledBack = {
      ...transfer,
      state: "rolled_back" as const,
      rolled_back_at: now,
      detail: back ? `Rolled back to ${back}.` : "Rolled back — no custom domain is connected.",
    };
    const { error: saveError } = await context.supabase
      .from("website_settings")
      .update({
        custom_domain: back,
        domain_transfer: rolledBack,
        domain_status: check?.status ?? "not_connected",
        dns_ok: check?.dnsOk ?? false,
        ssl_ok: check?.sslOk ?? false,
        domain_verified: check?.dnsOk ?? false,
        ssl_active: check?.sslOk ?? false,
        domain_checked_at: now,
      })
      .eq("organization_id", data.organizationId);
    if (saveError) throw new Error("Couldn't roll back.");
    return { transfer: rolledBack, check };
  });

/** Saves and verifies branded email forwarding (e.g. contact@yourdomain.com). */
export const saveEmailForwarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      organizationId: string;
      provider: "improvmx" | "forwardemail";
      alias: string;
      forwardTo: string;
    }) => ({
      organizationId: String(input?.organizationId ?? ""),
      provider:
        input?.provider === "forwardemail" ? ("forwardemail" as const) : ("improvmx" as const),
      alias: String(input?.alias ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 40),
      forwardTo: String(input?.forwardTo ?? "")
        .trim()
        .slice(0, 160),
    }),
  )
  .handler(async ({ data, context }) => {
    await authorize(context, data.organizationId);
    const { isEmail } = await import("@/lib/domain-ops");
    if (!data.alias) throw new Error("Choose the name that goes before the @ sign.");
    if (!isEmail(data.forwardTo)) throw new Error("Enter the inbox that should receive the mail.");

    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("custom_domain, email_forwarding")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");
    if (!settings.custom_domain)
      throw new Error("Connect your own domain first — branded email needs it.");

    const forwarding = {
      provider: data.provider,
      alias: data.alias,
      forward_to: data.forwardTo,
      active: false,
      mx_ok: false,
      spf_ok: false,
      detail: "Saved. Add the records below at your registrar, then verify.",
      checked_at: new Date().toISOString(),
    };
    const { error: saveError } = await context.supabase
      .from("website_settings")
      .update({ email_forwarding: forwarding })
      .eq("organization_id", data.organizationId);
    if (saveError) throw new Error("Couldn't save that.");
    return forwarding;
  });

/** Checks DNS to confirm branded email is actually live, then activates it. */
export const verifyEmailForwarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await authorize(context, data.organizationId);
    const { checkEmailForwardingDns } = await import("@/lib/domain-ops.server");
    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("custom_domain, email_forwarding")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");

    const current = (settings.email_forwarding ?? {}) as {
      provider?: "improvmx" | "forwardemail";
      alias?: string;
      forward_to?: string;
    };
    if (!settings.custom_domain || !current.alias)
      throw new Error("Set up your branded address first.");

    const dns = await checkEmailForwardingDns(
      settings.custom_domain,
      current.provider ?? "improvmx",
    );
    const forwarding = {
      ...current,
      mx_ok: dns.mxOk,
      spf_ok: dns.spfOk,
      active: dns.mxOk,
      detail: dns.detail,
      checked_at: dns.checkedAt,
    };
    await context.supabase
      .from("website_settings")
      .update({ email_forwarding: forwarding })
      .eq("organization_id", data.organizationId);
    return forwarding;
  });

/** Search-visibility report for a domain change: redirects, crawl signals, canonical. */
export const runDomainSeoReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await authorize(context, data.organizationId);
    const { domainSeoReport } = await import("@/lib/domain-ops.server");
    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("custom_domain, domain_primary_host")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");
    if (!settings.custom_domain)
      throw new Error("Connect a domain first — there's nothing to report on yet.");

    const report = await domainSeoReport(
      settings.custom_domain,
      settings.domain_primary_host === "www" ? "www" : "root",
    );
    await context.supabase
      .from("website_settings")
      .update({ domain_seo_report: report })
      .eq("organization_id", data.organizationId);
    return report;
  });
