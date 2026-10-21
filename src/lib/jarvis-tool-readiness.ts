/**
 * Presence-only readiness for Jarvis tools and picture services.
 *
 * Reports what each tool needs before it can run, never whether it works:
 * readiness is configuration, not a live test. Only public secret NAMES are
 * returned (the same names the tools report as needs_key); values never leave
 * this function, and nothing here calls a provider.
 */
import { CONNECTED_SERVICE_SECRETS } from "./jarvis-connected-services";
import type { JarvisDiagnosticToolId } from "./jarvis-tool-registry";

export type JarvisToolReadinessState =
  /** Runs without any key. */
  | "keyless"
  /** Runs without a key on a free quota shared with other callers; adding a key gives it its own quota. */
  | "keyless_shared_quota"
  /** The key it needs is saved (not proof the key works). */
  | "key_present"
  /** It cannot run until the named secret is saved. */
  | "needs_key"
  /** No code path exists, so Revora never claims it works. */
  | "not_implemented";

export type JarvisToolReadiness = { state: JarvisToolReadinessState; secretName?: string };

export type JarvisServiceId =
  | "stock.unsplash"
  | "stock.pexels"
  | "image.cloudflare"
  | "image.huggingface"
  | "image.pollinations";

type Env = Record<string, string | undefined>;
type Rule = (env: Env) => JarvisToolReadiness;

const has = (env: Env, name: string) => Boolean(env[name]?.trim());
const keyless: Rule = () => ({ state: "keyless" });
/** Needs every listed secret; reports the missing names, or the names that are saved. */
const needs = (...names: string[]): Rule => (env) => {
  const missing = names.filter((name) => !has(env, name));
  return missing.length
    ? { state: "needs_key", secretName: missing.join(" and ") }
    : { state: "key_present", secretName: names.join(" and ") };
};
/** Runs keylessly on a shared quota; an optional key gives it its own. */
const sharedQuota = (name: string): Rule => (env) =>
  has(env, name) ? { state: "key_present", secretName: name } : { state: "keyless_shared_quota", secretName: name };
const connected = (toolId: keyof typeof CONNECTED_SERVICE_SECRETS): Rule =>
  needs("LOVABLE_API_KEY", CONNECTED_SERVICE_SECRETS[toolId]);

// Typed by tool id so every newly registered tool must declare what it needs.
const TOOL_RULES: Record<JarvisDiagnosticToolId, Rule> = {
  "website.html.audit": keyless,
  "website.accessibility.static": keyless,
  "website.security.headers": keyless,
  "website.links.inventory": keyless,
  "website.html.validate": keyless,
  "security.dependencies.osv": keyless,
  "website.security.observatory": keyless,
  "domain.rdap.lookup": keyless,
  "domain.wayback.history": keyless,
  "website.text.extract": keyless,
  "website.dns.lookup": keyless,
  "workspace.calendar.upcoming": connected("workspace.calendar.upcoming"),
  "workspace.sheets.read": connected("workspace.sheets.read"),
  "cloudflare.zones.summary": connected("cloudflare.zones.summary"),
  "email.resend.domains": connected("email.resend.domains"),
  "ai.omniroute.models": needs("OMNIROUTE_BASE_URL", "OMNIROUTE_API_KEY"),
  "platform.errors.summary": keyless,
  "builder.health.summary": keyless,
  "database.contracts.probe": keyless,
  "website.public.seo-smoke": keyless,
  "ai.providers.snapshot": keyless,
  "connectors.permissions.snapshot": keyless,
  "growth.funnel.summary": keyless,
  // Unauthenticated GitHub API reads share a small per-address hourly quota.
  "release.ci.evidence": sharedQuota("REVORA_GITHUB_READ_TOKEN"),
  // PageSpeed Insights runs without a key on Google's shared anonymous quota.
  "website.lighthouse.audit": sharedQuota("GOOGLE_PAGESPEED_API_KEY"),
  "website.browser.check": needs("BROWSERLESS_API_KEY"),
  "website.page.audit": needs("BROWSERBASE_API_KEY"),
  // Openverse and Wikimedia need no key; Unsplash/Pexels keys only add sources
  // (their own readiness is reported under stock.unsplash and stock.pexels).
  "images.stock.search": keyless,
  "docs.lookup": needs("CONTEXT7_API_KEY"),
  "jarvis.capabilities.scorecard": keyless,
  "observability.export.status": keyless,
  "security.posture.summary": keyless,
  "integrations.status": keyless,
  "web.page.read": keyless,
};

const SERVICE_RULES: Record<JarvisServiceId, Rule> = {
  "stock.unsplash": needs("UNSPLASH_ACCESS_KEY"),
  "stock.pexels": needs("PEXELS_API_KEY"),
  "image.cloudflare": (env) => {
    const token = has(env, "CLOUDFLARE_AI_API_TOKEN") || has(env, "CLOUDFLARE_API_TOKEN");
    if (has(env, "CLOUDFLARE_ACCOUNT_ID") && token) return { state: "key_present", secretName: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN" };
    return { state: "needs_key", secretName: [!has(env, "CLOUDFLARE_ACCOUNT_ID") ? "CLOUDFLARE_ACCOUNT_ID" : null, !token ? "CLOUDFLARE_AI_API_TOKEN" : null].filter(Boolean).join(" and ") };
  },
  // The AI layer has no Hugging Face or Pollinations image path, so a saved
  // key would not make picture generation work.
  "image.huggingface": () => ({ state: "not_implemented" }),
  "image.pollinations": () => ({ state: "not_implemented" }),
};

export type JarvisReadinessId = JarvisDiagnosticToolId | JarvisServiceId;

export function jarvisToolReadiness(env: Env = process.env): Record<JarvisReadinessId, JarvisToolReadiness> {
  const out = {} as Record<JarvisReadinessId, JarvisToolReadiness>;
  for (const [id, rule] of Object.entries(TOOL_RULES) as [JarvisDiagnosticToolId, Rule][]) out[id] = rule(env);
  for (const [id, rule] of Object.entries(SERVICE_RULES) as [JarvisServiceId, Rule][]) out[id] = rule(env);
  return out;
}

/** True when the tool can be run now; configuration only, never proof it works. */
export function isRunnableReadiness(readiness: JarvisToolReadiness | undefined): boolean {
  return readiness !== undefined && readiness.state !== "needs_key" && readiness.state !== "not_implemented";
}
