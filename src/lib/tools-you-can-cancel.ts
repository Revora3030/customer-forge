/**
 * "Tools you can cancel": the owner types what they pay per month today for
 * the kinds of tools Revora's plan includes, and the card shows their own
 * monthly total minus Revora's price. There are no default or example dollar
 * amounts anywhere: an empty field counts as $0.
 *
 * Every row maps a feature that is on the /pricing "Everything included" list
 * (and has a working page in the app) to the kind of tool it replaces.
 */
import { GROWTH_SYSTEM } from "@/lib/offer";

export type CancelableTool = {
  key: string;
  /** Exact wording from GROWTH_SYSTEM.includes (the /pricing list). */
  feature: (typeof GROWTH_SYSTEM.includes)[number];
  /** The kind of tool it replaces. */
  replaces: string;
  /** Where the feature lives in the app. */
  to: string;
};

export const CANCELABLE_TOOLS: readonly CancelableTool[] = [
  { key: "website", feature: "Professional business website", replaces: "Website builder or website hosting", to: "/app/website" },
  { key: "forms", feature: "Lead capture system", replaces: "Website forms or lead capture tool", to: "/app/leads" },
  { key: "crm", feature: "CRM", replaces: "CRM or contact manager", to: "/app/leads" },
  { key: "booking", feature: "Online booking", replaces: "Online booking or scheduling tool", to: "/app/calendar" },
  { key: "quotes", feature: "Quote/request system", replaces: "Quote or estimate tool", to: "/app/quotes" },
  { key: "followup", feature: "Automated lead follow-up", replaces: "Follow-up email or automation tool", to: "/app/automations" },
  { key: "reviews", feature: "Review/reputation automation", replaces: "Review request tool", to: "/app/reviews" },
  { key: "analytics", feature: "Analytics and reporting", replaces: "Website analytics or reporting tool", to: "/app/analytics" },
  { key: "ai", feature: "AI-powered business tools", replaces: "AI assistant subscription", to: "/app/ai" },
];

const MAX_MONTHLY = 100_000;

/** Turns what the owner typed into dollars per month. Blank or invalid is $0. */
export function parseMonthly(input: string | null | undefined): number {
  const cleaned = String(input ?? "").replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(MAX_MONTHLY, Math.round(value * 100) / 100);
}

export type ToolsEntries = Record<string, string>;

export function toolsTotals(entries: ToolsEntries, revoraMonthly: number = GROWTH_SYSTEM.monthlyPrice) {
  const monthlyTotal =
    Math.round(
      CANCELABLE_TOOLS.reduce((sum, tool) => sum + parseMonthly(entries[tool.key]), 0) * 100,
    ) / 100;
  const net = Math.round((monthlyTotal - revoraMonthly) * 100) / 100;
  return { monthlyTotal, revoraMonthly, net, yearly: Math.round(net * 12 * 100) / 100 };
}

export const toolsStorageKey = (organizationId: string) => `revora.tools-cancel.v1.${organizationId}`;

/** Only known tool keys with plain text values survive a read. */
export function readEntries(raw: string | null): ToolsEntries {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ToolsEntries = {};
    for (const tool of CANCELABLE_TOOLS) {
      const value = (parsed as Record<string, unknown>)[tool.key];
      if (typeof value === "string") out[tool.key] = value.slice(0, 12);
    }
    return out;
  } catch {
    return {};
  }
}
