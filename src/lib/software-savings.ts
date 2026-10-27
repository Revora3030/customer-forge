import { GROWTH_SYSTEM } from "@/lib/offer";

/**
 * Software a local business commonly pays for that the Revora Growth System
 * covers. `typical` is an editable starting figure (a typical entry-level list
 * price), never a measured or promised number: the visitor ticks the tools they
 * actually pay for and types their real bill.
 */
export const SAVINGS_TOOLS = [
  { id: "website", label: "Website builder / hosting", example: "Wix, Squarespace, Webflow", typical: 39 },
  { id: "scheduling", label: "Online scheduling", example: "Calendly, Acuity", typical: 30 },
  { id: "forms", label: "Quote and contact forms", example: "Typeform, Jotform", typical: 50 },
  { id: "crm", label: "Lead tracking / CRM", example: "HubSpot, Pipedrive", typical: 50 },
  { id: "email", label: "Email follow-up", example: "Mailchimp, Constant Contact", typical: 60 },
  { id: "automation", label: "Automation glue", example: "Zapier", typical: 49 },
  { id: "reviews", label: "Review requests", example: "Podium, Birdeye", typical: 99 },
  { id: "agency", label: "Web agency or freelancer retainer", example: "Monthly maintenance", typical: 500 },
] as const;

export type SavingsToolId = (typeof SAVINGS_TOOLS)[number]["id"];

export const MAX_TOOL_PRICE = 5000;

export type SavingsInput = Partial<Record<SavingsToolId, number | null | undefined>>;

export type SavingsResult = {
  /** Number of tools the visitor entered a bill for. */
  toolCount: number;
  /** Monthly cost of the tools the visitor said they pay for. */
  currentMonthly: number;
  /** Revora's monthly fee once the free first month ends. */
  revoraMonthly: number;
  /** Monthly difference from month two on: positive means Revora costs less. */
  monthlyDifference: number;
  /** First 12 months: tools paid for 12 months versus setup plus 11 paid months. */
  firstYearCurrent: number;
  firstYearRevora: number;
  firstYearDifference: number;
  /** True when the entered tools cost less than Revora, so the visitor should know. */
  revoraCostsMore: boolean;
};

/** Clamp one typed bill to a safe, whole-cent, non-negative number. */
export function cleanPrice(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(Math.min(n, MAX_TOOL_PRICE) * 100) / 100;
}

/**
 * Pure arithmetic on the visitor's own numbers against the canonical offer
 * (setup charged once, first month free, then the monthly fee). No performance
 * claim, no invented figure.
 */
export function computeSavings(input: SavingsInput): SavingsResult {
  let currentMonthly = 0;
  let toolCount = 0;
  for (const tool of SAVINGS_TOOLS) {
    const price = cleanPrice(input[tool.id]);
    if (price > 0) {
      currentMonthly += price;
      toolCount += 1;
    }
  }
  const revoraMonthly = GROWTH_SYSTEM.monthlyPrice;
  const firstYearCurrent = currentMonthly * 12;
  const firstYearRevora = GROWTH_SYSTEM.setupPrice + revoraMonthly * 11;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    toolCount,
    currentMonthly: round(currentMonthly),
    revoraMonthly,
    monthlyDifference: round(currentMonthly - revoraMonthly),
    firstYearCurrent: round(firstYearCurrent),
    firstYearRevora,
    firstYearDifference: round(firstYearCurrent - firstYearRevora),
    revoraCostsMore: toolCount > 0 && currentMonthly < revoraMonthly,
  };
}
