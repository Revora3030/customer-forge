/**
 * THE TEST + INSPECT STAGE.
 *
 * After Revora writes to a website, it loads that website the way a visitor
 * would — over real HTTP, against the real rendered pages — and checks what came
 * back. Nothing here trusts the database: a row can be perfect while the page it
 * produces is broken, and this stage exists to catch exactly that.
 *
 * It is read-only and never touches another workspace: the slug and page list are
 * read through the caller's own session, so row level security decides which site
 * can be inspected at all.
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
  return process.env["NODE_ENV"] === "production" ? PLATFORM_ORIGIN : "http://localhost:8080";
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
 * Loads the workspace's own pages and reports what a visitor would actually
 * get. Returns `null` only when there is nothing reachable to check, so a
 * missing report is never mistaken for a pass.
 */
export async function verifyWorkspaceSite(
  supabase: unknown,
  organizationId: string,
): Promise<VerificationReport | null> {
  const client = supabase as Client;
  const [org, pages] = await Promise.all([
    client.from("organizations").select("slug, name").eq("id", organizationId).maybeSingle(),
    client
      .from("website_pages")
      .select("slug, title, kind, is_visible, sort_order")
      .eq("organization_id", organizationId)
      .eq("is_visible", true)
      .order("sort_order"),
  ]);

  const slug = String(org.data?.["slug"] ?? "");
  if (!slug) return null;

  const base = origin();
  // Inspect the whole visible site, with a hard cap so verification stays fast
  // even for large workspaces. This is intentionally broader than the old
  // four-page sample: a successful home page must not hide a broken inner page.
  const list = (pages.data ?? []).slice(0, 8);
  const home = list.find((page) => page["kind"] === "home") ?? list[0];
  const targets: { path: string; label: string }[] = [
    { path: `/s/${slug}`, label: String(home?.["title"] ?? "Home") },
    ...list
      .filter((page) => page !== home && page["slug"])
      .slice(0, 7)
      .map((page) => ({
        path: `/s/${slug}/${String(page["slug"])}`,
        label: String(page["title"] ?? page["slug"]),
      })),
  ];

  const checks: Check[] = [];
  const linkTargets = new Set<string>();

  for (const target of targets) {
    const { status, html } = await load(`${base}${target.path}`);
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

  // Every menu and button link on those pages is followed once, so a change can
  // never quietly leave a dead end behind.
  const known = new Set(targets.map((target) => target.path));
  const followable = [...linkTargets].filter((link) => !known.has(link)).slice(0, 16);
  for (const link of followable) {
    const { status } = await load(`${base}${link}`, 6000);
    checks.push({
      label: "Every link on the site goes somewhere real",
      ok: status === 200,
      severity: status === 200 ? "warning" : "critical",
      where: link,
      ...(status === 200 ? {} : { detail: status ? `answered ${status}` : "did not answer" }),
    });
  }

  if (!checks.length) return null;
  return summarise(checks);
}

export type { VerificationReport };
