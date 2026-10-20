import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_site_status",
  title: "Get site status",
  description:
    "Get publish, domain, SSL and review status for one of the signed-in user's websites, by workspace slug or ID.",
  inputSchema: {
    organization: z
      .string()
      .min(1)
      .describe("Workspace slug (e.g. \"elite-mobile-detail\") or organization ID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organization }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organization);
    const query = supabase.from("organizations").select("id,name,slug").limit(1);
    const { data: orgs, error: orgError } = await (isUuid
      ? query.eq("id", organization)
      : query.eq("slug", organization));
    if (orgError) return { content: [{ type: "text", text: orgError.message }], isError: true };
    const org = orgs?.[0];
    if (!org) throw new ToolError("No workspace with that slug or ID is visible to your account.");

    const { data: settingsData, error: settingsError } = await supabase
      .from("website_settings")
      .select(
        "published,publish_state,review_state,custom_domain,domain_status,domain_verified," +
          "ssl_active,ssl_ok,last_published_at,generated_at,pages,template",
      )
      .eq("organization_id", org.id)
      .maybeSingle();
    if (settingsError) return { content: [{ type: "text", text: settingsError.message }], isError: true };
    const settings = settingsData as unknown as {
      published: boolean;
      publish_state: string;
      review_state: string;
      custom_domain: string | null;
      domain_status: string;
      domain_verified: boolean;
      ssl_active: boolean;
      ssl_ok: boolean;
      last_published_at: string | null;
      generated_at: string | null;
      pages: unknown;
      template: string;
    } | null;
    if (!settings) throw new ToolError(`"${org.name}" has no website yet.`);

    const pageCount = Array.isArray(settings.pages) ? settings.pages.length : 0;
    const status = {
      organizationId: org.id as string,
      name: org.name as string,
      slug: org.slug as string,
      published: settings.published as boolean,
      publishState: settings.publish_state as string,
      reviewState: settings.review_state as string,
      customDomain: (settings.custom_domain as string | null) ?? null,
      domainStatus: settings.domain_status as string,
      domainVerified: settings.domain_verified as boolean,
      sslActive: settings.ssl_active as boolean,
      lastPublishedAt: (settings.last_published_at as string | null) ?? null,
      generatedAt: (settings.generated_at as string | null) ?? null,
      pageCount,
    };
    const text = [
      `${status.name} (${status.slug})`,
      `Published: ${status.published ? "yes" : "no"} (${status.publishState})`,
      `Domain: ${status.customDomain ?? "not connected"} (${status.domainStatus})`,
      `SSL: ${status.sslActive ? "active" : "not active"}`,
      `Pages: ${status.pageCount}`,
      `Last published: ${status.lastPublishedAt ?? "never"}`,
    ].join("\n");
    return { content: [{ type: "text", text }], structuredContent: { status } };
  },
});
