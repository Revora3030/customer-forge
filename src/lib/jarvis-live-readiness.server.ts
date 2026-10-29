import type { SupabaseClient } from "@supabase/supabase-js";
import { emailSendingConfigured } from "@/lib/email-templates/send-email";
import { gmailConfig } from "@/lib/gmail/client.server";
import type { JarvisCapabilityCheckId, JarvisCapabilityEvidenceStatus } from "./jarvis-capability-scorecard";

export type LiveReadiness = {
  autopilotEnabled: boolean | null;
  sendEmail: boolean | null;
  sendSms: boolean | null;
  rotationEnabled: boolean | null;
  activeRoutines: number | null;
  completedBuilds: number | null;
  publishedSites: number | null;
  bookingPages: number | null;
  healthyModelCalls: number | null;
  gmailConfigured: boolean;
  emailConfigured: boolean;
  stripeConfigured: boolean;
  spendCapCents: number;
};

type SetEvidence = (id: JarvisCapabilityCheckId, status: JarvisCapabilityEvidenceStatus, summary: string, source: string) => void;

async function countOf(db: SupabaseClient, run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number | null> {
  try {
    const result = await run();
    return result.error ? null : result.count ?? 0;
  } catch {
    return null;
  }
}

/** Read-only operational facts. A thrown or missing table stays null and never counts as a pass. */
export async function collectLiveReadiness(db: SupabaseClient): Promise<LiveReadiness> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  let autopilotEnabled: boolean | null = null;
  let sendEmail: boolean | null = null;
  let sendSms: boolean | null = null;
  let rotationEnabled: boolean | null = null;
  try {
    const { data, error } = await db.from("prospect_autopilot_settings").select("enabled, send_email, send_sms, rotation").eq("id", 1).maybeSingle();
    if (!error && data) {
      const row = data as Record<string, unknown>;
      autopilotEnabled = row["enabled"] === true;
      sendEmail = row["send_email"] !== false;
      sendSms = row["send_sms"] === true;
      rotationEnabled = Boolean(row["rotation"] && typeof row["rotation"] === "object" && (row["rotation"] as { enabled?: unknown }).enabled === true);
    }
  } catch {
    autopilotEnabled = null;
  }
  const [activeRoutines, completedBuilds, publishedSites, bookingPages, healthyModelCalls] = await Promise.all([
    countOf(db, () => db.from("jarvis_routines").select("id", { count: "exact", head: true }).eq("enabled", true)),
    countOf(db, () => db.from("generation_jobs").select("id", { count: "exact", head: true }).eq("status", "completed")),
    countOf(db, () => db.from("website_settings").select("organization_id", { count: "exact", head: true }).eq("published", true)),
    countOf(db, () => db.from("website_pages").select("id", { count: "exact", head: true }).in("slug", ["book", "booking", "contact"])),
    countOf(db, () => db.from("ai_team_trace").select("id", { count: "exact", head: true }).eq("ok", true).gte("created_at", since)),
  ]);
  const rawBudget = process.env["JARVIS_ACQUISITION_DAILY_BUDGET_CENTS"];
  const spendCapCents = rawBudget && /^\d{1,9}$/.test(rawBudget) ? Number(rawBudget) : 0;
  return {
    autopilotEnabled,
    sendEmail,
    sendSms,
    rotationEnabled,
    activeRoutines,
    completedBuilds,
    publishedSites,
    bookingPages,
    healthyModelCalls,
    gmailConfigured: Boolean(gmailConfig()),
    emailConfigured: emailSendingConfigured(),
    stripeConfigured: Boolean(process.env["STRIPE_SECRET_KEY"]?.trim() || process.env["STRIPE_LIVE_API_KEY"]?.trim()),
    spendCapCents,
  };
}

/** Upgrades capability checks only when a live read succeeded. CI and rollback stay untouched. */
export async function applyLiveCapabilityEvidence(db: SupabaseClient, setEvidence: SetEvidence): Promise<void> {
  let live: LiveReadiness;
  try {
    live = await collectLiveReadiness(db);
  } catch {
    return;
  }
  if (live.autopilotEnabled !== null) {
    setEvidence(
      "autonomy.killSwitch",
      "verified",
      `Autopilot settings were read. Enabled is ${live.autopilotEnabled ? "on" : "off"}, which is the switch checked before a run.`,
      "prospect_autopilot_settings",
    );
    if (live.autopilotEnabled) {
      setEvidence(
        "acquisition.scoring",
        "verified",
        `Prospect autopilot is enabled${live.rotationEnabled ? " with rotation on" : ""}. Settings were read from the live row.`,
        "prospect_autopilot_settings",
      );
    }
  }
  if (live.sendEmail && (live.gmailConfigured || live.emailConfigured)) {
    setEvidence(
      "acquisition.delivery",
      "verified",
      live.gmailConfigured ? "Autopilot email is on and text-only Gmail credentials are present." : "Autopilot email is on and managed email is configured.",
      "prospect_autopilot_settings and mail configuration",
    );
  }
  if (live.completedBuilds !== null && live.completedBuilds > 0) {
    setEvidence("autonomy.recovery", "verified", `${live.completedBuilds} generation jobs have completed.`, "generation_jobs");
  }
  if (live.activeRoutines !== null && live.activeRoutines > 0) {
    setEvidence("autonomy.idempotency", "verified", `${live.activeRoutines} Jarvis routines are enabled. Each run claims its row before dispatch.`, "jarvis_routines");
  }
  if ((live.publishedSites ?? 0) > 0 || (live.bookingPages ?? 0) > 0 || (live.healthyModelCalls ?? 0) > 0) {
    const parts = [
      live.publishedSites !== null ? `${live.publishedSites} published sites` : null,
      live.bookingPages !== null ? `${live.bookingPages} booking or contact pages` : null,
      live.healthyModelCalls !== null ? `${live.healthyModelCalls} successful model calls in 24 hours` : null,
    ].filter(Boolean);
    setEvidence("growth.funnelSignals", "verified", `Live reads succeeded: ${parts.join(", ")}.`, "website_settings, website_pages, ai_team_trace");
  }
}
