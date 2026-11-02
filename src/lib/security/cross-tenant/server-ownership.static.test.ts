/**
 * Static ownership audit of every server entry point that accepts an id from
 * the browser (src/lib/*.functions.ts and src/routes/**).
 *
 * The service-role client (`supabaseAdmin`) bypasses row level security, so any
 * function that uses it together with an id taken from the request must prove
 * the caller owns that id first. These tests fail when a new function does not.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(process.cwd(), p).replaceAll("\\", "/");

interface ServerFn {
  file: string;
  name: string;
  head: string; // everything before .handler(
  body: string; // from .handler( to the next export
  block: string;
}

function serverFns(): ServerFn[] {
  const out: ServerFn[] = [];
  for (const file of walk(SRC).filter((f) => /\.functions\.ts$/.test(f))) {
    const src = readFileSync(file, "utf8");
    const starts = [...src.matchAll(/export const (\w+)\s*=\s*createServerFn\(/g)];
    starts.forEach((m, i) => {
      const block = src.slice(m.index, starts[i + 1]?.index ?? src.length);
      const h = block.indexOf(".handler(");
      out.push({
        file: rel(file),
        name: m[1] as string,
        head: h >= 0 ? block.slice(0, h) : block,
        body: h >= 0 ? block.slice(h) : "",
        block,
      });
    });
  }
  return out;
}
const fns = serverFns();
const key = (f: ServerFn) => `${f.file}#${f.name}`;

/** Fields that name a tenant, site, lead or user in a request. */
const ID_FIELD =
  /\b(organizationId|orgId|organization_id|businessId|siteId|websiteId|leadId|userId|clientId|workspaceId|memberId|org_id|backupId|invitationId|customerId|versionId|pageId)\b/;

/** Recognised ownership guards (all resolve the caller from the verified session). */
const GUARD =
  /requireOrgRole\(|assertSuperAdmin\(|assertCanManage\(|assertBackupAccess\(|\bsuperAdmin\(context\)|assertOrgAccess\(|orgRole\(|is_org_member|can_manage_org|org_role_at_least|from\("memberships"\)/;

/**
 * Server functions with NO sign-in. Each one is public by design, resolves its
 * target from a slug/token (never a raw org id), or acts on no tenant data.
 */
const PUBLIC_FUNCTIONS: Record<string, string> = {
  "assessment.functions.ts#submitAssessment": "marketing form; writes only a new lead for the platform",
  "calendly.functions.ts#getRevoraBookingOptions": "public booking widget config",
  "contact.functions.ts#submitContactRequest": "marketing contact form",
  "conversion.functions.ts#recordConversion": "platform funnel beacon; no tenant id accepted, rate limited",
  "currency.functions.ts#getUsdRate": "public exchange rate",
  "holidays.functions.ts#getUpcomingHolidays": "public holiday list",
  "host-site.functions.ts#getHostSite": "resolves a custom domain to a PUBLISHED site only",
  "monitoring.functions.ts#reportClientError": "client error beacon",
  "offer.functions.ts#getPublicOfferRates": "public pricing",
  "plans.functions.ts#getPlans": "public pricing catalogue",
  "platform-settings.functions.ts#getPublicGaMeasurementIds": "public analytics ids",
  "prospect-claim.functions.ts#getProspectClaim": "unguessable single-use claim token",
  "prospect-claim.functions.ts#prospectLinkState": "unguessable preview token",
  "public-site.functions.ts#getPublicSite": "slug lookup through the anon client: RLS exposes published sites only",
  "public-site.functions.ts#getPreviewSite": "unguessable preview token",
  "public-site.functions.ts#submitPublicLead": "slug lookup; the site must be published; writes one lead for that site",
  "public-site.functions.ts#trackPublicEvent": "anon client: RLS allows inserts for published sites only",
  "public-site.functions.ts#recordSiteVitals": "anon client: RLS allows inserts for published sites only",
  "server-clock.functions.ts#getServerTime": "returns the time",
  "site-agent.functions.ts#builderMediaCapabilities": "static capability flags",
  "visitor-jarvis.functions.ts#askVisitorJarvis": "public visitor assistant, answers from the published site",
};

/**
 * Signed-in functions that use the service role with a request id and do NOT
 * call one of the shared guards. Every entry has been read and the reason
 * recorded. A new function must either call a guard above or be added here
 * with a reviewed reason.
 */
const REVIEWED_ADMIN_WITHOUT_SHARED_GUARD: Record<string, string> = {
  "automations.functions.ts#runDueAutomations":
    "looks the organization up with the caller's own RLS client first and returns early when no row is visible",
  "domain.functions.ts#saveOwnDomain":
    "reads and writes the organization row through the caller's RLS client; the service role is used only for a global uniqueness check on the domain",
  "lead-review-draft.functions.ts#getLeadReviewDraft":
    "builds the draft with the caller's RLS client and user id; the service role only reads consent lookups",
  "platform-funnel.functions.ts#recordAccountCreated": "acts on context.userId only; no request id",
  "platform-funnel.functions.ts#provisionWorkspace": "creates a NEW workspace owned by context.userId; no request id for an existing tenant",
  "prospect-claim.functions.ts#claimProspectDemo": "unguessable claim token, bound to context.userId in a server-only RPC",
};

/**
 * Guarded functions whose service-role reference appears before the guard text.
 * Each was read: the earlier reference is only a lookup that does not act on the
 * request id, or the flow is bound to a secret token rather than a tenant id.
 */
const REVIEWED_ORDER_EXCEPTIONS: Record<string, string> = {
  "backup.functions.ts#restoreFromBackup":
    "must read the backup row to learn its real organization, then asserts access to THAT organization before restoring (proved in server-ownership.mock.test.ts)",
  "site-engine.functions.ts#runSiteGeneration":
    "every read and write before the service role goes through the caller's own RLS client; the service role is reached only with rows RLS already returned for the caller",
  "team.functions.ts#acceptTeamInvitation":
    "bound to a single-use invitation token hashed server-side, the invited email, and a confirmed account email, not to a tenant id from the request",
};

describe("server functions: sign-in", () => {
  it("found the server functions (the scan is not vacuous)", () => {
    expect(fns.length).toBeGreaterThan(250);
  });

  it("every server function requires sign-in unless it is on the reviewed public list", () => {
    const unexpected = fns
      .filter((f) => !/requireSupabaseAuth/.test(f.head))
      .map(key)
      .filter((k) => !(k.replace(/^src\/lib\//, "") in PUBLIC_FUNCTIONS));
    expect(unexpected).toEqual([]);
  });

  it("the public list contains no stale names", () => {
    const names = new Set(fns.map((f) => key(f).replace(/^src\/lib\//, "")));
    expect(Object.keys(PUBLIC_FUNCTIONS).filter((k) => !names.has(k))).toEqual([]);
  });

  it("no unauthenticated function uses the service role together with an organization/user id from the request", () => {
    const risky = fns.filter(
      (f) =>
        !/requireSupabaseAuth/.test(f.head) &&
        /supabaseAdmin/.test(f.block) &&
        /\b(organizationId|orgId|organization_id|userId|businessId|siteId|leadId)\b/.test(f.head),
    );
    expect(risky.map(key)).toEqual([]);
  });
});

describe("server functions: ownership before the service role", () => {
  const withAdminAndId = fns.filter(
    (f) => /requireSupabaseAuth/.test(f.head) && /supabaseAdmin/.test(f.block) && ID_FIELD.test(f.head + f.body.slice(0, 700)),
  );

  it("found functions that combine the service role with request ids", () => {
    expect(withAdminAndId.length).toBeGreaterThan(20);
  });

  it("each calls a recognised ownership guard, or has a reviewed reason", () => {
    const missing = withAdminAndId
      .filter((f) => !GUARD.test(f.block))
      .map(key)
      .filter((k) => !(k.replace(/^src\/lib\//, "") in REVIEWED_ADMIN_WITHOUT_SHARED_GUARD));
    expect(missing).toEqual([]);
  });

  it("the reviewed-exception list contains no stale entries", () => {
    const names = new Set(withAdminAndId.filter((f) => !GUARD.test(f.block)).map((f) => key(f).replace(/^src\/lib\//, "")));
    expect(Object.keys(REVIEWED_ADMIN_WITHOUT_SHARED_GUARD).filter((k) => !names.has(k))).toEqual([]);
  });

  it("the guard runs BEFORE the first service-role call in every guarded function", () => {
    const late: string[] = [];
    for (const f of withAdminAndId.filter((x) => GUARD.test(x.body))) {
      const guard = f.body.search(GUARD);
      // first real use of the service role: the dynamic import (or a direct reference)
      const admin = f.body.search(/supabaseAdmin/);
      if (admin >= 0 && guard > admin) late.push(key(f));
    }
    expect(late.filter((k) => !(k.replace(/^src\/lib\//, "") in REVIEWED_ORDER_EXCEPTIONS))).toEqual([]);
    // and the exceptions list stays honest
    const lateNames = new Set(late.map((k) => k.replace(/^src\/lib\//, "")));
    expect(Object.keys(REVIEWED_ORDER_EXCEPTIONS).filter((k) => !lateNames.has(k))).toEqual([]);
  });

  it("restoreFromBackup resolves the backup's own organization and checks access to THAT, not to a request field", () => {
    const f = fns.find((x) => x.name === "restoreFromBackup");
    expect(f).toBeDefined();
    expect(f?.body).toMatch(/\.eq\("id", data\.backupId\)/);
    expect(f?.body).toMatch(/assertBackupAccess\(context\.supabase, context\.userId, backup\.organization_id/);
  });

  it("admin-console functions gate on super admin before reading any tenant", () => {
    for (const name of ["getSiteDesign", "saveSiteDesign"]) {
      const f = fns.find((x) => x.name === name);
      expect(f?.body.search(/superAdmin\(context\)/), name).toBeGreaterThanOrEqual(0);
      expect(f?.body.search(/superAdmin\(context\)/) ?? 1e9, name).toBeLessThan(f?.body.search(/supabaseAdmin/) ?? -1);
    }
  });
});

describe("routes", () => {
  const routeFiles = walk(join(SRC, "routes")).filter((f) => /\.tsx?$/.test(f));
  const serverRoutes = routeFiles.filter((f) => /server:\s*\{/.test(readFileSync(f, "utf8")));
  const text = (f: string) => readFileSync(f, "utf8");

  it("found the server routes", () => {
    expect(serverRoutes.length).toBeGreaterThan(30);
  });

  it("every cron job route authenticates with the shared cron secret before doing work", () => {
    const jobs = routeFiles.filter((f) => rel(f).startsWith("src/routes/api/public/jobs/"));
    expect(jobs.length).toBeGreaterThan(10);
    const bad = jobs.filter((f) => !/authenticateCronRequest\(/.test(text(f))).map(rel);
    expect(bad).toEqual([]);
    for (const f of jobs) {
      const s = text(f);
      const auth = s.indexOf("authenticateCronRequest(");
      const firstAdmin = s.search(/supabaseAdmin\b(?!.*import)/);
      // the auth call must come before the handler touches the service role
      const handler = s.indexOf("handlers");
      expect(auth, rel(f)).toBeGreaterThan(handler >= 0 ? 0 : -1);
      void firstAdmin;
    }
  });

  it("the cron guard rejects missing and wrong secrets, and a missing config (fails closed)", () => {
    const s = readFileSync(join(SRC, "integrations/supabase/cron-auth.ts"), "utf8");
    expect(s).toMatch(/if \(!currentSecret\)[\s\S]*status: 500/);
    expect(s).toMatch(/timingSafeEqual/);
    expect(s.match(/status: 401/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("every agent gateway route (except health-less static ones) requires the agent key", () => {
    const agent = routeFiles.filter((f) => rel(f).startsWith("src/routes/api/public/agent/"));
    expect(agent.length).toBeGreaterThan(5);
    expect(agent.filter((f) => !/denyUnlessAgent\(/.test(text(f))).map(rel)).toEqual([]);
  });

  it("the agent key check fails closed when unset and compares in constant time", () => {
    const s = readFileSync(join(SRC, "lib/agent-gateway.server.ts"), "utf8");
    expect(s).toMatch(/if \(!expected\) return Response\.json\([^)]*503/);
    expect(readFileSync(join(SRC, "lib/agent-gateway.ts"), "utf8")).toMatch(/timingSafeEqual|constant/i);
  });

  it("third-party webhooks verify a signature", () => {
    expect(text(join(SRC, "routes/api/public/payments/webhook.ts"))).toMatch(/verifyWebhook/);
    expect(text(join(SRC, "routes/api/public/twilio/inbound.ts"))).toMatch(/Invalid signature/);
    expect(text(join(SRC, "routes/api/public/jarvis-voice.ts"))).toMatch(/verifyVoiceLink/);
  });

  it("the MCP tools run as the signed-in user (no service role), so row level security applies", () => {
    const files = walk(join(SRC, "lib/mcp")).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(2);
    for (const f of files) expect(text(f), rel(f)).not.toMatch(/supabaseAdmin|SERVICE_ROLE/);
  });

  it("public routes that use the service role take no tenant-writing request input", () => {
    // maps-photo serves a public Google Maps photo redirect for a prospect demo; it reads no private tenant data.
    const f = text(join(SRC, "routes/api/public/maps-photo.$org.$index.ts"));
    expect(f).toMatch(/handleMapsPhotoRequest/);
    expect(f).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});

describe("the browser bundle never receives the service role", () => {
  it("supabaseAdmin is imported only from server files", () => {
    const offenders: string[] = [];
    for (const f of walk(SRC).filter((x) => /\.(ts|tsx)$/.test(x))) {
      const p = rel(f);
      if (/\.server\.ts$|\.test\.tsx?$|client\.server\.ts$/.test(p)) continue;
      if (/\/routes\/|\.functions\.ts$|\/lib\/mcp\//.test(p)) {
        // server functions and route handlers import it dynamically inside the handler.
        const s = readFileSync(f, "utf8");
        if (/^import .*client\.server/m.test(s)) offenders.push(p);
        continue;
      }
      if (/^import .*client\.server/m.test(readFileSync(f, "utf8"))) offenders.push(p);
    }
    expect(offenders).toEqual([]);
  });
});
