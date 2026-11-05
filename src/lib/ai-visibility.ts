/**
 * COMP-12 (free part): a prompt pack the owner pastes into any AI assistant,
 * plus a monthly mentioned / not-mentioned log they fill in themselves.
 * Nothing here queries an AI or claims anything about AI rankings; the trend
 * only counts what the owner recorded.
 */
export const PROMPT_COUNT = 5;

export type PromptInput = {
  industry: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  serviceArea: string | null | undefined;
};

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** "auto detailing" from "Auto Detailing"; null when the trade is unknown. */
export function tradePhrase(industry: string | null | undefined): string | null {
  const t = clean(industry).toLowerCase();
  return t && t !== "other" ? t : null;
}

/** "Raleigh, NC" style place, else the service area, else null. */
export function placePhrase(input: Pick<PromptInput, "city" | "state" | "serviceArea">): string | null {
  const city = clean(input.city);
  const state = clean(input.state);
  if (city) return state ? `${city}, ${state.length === 2 ? state.toUpperCase() : state}` : city;
  return clean(input.serviceArea) || null;
}

/** Five prompts, or null when trade or place is missing (never guessed). */
export function buildPromptPack(input: PromptInput): string[] | null {
  const trade = tradePhrase(input.industry);
  const place = placePhrase(input);
  if (!trade || !place) return null;
  return [
    `What is the best ${trade} business in ${place}?`,
    `Recommend a few ${trade} businesses in ${place}.`,
    `Who should I hire for ${trade} in ${place}?`,
    `Which ${trade} companies in ${place} have good reviews?`,
    `I need ${trade} in ${place} this week. Who can I contact?`,
  ];
}

/** First day of the month, YYYY-MM-01, in the given date's local calendar. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export type VisibilityRow = { month: string; prompt_index: number; mentioned: boolean };
export type MonthTrend = { month: string; mentioned: number; checked: number };

/** Per-month counts of what the owner recorded, oldest first. */
export function monthlyTrend(rows: readonly VisibilityRow[]): MonthTrend[] {
  const byMonth = new Map<string, MonthTrend>();
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? { month: r.month, mentioned: 0, checked: 0 };
    m.checked += 1;
    if (r.mentioned) m.mentioned += 1;
    byMonth.set(r.month, m);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}
