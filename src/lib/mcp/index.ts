import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listSitesTool from "./tools/list-sites";
import getSiteStatusTool from "./tools/get-site-status";
import listLeadsTool from "./tools/list-leads";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "revoragrowth",
  title: "RevoraGrowth",
  version: "0.1.0",
  instructions:
    "Tools for RevoraGrowth, an AI website and growth platform. Callers sign in with their " +
    "Revora account and see only their own workspaces. Use `list_sites` to see workspaces and " +
    "publish status, `get_site_status` for one site's publish/domain/SSL detail, and " +
    "`list_leads` for recent leads.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listSitesTool, getSiteStatusTool, listLeadsTool],
});
