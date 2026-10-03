/**
 * THE TEST + INSPECT STAGE.
 *
 * After Revora writes to a website, it loads that website the way a visitor
 * would — over real HTTP, against the real rendered pages — and checks what came
 * back. Nothing here trusts the database: a row can be perfect while the page it
 * produces is broken, and this stage exists to catch exactly that.
 *
 * A website is unpublished for most of its life. Its public address answers 404
 * by design until the owner launches, so checking the public address for a draft
 * proves nothing and must never be read as a fault: it used to reverse every
 * good change an owner made before launch. A draft is therefore checked through
 * its own private, short-lived draft render instead, and any remaining public
 * address check is only ever critical once the site is actually published.
 *
 * It is read-only for the workspace's content and never touches another
 * workspace: the slug and page list are read through the caller's own session,
 * so row level security decides which site can be inspected at all.
 */

import { PLATFORM_ORIGIN } from "@/lib/revora-address";
import { inspectHtml, summarise, type Check, type VerificationReport } from "@/lib/agent/verify";

type Client = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null }>;
        eq: (
          column: string,
          value: unknown,
        ) => {
          order: (column: string) => PromiseLike<{ data: Record<string, unknown>[] | null }>;
        };
      };
    };
  };
};

/** Where the running server can reach itself. */
function origin() {
  const explicit = process.env["REVORA_VERIFY_ORIGIN"];
  if (explicit) return explicit.replace(/\/$/, "");
  // Check the deployment that is actually running this code. Fetching the
  // marketing domain from a preview/staging build, or mid-rollout, inspected a
  // different copy of the site and reversed changes on false failures.
  try {
    const { getRequest } = requestModule ?? {};
    const current = getRequest?.();
    if (current?.url) return new URL(current.url).origin;
  } catch {
    // No active request (background job) — fall through.
  }
  const app = process.env["APP_URL"];
  if (app) return app.replace(/\/$/, "");
  return process.env["NODE_ENV"] === "production" ? PLATFORM_ORIGIN : "http://localhost:8080";
}

let requestModule: { getRequest?: () => Request } | null = null;
async function loadRequestModule() {
  if (requestModule) return;
  try {
    requestModule = (await import("@tanstack/react-start/server")) as unknown as { getRequest?: () => Request };
  } catch {
    requestModule = {};
  }
}

async function load(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "RevoraAgentVerifier/1.0" },
    });
    return { status: response.status, html: response.ok ? await response.text() : "" };
  } catch {
    return { status: 0, html: "" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mints a private draft render link that lives for a couple of minutes and is
 * switched off again the moment the check finishes. It exists only so the
 * checker can load the owner's unpublished pages over real HTTP.
 */
async function openDraftWindow(organizationId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await supabaseAdmin
      .from("website_preview_links")
      .insert({
        organization_id: organizationId,
        token,
        label: "Automatic quality check",
        expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) return null;
    return {
      token,
      close: async () => {
        await supabaseAdmin
          .from("website_preview_links")
          .update({ revoked: true })
          .eq("id", data.id as string);
      },
    };
  } catch {
    return null;
  }
}

/**
 * Loads the workspace's own pages and reports what a visitor would actually
 * get. Returns `null` only when there is nothing reachable to check, so a
 * missing report is never mistaken for a pass.
 */
export async function verifyWorkspaceSite(
  supabase: unknown,
  organizationId: string,
): Promise<VerificationReport | null> {
  const client = supabase as Client;
  await loadRequestModule();
  const [org, pages, gate] = await Promise.all([
    client.from("organizations").select("slug, name").eq("id", organizationId).maybeSingle(),
    client
      .from("website_pages")
      .select("slug, title, kind, is_visible, sort_order")
      .eq("organization_id", organizationId)
      .eq("is_visible", true)
      .order("sort_order"),
    client
      .from("website_settings")
      .select("publish_state")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const slug = String(org.data?.["slug"] ?? "");
  if (!slug) return null;

  // Published sites are served on their public address. A draft is not, and
  // that is correct behaviour rather than a problem with the owner's change.
  const published = String(gate.data?.["publish_state"] ?? "") === "published";

  const base = origin();
  // Inspect every visible page: a successful home page must not hide a broken
  // inner page, and no page is skipped to save time.
  const list = pages.data ?? [];
  const home = list.find((page) => page["kind"] === "home") ?? list[0];

  const checks: Check[] = [];
  const linkTargets = new Set<string>();

  // A saved layout that fails validation is not drawn (never replaced with a
  // substitute design) — so it must be reported here, or a whole section can
  // disappear without anyone noticing.
  const sections = await client
    .from("website_sections")
    .select("id, kind, settings, is_visible")
    .eq("organization_id", organizationId)
    .eq("is_visible", true)
    .order("sort_order");
  const { validateComposition } = await import("@/lib/builder/composition-tree");
  const { isRenderableSectionKind } = await import("@/lib/builder/renderable-sections");
  // An AI-invented section that never became a drawable layout would vanish
  // silently on the live page. Report it so the AI redesigns it instead.
  for (const section of (sections.data ?? []) as Record<string, unknown>[]) {
    if (isRenderableSectionKind(section["kind"])) continue;
    checks.push({
      label: "Every section can be shown",
      ok: false,
      severity: "critical",
      where: String(section["id"]),
      detail: `the "${String(section["kind"])}" section has no layout yet, so visitors would not see it`,
    });
  }
  for (const section of ((sections.data ?? []) as Record<string, unknown>[]).filter(
    (row) => row["kind"] === "composition",
  )) {
    const raw = (section["settings"] as Record<string, unknown> | null)?.["composition"];
    const result = validateComposition(raw);
    checks.push({
      label: "Every section's layout can be shown",
      ok: result.ok,
      severity: "critical",
      where: String(section["id"]),
      ...(result.ok
        ? {}
        : { detail: result.issues.map((i) => `${i.path}: ${i.problem}`).join("; ") }),
    });
  }

  if (published) {
    const targets: { path: string; label: string }[] = [
      { path: `/s/${slug}`, label: String(home?.["title"] ?? "Home") },
      ...list
        .filter((page) => page !== home && page["slug"])
        .map((page) => ({
          path: `/s/${slug}/${String(page["slug"])}`,
          label: String(page["title"] ?? page["slug"]),
        })),
    ];

    for (const target of targets) {
      let { status, html } = await load(`${base}${target.path}`);
      // One slow or dropped response is not a broken page. Retry before a
      // failure can reverse the owner's change.
      for (let retry = 0; retry < 2 && (status !== 200 || !html) && status < 400; retry += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (retry + 1)));
        ({ status, html } = await load(`${base}${target.path}`, 12000));
      }
      if (status !== 200 || !html) {
        checks.push({
          label: "The page loads for visitors",
          ok: false,
          severity: "critical",
          where: target.label,
          detail: status ? `the server answered ${status}` : "the page did not answer",
        });
        continue;
      }
      checks.push({
        label: "The page loads for visitors",
        ok: true,
        severity: "critical",
        where: target.label,
      });
      const inspection = inspectHtml(html, target.label);
      checks.push(...inspection.checks);
      for (const link of inspection.links) linkTargets.add(link);
    }

    // Every menu and button link on those pages is followed once, so a change
    // can never quietly leave a dead end behind.
    const known = new Set(targets.map((target) => target.path));
    const followable = [...linkTargets].filter((link) => !known.has(link)).slice(0, 16);
    for (const link of followable) {
      let { status } = await load(`${base}${link}`, 6000);
      if (status === 0) ({ status } = await load(`${base}${link}`, 12000));
      checks.push({
        label: "Every link on the site goes somewhere real",
        ok: status === 200,
        // Only a definite 404/410 is a dead end worth reversing a change for;
        // a timeout or server hiccup is reported, not fatal.
        severity: status === 404 || status === 410 ? "critical" : "warning",
        where: link,
        ...(status === 200 ? {} : { detail: status ? `answered ${status}` : "did not answer" }),
      });
    }
  } else {
    // A draft is checked through its own private render. Nothing here can
    // reverse an owner's work just because the site is not live yet: a draft
    // window that cannot be opened is reported as "not checked", never failed.
    const window = await openDraftWindow(organizationId);
    if (!window) return null;
    try {
      const { status, html } = await load(`${base}/p/${window.token}`, 10000);
      if (status !== 200 || !html) {
        checks.push({
          label: "The draft website renders",
          ok: false,
          severity: "warning",
          where: String(home?.["title"] ?? "Home"),
          detail: status ? `the draft answered ${status}` : "the draft did not answer",
        });
      } else {
        checks.push({
          label: "The draft website renders",
          ok: true,
          severity: "critical",
          where: String(home?.["title"] ?? "Home"),
        });
        for (const check of inspectHtml(html, String(home?.["title"] ?? "Home")).checks) {
          checks.push(check);
        }
      }
    } finally {
      await window.close();
    }
  }

  if (!checks.length) return null;
  return summarise(checks);
}

export type { VerificationReport };
