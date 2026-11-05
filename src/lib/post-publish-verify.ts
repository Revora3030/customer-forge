/**
 * Post-publish verification (TEN-06 item 25).
 *
 * Right after a publish, four things must be true for visitors:
 *   1. live_page       the live pages load and render (the existing smoke check);
 *   2. lead_recipient  an enquiry from the site reaches the owner's own alert inbox;
 *   3. tracking        the page-view tracking code is on the live page;
 *   4. mobile_overlay  nothing covers the page on a 390px phone (no build counter,
 *                      no owner "back to builder" pill, no text hidden under a layer).
 *
 * This module is pure so the rules are unit tested and identical everywhere: the
 * publish flow, the standalone `verifyLiveSite` (post-publish-verify.server.ts,
 * reused by PAI-19 self-QA) and the version list all read the same result.
 *
 * The per-publish pass/fail is `verification_status` ("passed" | "failed"), the
 * field name the site-versions list (NB7, item 17) already reads.
 */
import { alertInbox, alertRecipient, type LeadAlertProfile } from "@/lib/lead-alert-recipient";
import { checkMobile390, type Mobile390CheckId } from "@/lib/builder/quality/mobile-390";
import { extractFeatures, type SiteModel } from "@/lib/builder/quality/video-site-model";
import type { SmokeResult } from "@/lib/publish-smoke";

/** The one field name for the per-publish result. Agreed with NB7 (site versions). */
export const VERIFICATION_FIELD = "verification_status" as const;
export type VerificationStatus = "passed" | "failed";

export type PostPublishCheckId = "live_page" | "lead_recipient" | "tracking" | "mobile_overlay";
export const POST_PUBLISH_CHECKS: readonly PostPublishCheckId[] = ["live_page", "lead_recipient", "tracking", "mobile_overlay"];

export type PostPublishCheck = { id: PostPublishCheckId; ok: boolean; detail: string };

export type PostPublishResult = {
  [VERIFICATION_FIELD]: VerificationStatus;
  checks: PostPublishCheck[];
  checkedAt: string;
};

export type PostPublishInput = {
  /** The live-page smoke result; null when the site has no public address. */
  smoke: SmokeResult | null;
  /** HTML of the live home page, or null when it could not be read. */
  homeHtml: string | null;
  /** The owner's alert settings (business_profiles). */
  profile: LeadAlertProfile | null;
  /** The published version, as a site model; null when it could not be read. */
  site: SiteModel | null;
  /**
   * Optional: the result of the setup checklist's test lead (L12), when the
   * caller chose to send one. Without it the routing is checked from settings.
   */
  testLead?: { alertedTo: string | null } | null;
  now?: Date;
};

/** The 390px checks that mean something sits on top of the page. */
export const OVERLAY_CHECKS: readonly Mobile390CheckId[] = ["debug_overlay", "owner_pill", "covered_text"];

const FORM_KIND = /\b(contact|form|quote|estimate|booking|book|enquiry|inquiry|lead)\b/i;
const HTML_FORM = /<form[\s>]/i;
/** The site's script bundle; the page-view beacon (SitePageView) ships inside it. */
const APP_SCRIPT = /<script[^>]*\ssrc=["']?[^"'\s>]+\.m?js\b/i;

/** True when the live site offers a way to send an enquiry. */
export function siteHasEnquiryForm(site: SiteModel | null, homeHtml: string | null): boolean {
  if (homeHtml && HTML_FORM.test(homeHtml)) return true;
  return !!site?.sections.some((s) => FORM_KIND.test(s.kind) || (s.components ?? []).some((c) => FORM_KIND.test(c.kind)));
}

function livePage(smoke: SmokeResult | null): PostPublishCheck {
  if (!smoke) return { id: "live_page", ok: false, detail: "The site has no public address yet, so the live pages could not be checked." };
  const bad = smoke.checks.filter((c) => !c.ok);
  if (smoke.status === "passed" && !bad.length) return { id: "live_page", ok: true, detail: `${smoke.checks.length} live page(s) loaded.` };
  const first = bad.slice(0, 3).map((c) => `${c.path}: ${c.problem ?? "failed"}`);
  return { id: "live_page", ok: false, detail: `Live page problem: ${first.join("; ") || "no page answered"}.` };
}

function leadRecipient(input: PostPublishInput): PostPublishCheck {
  const profile = input.profile ?? {};
  const to = alertRecipient(profile);
  if (!to) {
    const off = profile.notify_on_lead === false && alertInbox(profile);
    return {
      id: "lead_recipient",
      ok: false,
      detail: off
        ? "New-lead alerts are switched off, so a form enquiry would not reach your inbox."
        : "No valid inbox is set for new-lead alerts, so a form enquiry would not reach you. Add one in Settings.",
    };
  }
  if (input.testLead) {
    const sent = input.testLead.alertedTo?.trim().toLowerCase() ?? null;
    if (sent === to.toLowerCase()) return { id: "lead_recipient", ok: true, detail: `Test lead alert accepted for ${to}.` };
    return {
      id: "lead_recipient",
      ok: false,
      detail: sent ? `The test lead alert went to ${sent}, not ${to}.` : `The test lead was saved, but the alert to ${to} was not accepted.`,
    };
  }
  if (!siteHasEnquiryForm(input.site, input.homeHtml)) {
    return { id: "lead_recipient", ok: true, detail: `No enquiry form on the live site; new-lead alerts go to ${to}.` };
  }
  return { id: "lead_recipient", ok: true, detail: `Form enquiries alert ${to}.` };
}

function tracking(homeHtml: string | null): PostPublishCheck {
  if (homeHtml === null) return { id: "tracking", ok: false, detail: "The live home page could not be read, so tracking could not be checked." };
  if (APP_SCRIPT.test(homeHtml)) return { id: "tracking", ok: true, detail: "Page-view tracking code is on the live page." };
  return { id: "tracking", ok: false, detail: "The live page has no script, so visits will not be counted." };
}

function mobileOverlay(site: SiteModel | null): PostPublishCheck {
  if (!site) return { id: "mobile_overlay", ok: false, detail: "The published version could not be read, so the phone view was not checked." };
  const found = checkMobile390(site, extractFeatures(site)).findings.filter((f) => OVERLAY_CHECKS.includes(f.id));
  if (!found.length) return { id: "mobile_overlay", ok: true, detail: "Nothing covers the page on a 390px phone." };
  return { id: "mobile_overlay", ok: false, detail: found.map((f) => f.detail).join(" ") };
}

export function evaluatePostPublish(input: PostPublishInput): PostPublishResult {
  const checks = [livePage(input.smoke), leadRecipient(input), tracking(input.homeHtml), mobileOverlay(input.site)];
  return {
    [VERIFICATION_FIELD]: checks.every((c) => c.ok) ? "passed" : "failed",
    checks,
    checkedAt: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * The newest stored result per published version, from `publish_events` rows
 * (newest first or in any order). Only "passed"/"failed" count; "pending" and
 * "skipped" mean there is no result.
 */
export function verificationByVersion(
  rows: readonly { version: number; smoke_status: string | null; created_at: string }[],
): Map<number, VerificationStatus> {
  const newest = new Map<number, { at: string; status: VerificationStatus }>();
  for (const row of rows) {
    if (row.smoke_status !== "passed" && row.smoke_status !== "failed") continue;
    const seen = newest.get(row.version);
    if (!seen || row.created_at > seen.at) newest.set(row.version, { at: row.created_at, status: row.smoke_status });
  }
  return new Map([...newest].map(([version, v]) => [version, v.status]));
}
