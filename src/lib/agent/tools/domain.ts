/**
 * domain.status: read-only custom-domain state from the stored checks the
 * Domain page shows. It runs no lookup and changes nothing; changes stay manual.
 */
import { z } from "zod";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { db, readFailed } from "./shared";

export const domainStatus = () =>
  defineToolV2({
    name: "domain.status",
    description:
      "This workspace's custom domain state: domain, verification, DNS and SSL status, last check times and the last stored error. Read-only.",
    risk: "read",
    scope: "owner",
    schema: z.strictObject({}),
    run: async (_input, context) => {
      const { data, error } = await db(context)
        .from("website_settings")
        .select(
          "custom_domain, domain_status, domain_verified, dns_ok, ssl_ok, ssl_active, domain_checked_at, ssl_checked_at, domain_error, domain_target, domain_primary_host, publish_state",
        )
        .eq("organization_id", context.organizationId)
        .maybeSingle();
      if (error) readFailed(error);
      if (!data)
        return {
          customDomain: null,
          connected: false,
          note: "No website settings for this workspace yet.",
        };
      const d = data as Record<string, unknown>;
      return {
        customDomain: (d["custom_domain"] as string | null) ?? null,
        status: d["domain_status"] ?? null,
        verified: d["domain_verified"] === true,
        dnsOk: d["dns_ok"] === true,
        sslOk: d["ssl_ok"] === true,
        sslActive: d["ssl_active"] === true,
        connected:
          !!d["custom_domain"] &&
          d["domain_verified"] === true &&
          d["dns_ok"] === true &&
          d["ssl_ok"] === true,
        primaryHost: d["domain_primary_host"] ?? null,
        expectedTarget: d["domain_target"] ?? null,
        lastDomainCheck: d["domain_checked_at"] ?? null,
        lastSslCheck: d["ssl_checked_at"] ?? null,
        lastError:
          typeof d["domain_error"] === "string"
            ? (d["domain_error"] as string).slice(0, 300)
            : null,
        published: d["publish_state"] === "published",
      };
    },
  });
