import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** A client saves their own domain and gets an honest, verified status back. */
export const saveOwnDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; domain: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
    domain: String(input?.domain ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const {
      checkDomain,
      isValidDomain,
      normalizeDomain,
      DOMAIN_TARGET,
      DOMAIN_A_RECORD,
      requiredDnsRecords,
    } = await import("@/lib/admin.server");

    // RLS scopes this read to the caller's own workspace.
    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("id, organization_id, custom_domain")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");

    const domain = data.domain ? normalizeDomain(data.domain) : "";
    if (domain && !isValidDomain(domain))
      throw new Error("That doesn't look like a valid domain name.");

    // CLIENT ISOLATION: one domain belongs to exactly one workspace. The other
    // workspace's row is invisible under RLS, so the conflict is looked up with
    // server credentials AFTER the caller's own access has been confirmed.
    if (domain && domain !== (settings.custom_domain ?? "").toLowerCase()) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: taken } = await supabaseAdmin
        .from("website_settings")
        .select("organization_id")
        .eq("custom_domain", domain)
        .neq("organization_id", data.organizationId)
        .limit(1);
      if (taken?.length) {
        throw new Error(
          "That domain is already connected to another Revora account. Disconnect it there first, or contact support.",
        );
      }
    }

    const check = domain
      ? await checkDomain(domain)
      : {
          status: "not_connected" as const,
          detail: "No custom domain added.",
          dnsOk: false,
          sslOk: false,
          records: null,
        };

    const { error: updateError } = await context.supabase
      .from("website_settings")
      .update({
        custom_domain: domain || null,
        domain_status: check.status,
        domain_error:
          check.status === "error" || check.status === "dns_pending" ? check.detail : null,
        domain_checked_at: new Date().toISOString(),
        domain_target: DOMAIN_TARGET,
        domain_verified: check.dnsOk,
        ssl_active: check.sslOk,
        dns_ok: check.dnsOk,
        ssl_ok: check.sslOk,
        domain_records: check.records,
      })
      .eq("organization_id", data.organizationId);
    if (updateError) throw new Error(updateError.message);

    return {
      ...check,
      domain,
      target: DOMAIN_TARGET,
      aRecord: DOMAIN_A_RECORD,
      required: domain ? requiredDnsRecords(domain) : [],
      live: check.dnsOk && check.sslOk,
    };
  });

/**
 * Registration lookup for a candidate name, so an owner can tell whether it is
 * worth clicking through to a registrar. RDAP is the registries' own public
 * directory: a 404 means nobody holds the name. Availability is reported as a
 * strong hint, never as a guarantee — the registrar's checkout is the truth.
 *
 * A lookup that cannot be completed is reported honestly as "unknown" with a
 * plain-language reason, never guessed at.
 */
export const checkDomainAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { domains: string[] }) => ({
    domains: (Array.isArray(input?.domains) ? input.domains : [])
      .slice(0, 12)
      .map((d) => String(d)),
  }))
  .handler(async ({ data }) => {
    const { normalizeDomain, isValidDomain } = await import("@/lib/admin.server");

    /** One RDAP request with a hard timeout so a slow registry can't hang the page. */
    const rdap = async (domain: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        return await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
          headers: { Accept: "application/rdap+json" },
          redirect: "follow",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    const lookup = async (raw: string) => {
      const domain = normalizeDomain(raw);
      if (!domain || !isValidDomain(domain)) {
        return { domain, state: "invalid" as const, reason: "That isn't a valid domain name." };
      }

      let lastReason = "We couldn't reach the domain registry.";
      // One retry: registry directories time out or rate-limit intermittently.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await rdap(domain);
          if (res.status === 404) return { domain, state: "available" as const, reason: null };
          if (res.ok) return { domain, state: "taken" as const, reason: null };
          if (res.status === 429) {
            lastReason = "The registry is busy right now. Try again in a moment.";
          } else if (res.status === 400 || res.status === 501) {
            lastReason = "This domain ending can't be checked automatically.";
          } else {
            lastReason = "The domain registry didn't answer.";
          }
        } catch (error) {
          lastReason =
            error instanceof Error && error.name === "AbortError"
              ? "The registry took too long to answer."
              : "We couldn't reach the domain registry.";
        }
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return { domain, state: "unknown" as const, reason: lastReason };
    };

    const results = await Promise.all(data.domains.map(lookup));
    const checked = results.filter((r) => r.state === "available" || r.state === "taken").length;
    return {
      results,
      checkedAt: new Date().toISOString(),
      /** True when nothing could be confirmed — the UI shows a retry instead of a wall of "unknown". */
      unavailable: results.length > 0 && checked === 0,
      reason: results.find((r) => r.state === "unknown")?.reason ?? null,
    };
  });

/**
 * Re-run the live DNS + HTTPS verification for the domain already saved on this
 * workspace, and report which individual records resolve. Status is only ever
 * derived from a real lookup — nothing is assumed from what the owner typed.
 */
export const recheckDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { checkDomain, DOMAIN_A_RECORD } = await import("@/lib/admin.server");

    const { data: settings, error } = await context.supabase
      .from("website_settings")
      .select("organization_id, custom_domain")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error || !settings) throw new Error("You don't have access to that workspace.");

    const domain = settings.custom_domain ?? "";
    if (!domain) throw new Error("No custom domain is connected yet.");

    const check = await checkDomain(domain);
    await context.supabase
      .from("website_settings")
      .update({
        domain_status: check.status,
        domain_error:
          check.status === "error" || check.status === "dns_pending" ? check.detail : null,
        domain_checked_at: new Date().toISOString(),
        domain_verified: check.dnsOk,
        ssl_active: check.sslOk,
        dns_ok: check.dnsOk,
        ssl_ok: check.sslOk,
        domain_records: check.records,
      })
      .eq("organization_id", data.organizationId);

    const records = (check.records ?? {}) as {
      a?: string[];
      cname?: string[];
      aMatches?: boolean;
      cnameMatches?: boolean;
    };
    return {
      domain,
      status: check.status,
      detail: check.detail,
      dnsOk: check.dnsOk,
      sslOk: check.sslOk,
      live: check.dnsOk && check.sslOk,
      expected: DOMAIN_A_RECORD,
      seen: [...(records.a ?? []), ...(records.cname ?? [])],
      rootOk: !!(records.aMatches || records.cnameMatches),
      checkedAt: new Date().toISOString(),
    };
  });
