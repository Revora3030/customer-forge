import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  setup_payment_status: string;
  website_settings: {
    published: boolean;
    publish_state: string;
    custom_domain: string | null;
    domain_status: string;
    last_published_at: string | null;
  } | null;
};

const toSiteJson = (org: OrgRow) => ({
  organizationId: org.id,
  name: org.name,
  slug: org.slug,
  industry: org.industry,
  subscriptionStatus: org.subscription_status,
  trialEndsAt: org.trial_ends_at,
  setupPaymentStatus: org.setup_payment_status,
  site: org.website_settings
    ? {
        published: org.website_settings.published,
        publishState: org.website_settings.publish_state,
        customDomain: org.website_settings.custom_domain,
        domainStatus: org.website_settings.domain_status,
        lastPublishedAt: org.website_settings.last_published_at,
      }
    : null,
});

export default defineTool({
  name: "list_sites",
  title: "List sites",
  description:
    "List the signed-in user's workspaces and the publish status of each website.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("organizations")
      .select(
        "id,name,slug,industry,subscription_status,trial_ends_at,setup_payment_status," +
          "website_settings(published,publish_state,custom_domain,domain_status,last_published_at)",
      )
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []) as unknown as OrgRow[];
    const sites = rows.map(toSiteJson);
    const summary = sites.length
      ? sites
          .map(
            (s) =>
              `${s.name} (${s.slug}) — ${s.site ? (s.site.published ? "published" : "not published") : "no site yet"}`,
          )
          .join("\n")
      : "No workspaces found for this account.";
    return {
      content: [{ type: "text", text: summary }],
      structuredContent: { sites },
    };
  },
});
