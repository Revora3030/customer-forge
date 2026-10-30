/**
 * Owner-supplied trade calculator figures (quality bar #14).
 *
 * Price ranges, finance terms (APR, term lengths, deposit) and ROI inputs live
 * in the hosting section's existing `website_sections.settings` JSON under the
 * `calculator` key, so no migration is needed. Only the owner's settings panel
 * writes this key; the AI never authors it. Every figure is validated here and
 * anything missing or out of range is dropped, so a finance or ROI view only
 * appears when the owner actually supplied the data it needs.
 */

export type PriceRange = { label: string; min: number; max: number };
export type FinanceTerms = { apr: number; termsMonths: number[]; depositPercent?: number };
export type RoiInputs = {
  label?: string;
  /** Owner's figure per unit, e.g. nightly rate or monthly saving. */
  valuePerUnit: number;
  /** What one unit is, e.g. "night". */
  unit: string;
  /** Units available per year at 100% utilisation, e.g. 365 nights. */
  unitsPerYear: number;
  /** Owner's realistic utilisation band in percent, e.g. 45–80% occupancy. */
  utilizationMin: number;
  utilizationMax: number;
  upfrontCost?: number;
  annualCosts?: number;
};
export type TradeCalculatorData = {
  priceRanges?: PriceRange[];
  finance?: FinanceTerms;
  roi?: RoiInputs;
};

const MAX_MONEY = 100_000_000;

function money(value: unknown, { allowZero = false } = {}): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < 0 || n > MAX_MONEY || (!allowZero && n === 0)) return null;
  return Math.round(n * 100) / 100;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function readPriceRanges(raw: unknown): PriceRange[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ranges: PriceRange[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label = text(record["label"], 60);
    const min = money(record["min"]);
    const max = money(record["max"]);
    if (!label || min === null || max === null || max < min) continue;
    ranges.push({ label, min, max });
  }
  return ranges.length ? ranges : undefined;
}

function readFinance(raw: unknown): FinanceTerms | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const apr = money(record["apr"], { allowZero: true });
  if (apr === null || apr > 60) return undefined;
  const terms = Array.isArray(record["terms_months"]) ? record["terms_months"] : [];
  const termsMonths = [...new Set(terms.map(Number).filter((m) => Number.isInteger(m) && m >= 3 && m <= 360))]
    .sort((a, b) => a - b)
    .slice(0, 6);
  if (!termsMonths.length) return undefined;
  const deposit = money(record["deposit_percent"]);
  return { apr, termsMonths, ...(deposit !== null && deposit < 100 ? { depositPercent: deposit } : {}) };
}

function readRoi(raw: unknown): RoiInputs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const valuePerUnit = money(record["value_per_unit"]);
  const unit = text(record["unit"], 24);
  const unitsPerYear = Number(record["units_per_year"]);
  const lo = money(record["utilization_min"]);
  const hi = money(record["utilization_max"]);
  if (valuePerUnit === null || !unit) return undefined;
  if (!Number.isInteger(unitsPerYear) || unitsPerYear < 1 || unitsPerYear > 8760) return undefined;
  if (lo === null || hi === null || hi > 100 || lo > hi) return undefined;
  const label = text(record["label"], 60);
  const upfront = money(record["upfront_cost"]);
  const costs = money(record["annual_costs"]);
  return {
    ...(label ? { label } : {}),
    valuePerUnit,
    unit,
    unitsPerYear,
    utilizationMin: lo,
    utilizationMax: hi,
    ...(upfront !== null ? { upfrontCost: upfront } : {}),
    ...(costs !== null ? { annualCosts: costs } : {}),
  };
}

/** Validated owner calculator data from section settings, or null when the owner supplied none. */
export function readTradeCalculator(settings: unknown): TradeCalculatorData | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as Record<string, unknown>)["calculator"];
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const priceRanges = readPriceRanges(record["price_ranges"]);
  const finance = readFinance(record["finance"]);
  const roi = readRoi(record["roi"]);
  if (!priceRanges && !finance && !roi) return null;
  return { ...(priceRanges ? { priceRanges } : {}), ...(finance ? { finance } : {}), ...(roi ? { roi } : {}) };
}

/** Raw JSON shape stored under settings.calculator (snake_case, like other settings keys). */
export type StoredTradeCalculator = {
  price_ranges?: { label: string; min: number; max: number }[];
  finance?: { apr: number; terms_months: number[]; deposit_percent?: number };
  roi?: {
    label?: string;
    value_per_unit: number;
    unit: string;
    units_per_year: number;
    utilization_min: number;
    utilization_max: number;
    upfront_cost?: number;
    annual_costs?: number;
  };
};

/** Writes (or with null, removes) the owner's calculator data, keeping every other settings key. */
export function writeTradeCalculator(settings: unknown, data: TradeCalculatorData | null): Record<string, unknown> {
  const base = settings && typeof settings === "object" ? { ...(settings as Record<string, unknown>) } : {};
  delete base["calculator"];
  if (!data) return base;
  const stored: StoredTradeCalculator = {};
  if (data.priceRanges?.length) stored.price_ranges = data.priceRanges.map((r) => ({ ...r }));
  if (data.finance) {
    stored.finance = {
      apr: data.finance.apr,
      terms_months: [...data.finance.termsMonths],
      ...(data.finance.depositPercent !== undefined ? { deposit_percent: data.finance.depositPercent } : {}),
    };
  }
  if (data.roi) {
    const r = data.roi;
    stored.roi = {
      ...(r.label ? { label: r.label } : {}),
      value_per_unit: r.valuePerUnit,
      unit: r.unit,
      units_per_year: r.unitsPerYear,
      utilization_min: r.utilizationMin,
      utilization_max: r.utilizationMax,
      ...(r.upfrontCost !== undefined ? { upfront_cost: r.upfrontCost } : {}),
      ...(r.annualCosts !== undefined ? { annual_costs: r.annualCosts } : {}),
    };
  }
  // Round-trip through the reader so only valid figures are ever stored.
  const clean = readTradeCalculator({ calculator: stored });
  if (!clean) return base;
  base["calculator"] = stored;
  return base;
}

/** Standard amortised monthly payment. APR 0 divides evenly. */
export function monthlyPayment(principal: number, aprPercent: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0;
  const r = aprPercent / 100 / 12;
  const raw = r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
  return Math.round(raw * 100) / 100;
}

/** Amount financed after the owner's deposit percentage. */
export function financedAmount(price: number, depositPercent = 0): number {
  return Math.round(price * (1 - depositPercent / 100) * 100) / 100;
}

export type RoiProjection = { annualIncome: number; annualNet: number; paybackYears: number | null };

/** Annual income at a utilisation (clamped into the owner's band), net of owner costs, with payback. */
export function roiProjection(roi: RoiInputs, utilization: number): RoiProjection {
  const pct = Math.min(roi.utilizationMax, Math.max(roi.utilizationMin, utilization));
  const annualIncome = Math.round(roi.valuePerUnit * roi.unitsPerYear * (pct / 100));
  const annualNet = annualIncome - Math.round(roi.annualCosts ?? 0);
  const paybackYears = roi.upfrontCost && annualNet > 0 ? Math.round((roi.upfrontCost / annualNet) * 10) / 10 : null;
  return { annualIncome, annualNet, paybackYears };
}

/** Parses the owner panel's "Label | min | max" lines. Invalid lines are skipped. */
export function parsePriceRangeLines(input: string): PriceRange[] {
  return input
    .split(/\n+/)
    .map((line) => line.split("|").map((part) => part.trim()))
    .flatMap(([label, min, max]) => readPriceRanges([{ label, min, max }]) ?? []);
}

export function formatPriceRangeLines(ranges: PriceRange[] | undefined): string {
  return (ranges ?? []).map((r) => `${r.label} | ${r.min} | ${r.max}`).join("\n");
}

/** Parses the owner finance fields; returns undefined unless APR and at least one term are valid. */
export function parseFinanceFields(apr: string, terms: string, deposit: string): FinanceTerms | undefined {
  if (!apr.trim()) return undefined;
  return readFinance({
    apr,
    terms_months: terms.split(/[,\s]+/).filter(Boolean),
    ...(deposit.trim() ? { deposit_percent: deposit } : {}),
  });
}

/** Parses the owner ROI fields; returns undefined unless every required input is valid. */
export function parseRoiFields(fields: Record<string, string>): RoiInputs | undefined {
  if (!fields["value_per_unit"]?.trim()) return undefined;
  const raw: Record<string, unknown> = { ...fields };
  for (const key of ["upfront_cost", "annual_costs", "label"]) if (!fields[key]?.trim()) delete raw[key];
  return readRoi(raw);
}

/** True when a section's composition places a price calculator widget the owner figures can attach to. */
export function settingsHostCalculator(kind: string, settings: unknown): boolean {
  if (kind === "quote") return true;
  if (kind !== "composition" || !settings || typeof settings !== "object") return false;
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== "object") return false;
    const record = node as Record<string, unknown>;
    if (record["type"] === "widget" && (record["text"] === "service_estimator" || record["text"] === "quote_calculator")) return true;
    for (const value of Object.values(record)) {
      if (Array.isArray(value) && value.some(walk)) return true;
      if (value && typeof value === "object" && !Array.isArray(value) && walk(value)) return true;
    }
    return false;
  };
  return walk((settings as Record<string, unknown>)["composition"]);
}

export type CalculatorView = "estimate" | "finance" | "roi";

/** Views to offer, in order. The estimate (existing estimator) is always first when present. */
export function calculatorViews(data: TradeCalculatorData, hasEstimator: boolean): CalculatorView[] {
  const views: CalculatorView[] = [];
  if (hasEstimator || data.priceRanges?.length) views.push("estimate");
  if (data.finance) views.push("finance");
  if (data.roi) views.push("roi");
  return views;
}
