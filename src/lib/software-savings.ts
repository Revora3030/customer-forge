import { GROWTH_SYSTEM } from "@/lib/offer";

/** Date (America/New_York) every price below was read from the vendor's public pricing page. */
export const PRICES_CHECKED_ISO = "2026-10-31";
export const PRICES_CHECKED_LABEL = "Oct 31, 2026";

/** Where one price was read: the vendor's own public pricing page. */
export type PriceSource = {
  vendor: string;
  /** The cheapest paid plan the price belongs to. */
  plan: string;
  url: string;
  /** What the price covers, shown next to it (for example the billing term or seat count). */
  basis: string;
};

/**
 * Software a local business commonly pays for that the Revora Growth System
 * covers. `typical` is a price we read from `source` (the vendor's public pricing
 * page, on PRICES_CHECKED_LABEL); it is the lowest published monthly figure for
 * that vendor's cheapest paid plan, never a measured or promised number. A tool
 * whose price we could not read from a public page has `typical: null` and no
 * source, so it is never counted in the comparison and never pre-filled: the
 * visitor ticks the tools they actually pay for and types their real bill.
 * Vendor names appear only where a verified source exists.
 */
export type SavingsTool = {
  id: string;
  label: string;
  /** Generic category wording only. Vendor names live in `source`. */
  example: string;
  typical: number | null;
  source?: PriceSource;
};

export const SAVINGS_TOOLS = [
  {
    id: "website",
    label: "Website builder / hosting",
    example: "Site builder or hosting plan",
    typical: 19,
    source: {
      vendor: "Squarespace",
      plan: "Basic",
      url: "https://www.squarespace.com/pricing",
      basis: "per month, billed annually (listed at $25 billed monthly)",
    },
  },
  {
    id: "scheduling",
    label: "Online scheduling",
    example: "Online booking page",
    typical: 10,
    source: {
      vendor: "Calendly",
      plan: "Standard",
      url: "https://calendly.com/pricing",
      basis: "per seat per month, billed yearly",
    },
  },
  {
    id: "forms",
    label: "Quote and contact forms",
    example: "Form builder",
    typical: 34,
    source: {
      vendor: "Jotform",
      plan: "Bronze",
      url: "https://www.jotform.com/pricing/",
      basis: "per month, billed yearly (listed at $39 billed monthly)",
    },
  },
  {
    id: "crm",
    label: "Lead tracking / CRM",
    example: "Lead or customer tracking",
    typical: 14,
    source: {
      vendor: "Pipedrive",
      plan: "Lite",
      url: "https://www.pipedrive.com/en/pricing",
      basis: "per seat per month, billed annually",
    },
  },
  {
    id: "email",
    label: "Email follow-up",
    example: "Email marketing tool",
    typical: 10.2,
    source: {
      vendor: "Constant Contact",
      plan: "Lite",
      url: "https://www.constantcontact.com/pricing",
      basis: "starting price per month, billed annually; the price rises with your contact count",
    },
  },
  {
    id: "automation",
    label: "Automation glue",
    example: "Workflow automation",
    typical: 19.99,
    source: {
      vendor: "Zapier",
      plan: "Professional, 750 tasks a month",
      url: "https://zapier.com/pricing",
      basis: "per month, billed annually (listed at $29.99 billed monthly)",
    },
  },
  // No public price found, so these are not counted and not pre-filled.
  { id: "reviews", label: "Review requests", example: "Review-request software", typical: null },
  { id: "agency", label: "Web agency or freelancer retainer", example: "Monthly maintenance", typical: null },
] as const satisfies readonly SavingsTool[];

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

export type VerifiedTool = {
  id: SavingsToolId;
  label: string;
  example: string;
  typical: number;
  source: PriceSource;
};

export type TypicalComparison = {
  /** Only tools with a price read from a public vendor page, in table order. */
  tools: VerifiedTool[];
  /** Labels of tools we could not price from a public page; excluded from every total. */
  unpriced: string[];
  /** Monthly total of the verified prices only. */
  toolsMonthly: number;
  toolsFirstYear: number;
  revoraFirstYear: number;
  /** First-year difference. Positive: Revora costs less. Negative: the tools alone cost less. */
  toolsDifference: number;
  /** True when the verified tools alone cost less than Revora's first year. */
  toolsCostLess: boolean;
  checked: string;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * A static, side-by-side of the verified list prices above against the
 * canonical offer, so the page shows the comparison before a visitor types
 * anything. Every figure derives from the sourced constants in this file and
 * the offer; anything without a verified source is left out of the totals.
 */
export function typicalComparison(): TypicalComparison {
  const tools: VerifiedTool[] = [];
  const unpriced: string[] = [];
  for (const tool of SAVINGS_TOOLS as readonly SavingsTool[]) {
    if (tool.typical !== null && tool.source) {
      tools.push({ id: tool.id as SavingsToolId, label: tool.label, example: tool.example, typical: tool.typical, source: tool.source });
    } else {
      unpriced.push(tool.label);
    }
  }
  const toolsMonthly = cents(tools.reduce((sum, tool) => sum + tool.typical, 0));
  const toolsFirstYear = cents(toolsMonthly * 12);
  const revoraFirstYear = GROWTH_SYSTEM.setupPrice + GROWTH_SYSTEM.monthlyPrice * 11;
  return {
    tools,
    unpriced,
    toolsMonthly,
    toolsFirstYear,
    revoraFirstYear,
    toolsDifference: cents(toolsFirstYear - revoraFirstYear),
    toolsCostLess: toolsFirstYear < revoraFirstYear,
    checked: PRICES_CHECKED_LABEL,
  };
}
