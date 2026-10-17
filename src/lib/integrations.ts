/**
 * Integration Center.
 *
 * One truthful view of everything Revora connects to for a workspace: payments,
 * email alerts, the client's own domain, HTTPS, search visibility, automation
 * delivery and the AI engine. Status is derived only from facts read out of the
 * database — nothing is ever reported as connected because it "should" be.
 */

export type IntegrationStatus = "connected" | "action_needed" | "not_connected" | "unknown";

export type IntegrationFacts = {
  /** organizations.setup_payment_status */
  setupPaymentStatus: string | null;
  /** organizations.subscription_status */
  subscriptionStatus: string | null;
  /** A verified alert destination exists for new enquiries. */
  leadAlertsEmail: string | null;
  leadAlertsEnabled: boolean;
  /** When the newest lead alert attempt was made, if any. */
  lastLeadAlertAt: string | null;
  /** lead_alert_log.status of the newest attempt ("sent" | "failed"). */
  lastLeadAlertStatus?: string | null;
  /** lead_alert_log.reason of the newest attempt, when it failed. */
  lastLeadAlertReason?: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  dnsOk: boolean;
  sslOk: boolean;
  domainError: string | null;
  published: boolean;
  lastPublishedAt: string | null;
  seoIndexable: boolean;
  activeAutomations: number;
  automationFailures: number;
  aiGenerationsLast30: number | null;
  /** null when a source couldn't be read; the card then says so. */
  unavailable: string[];
};

export type IntegrationCard = {
  key: string;
  name: string;
  status: IntegrationStatus;
  /** What is actually true right now, in plain language. */
  detail: string;
  /** The next concrete step, when one is needed. */
  action?: { label: string; to: string };
};

const label: Record<IntegrationStatus, string> = {
  connected: "Connected",
  action_needed: "Needs attention",
  not_connected: "Not connected",
  unknown: "Can't check right now",
};

export const integrationStatusLabel = (status: IntegrationStatus) => label[status];

export function buildIntegrationCards(facts: IntegrationFacts): IntegrationCard[] {
  const cards: IntegrationCard[] = [];
  const missing = (source: string) => facts.unavailable.includes(source);

  // Payments
  if (missing("billing")) {
    cards.push({
      key: "payments",
      name: "Payments (Stripe)",
      status: "unknown",
      detail: "Your billing record couldn't be read, so payment status isn't confirmed.",
      action: { label: "Open billing", to: "/app/billing" },
    });
  } else {
    const paid = facts.setupPaymentStatus === "paid";
    const sub = facts.subscriptionStatus ?? "";
    const subOk = sub === "active" || sub === "trialing";
    cards.push({
      key: "payments",
      name: "Payments (Stripe)",
      status: paid && subOk ? "connected" : paid || subOk ? "action_needed" : "not_connected",
      detail: paid
        ? subOk
          ? `Setup fee paid and the monthly plan is ${sub === "trialing" ? "in its free month" : "active"}.`
          : `Setup fee paid, but the monthly plan is ${sub || "not active"}.`
        : "The one-time setup payment hasn't gone through yet, so the live website stays locked.",
      ...(paid && subOk ? {} : { action: { label: "Open billing", to: "/app/billing" } }),
    });
  }

  // Lead alerts by email
  if (missing("profile")) {
    cards.push({
      key: "lead_alerts",
      name: "Enquiry email alerts",
      status: "unknown",
      detail: "Your business details couldn't be read, so alert delivery isn't confirmed.",
      action: { label: "Open settings", to: "/app/settings" },
    });
  } else if (!facts.leadAlertsEmail) {
    cards.push({
      key: "lead_alerts",
      name: "Enquiry email alerts",
      status: "not_connected",
      detail: "No email address is set, so nobody is told when a customer enquires.",
      action: { label: "Add your email", to: "/app/settings" },
    });
  } else if (!facts.leadAlertsEnabled) {
    cards.push({
      key: "lead_alerts",
      name: "Enquiry email alerts",
      status: "action_needed",
      detail: `Alerts to ${facts.leadAlertsEmail} are switched off.`,
      action: { label: "Turn alerts on", to: "/app/settings" },
    });
  } else if (
    facts.lastLeadAlertStatus === "failed" &&
    facts.lastLeadAlertReason === "recipient_suppressed"
  ) {
    // The inbox itself refuses mail; retrying the same address can't help.
    cards.push({
      key: "lead_alerts",
      name: "Enquiry email alerts",
      status: "action_needed",
      detail: `Alerts to ${facts.leadAlertsEmail} are being refused by that inbox. Add a different notification email.`,
      action: { label: "Change alert email", to: "/app/settings" },
    });
  } else if (facts.lastLeadAlertStatus === "failed") {
    cards.push({
      key: "lead_alerts",
      name: "Enquiry email alerts",
      status: "action_needed",
      detail: `Sending to ${facts.leadAlertsEmail}. Last alert failed (${facts.lastLeadAlertReason || "unknown reason"}).`,
      action: { label: "Open settings", to: "/app/settings" },
    });
  } else {
    // "Delivered" is claimed only when the newest attempt was accepted.
    const delivered = facts.lastLeadAlertStatus === "sent";
    cards.push({
      key: "lead_alerts",
      name: "Enquiry email alerts",
      status: "connected",
      detail: delivered
        ? `Sending to ${facts.leadAlertsEmail}. Last alert delivered successfully.`
        : facts.lastLeadAlertAt
          ? `Sending to ${facts.leadAlertsEmail}.`
          : `Sending to ${facts.leadAlertsEmail}. No enquiry has come in yet, so nothing has been sent.`,
    });
  }

  // Domain + HTTPS
  if (missing("website")) {
    cards.push({
      key: "domain",
      name: "Your domain",
      status: "unknown",
      detail: "Your website record couldn't be read, so domain status isn't confirmed.",
      action: { label: "Open domains", to: "/app/domain" },
    });
  } else if (!facts.customDomain) {
    cards.push({
      key: "domain",
      name: "Your domain",
      status: "not_connected",
      detail: "No domain is connected yet. Buy one from any registrar, then connect it here.",
      action: { label: "Connect a domain", to: "/app/domain" },
    });
  } else {
    const live = facts.domainVerified && facts.dnsOk && facts.sslOk;
    cards.push({
      key: "domain",
      name: `Your domain (${facts.customDomain})`,
      status: live ? "connected" : "action_needed",
      detail: live
        ? "DNS points to Revora and HTTPS is active, so your domain serves your website."
        : facts.domainError ||
          `Still finishing: DNS ${facts.dnsOk ? "verified" : "not verified"}, HTTPS ${facts.sslOk ? "active" : "not active"}.`,
      ...(live ? {} : { action: { label: "Finish setup", to: "/app/domain" } }),
    });
  }

  // Publishing / search visibility
  if (missing("website")) {
    cards.push({
      key: "search",
      name: "Search visibility",
      status: "unknown",
      detail: "Publishing status couldn't be read.",
    });
  } else if (!facts.published) {
    cards.push({
      key: "search",
      name: "Search visibility",
      status: "not_connected",
      detail: "Your website isn't published yet, so search engines can't find it.",
      action: { label: "Open builder", to: "/app/website" },
    });
  } else {
    cards.push({
      key: "search",
      name: "Search visibility",
      status: facts.seoIndexable ? "connected" : "action_needed",
      detail: facts.seoIndexable
        ? "Published with a sitemap and robots.txt search engines can read."
        : "Published, but pages are set to stay out of search results.",
      ...(facts.seoIndexable ? {} : { action: { label: "Review SEO", to: "/app/website" } }),
    });
  }

  // Automations
  if (missing("automations")) {
    cards.push({
      key: "automations",
      name: "Follow-up automations",
      status: "unknown",
      detail: "Automation runs couldn't be read.",
      action: { label: "Open automations", to: "/app/automations" },
    });
  } else if (facts.activeAutomations === 0) {
    cards.push({
      key: "automations",
      name: "Follow-up automations",
      status: "not_connected",
      detail: "No automation is switched on, so new enquiries get no automatic follow-up.",
      action: { label: "Turn one on", to: "/app/automations" },
    });
  } else {
    cards.push({
      key: "automations",
      name: "Follow-up automations",
      status: facts.automationFailures > 0 ? "action_needed" : "connected",
      detail:
        facts.automationFailures > 0
          ? `${facts.activeAutomations} running, but ${facts.automationFailures} recent message${facts.automationFailures === 1 ? "" : "s"} failed to send.`
          : `${facts.activeAutomations} automation${facts.activeAutomations === 1 ? "" : "s"} running and delivering.`,
      ...(facts.automationFailures > 0
        ? { action: { label: "See what failed", to: "/app/automations" } }
        : {}),
    });
  }

  // AI engine
  cards.push({
    key: "ai",
    name: "Revora AI engine",
    status: facts.aiGenerationsLast30 === null ? "unknown" : "connected",
    detail:
      facts.aiGenerationsLast30 === null
        ? "AI activity couldn't be read, but building and publishing don't depend on it."
        : facts.aiGenerationsLast30 === 0
          ? "Ready. Included in your plan — building and editing never cost extra."
          : `Used ${facts.aiGenerationsLast30} time${facts.aiGenerationsLast30 === 1 ? "" : "s"} in the last 30 days. Included in your plan.`,
  });

  return cards;
}

export function integrationSummary(cards: IntegrationCard[]) {
  const connected = cards.filter((card) => card.status === "connected").length;
  const needsAction = cards.filter((card) => card.status === "action_needed").length;
  const notConnected = cards.filter((card) => card.status === "not_connected").length;
  const unknown = cards.filter((card) => card.status === "unknown").length;
  return { total: cards.length, connected, needsAction, notConnected, unknown };
}
