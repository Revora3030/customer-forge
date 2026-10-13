import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { orgRole, roleAtLeast } from "@/lib/org-authz.server";
import { PLATFORM_ORIGIN } from "@/lib/revora-address";
import { inspectHtml } from "@/lib/agent/verify";
import { inspectRepository } from "./repository-inspection.server";

export function needsConversationInspection(instruction: string) {
  return /\b(audit|inspect|review|verify|errors?|blockers?|restrictions?|limitations?|codebase|repository|platform|broken|accessibility|performance|seo)\b/i.test(instruction);
}
export async function inspectConversation(input: { organizationId: string; userId: string; instruction: string }) {
  if (!needsConversationInspection(input.instruction)) return { status: "not_requested" };
  try {
    if (!/^[0-9a-f-]{36}$/i.test(input.organizationId)) throw new Error("Invalid workspace.");
    const authorization = getRequest().headers.get("authorization") ?? "";
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!authorization.startsWith("Bearer ") || !url || !key) throw new Error("Authentication unavailable.");
    const client = createClient<Database>(url, key, { global: { headers: { Authorization: authorization }, fetch: (resource, init) => fetch(resource, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) }) }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: claims, error: claimsError } = await client.auth.getClaims(authorization.slice(7));
    if (claimsError || claims?.claims?.sub !== input.userId) throw new Error("Identity not verified.");
    const admin = await client.from("user_roles").select("role").eq("user_id", input.userId).eq("role", "super_admin").limit(1);
    const verifiedAdmin = !admin.error && Boolean(admin.data?.length);
    if (!verifiedAdmin && !roleAtLeast(await orgRole(client, input.organizationId, input.userId), "viewer")) throw new Error("Workspace access not verified.");
    const [org, pages, sections, settings] = await Promise.all([
      client.from("organizations").select("name, slug").eq("id", input.organizationId).maybeSingle(),
      client.from("website_pages").select("slug, title, kind, seo_title, seo_description, noindex", { count: "exact" }).eq("organization_id", input.organizationId).eq("is_visible", true).order("sort_order").limit(50),
      client.from("website_sections").select("page_id, kind, heading, body, is_visible", { count: "exact" }).eq("organization_id", input.organizationId).order("sort_order").limit(150),
      client.from("website_settings").select("publish_state, review_state").eq("organization_id", input.organizationId).maybeSingle(),
    ]);
    if ([org, pages, sections, settings].some((result) => result.error) || !org.data) throw new Error("Workspace evidence unavailable.");
    const snapshot = { organizationId: input.organizationId, business: org.data.name, databaseHost: new URL(url).hostname, visiblePageTotal: pages.count, pages: pages.data, sectionTotal: sections.count, sections: (sections.data ?? []).map((section) => ({ ...section, body: section.body?.slice(0, 400) ?? null })), settings: settings.data, limits: "At most 50 visible pages and 150 sections; section bodies are excerpts. Stored content does not prove rendered behavior." };
    const configuredOrigin = process.env["REVORA_VERIFY_ORIGIN"] || process.env["APP_URL"];
    const origin = new URL(configuredOrigin || PLATFORM_ORIGIN);
    if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("Inspection origin is not supported.");
    const slug = org.data.slug;
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Invalid site address.");
    const targets = (pages.data ?? []).slice(0, 8);
    const rendered = settings.data?.publish_state === "published" ? await Promise.all(targets.map(async (page) => {
      const target = `${origin.origin}/s/${encodeURIComponent(slug)}${page.kind === "home" ? "" : `/${encodeURIComponent(page.slug)}`}`;
      try {
        const response = await fetch(target, { signal: AbortSignal.timeout(6000), redirect: "manual", headers: { "user-agent": "RevoraReadOnlyInspector/1.0" } });
        if (!response.ok) return { url: target, status: response.status, inspectedHtml: false };
        const html = await response.text();
        if (html.length > 200000) return { url: target, status: response.status, inspectedHtml: false, reason: "HTML exceeded inspection size limit." };
        return { url: target, status: response.status, inspectedHtml: true, checks: inspectHtml(html, page.title).checks };
      } catch { return { url: target, inspectedHtml: false, reason: "HTTP inspection unavailable." }; }
    })) : [];
    const repository = /\b(platform|codebase|repository|source|repo)\b/i.test(input.instruction) ? await inspectRepository(verifiedAdmin, input.instruction) : { status: "not_requested" };
    return { status: "available", observedAt: new Date().toISOString(), snapshot, rendered: { origin: origin.origin, originSource: configuredOrigin ? "server_configuration" : "platform_default_not_deployment_verified", publicationState: settings.data?.publish_state ?? "unknown", pages: rendered, visiblePageTotal: pages.count, maxPages: 8, allVisiblePagesInspected: settings.data?.publish_state === "published" && (pages.count ?? Infinity) > 0 && pages.count === rendered.length && rendered.every((page) => page.inspectedHtml), limitations: "HTTP HTML only. Draft rendering, custom-domain behavior, screenshots, JavaScript interactions, submissions and performance measurements are not verified. No preview links are created and no submissions are sent." }, repository };
  } catch { return { status: "unavailable", inspected: false, reason: "Authentication, workspace authorization, database or configuration prevented inspection. Do not interpret missing evidence as a defect or platform limitation." }; }
}
