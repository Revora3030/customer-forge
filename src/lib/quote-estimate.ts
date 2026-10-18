/**
 * Recomputes a quote estimate from the owner's own quote form, on the server.
 *
 * The public quote calculator posted its own min/max, answer modifiers and
 * `estimatedValue`, and those were saved as-is — anyone could submit invented
 * amounts that landed in the owner's CRM, notifications and revenue figures.
 * The browser now only says WHICH options were picked; the prices come from
 * the database. The arithmetic mirrors the visible calculator exactly.
 */
export type QuoteFormRow = { base_price: number | string | null; min_price: number | string | null; max_price: number | string | null };
export type QuoteQuestionRow = { id: string; label: string };
export type QuoteOptionRow = { question_id: string; label: string; price_modifier: number | string; modifier_type: string | null };
export type QuoteAddonRow = { label: string; price: number | string };
export type SubmittedAnswer = { question: string; answer: string };

const n = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

/** One picked answer: the owner's modifier and how it applies. */
export type QuotePick = { modifier: number | string; type: string | null | undefined };

/**
 * The estimate arithmetic, shared by the visible calculator and the server
 * recompute so the two can never drift apart. Answers apply in question order
 * (add or multiply), then add-ons; the range is ±10%/+15% inside the owner's
 * min/max. Prices are the owner's only — nothing here invents an amount.
 */
export function estimateQuote(input: {
  base: number | string | null | undefined;
  min: number | string | null | undefined;
  max: number | string | null | undefined;
  picks: readonly QuotePick[];
  addons: readonly (number | string)[];
}): { total: number; min: number; max: number } {
  let total = n(input.base);
  for (const pick of input.picks) {
    const modifier = n(pick.modifier);
    total = pick.type === "multiply" ? total * modifier : total + modifier;
  }
  for (const price of input.addons) total += n(price);
  const min = Math.max(n(input.min), Math.round(total * 0.9));
  const ceiling = n(input.max) || total * 1.15;
  const max = Math.max(min, Math.round(Math.min(ceiling, total * 1.15)));
  return { total, min, max };
}

/** A quote form a visitor can actually finish: at least one question with options to choose. */
export function isUsableQuote(questions: readonly { options?: readonly unknown[] | null }[] | null | undefined): boolean {
  return (questions ?? []).some((question) => (question.options?.length ?? 0) > 0);
}

export function recomputeQuote(input: {
  form: QuoteFormRow;
  questions: QuoteQuestionRow[];
  options: QuoteOptionRow[];
  addons: QuoteAddonRow[];
  answers: SubmittedAnswer[];
}): { min: number; max: number; answers: { question: string; answer: string; modifier: number }[] } {
  const verified: { question: string; answer: string; modifier: number }[] = [];
  const picks: QuotePick[] = [];
  const addonPrices: number[] = [];
  const usedAddons = new Set<string>();
  for (const question of input.questions) {
    const picked = input.answers.find((answer) => answer.question === question.label);
    if (!picked) continue;
    const option = input.options.find(
      (candidate) => candidate.question_id === question.id && candidate.label === picked.answer,
    );
    if (!option) continue;
    const modifier = n(option.price_modifier);
    picks.push({ modifier, type: option.modifier_type });
    verified.push({ question: question.label, answer: option.label, modifier });
  }
  for (const answer of input.answers) {
    if (answer.question !== "Add-on" || usedAddons.has(answer.answer)) continue;
    const addon = input.addons.find((candidate) => candidate.label === answer.answer);
    if (!addon) continue;
    usedAddons.add(addon.label);
    addonPrices.push(n(addon.price));
    verified.push({ question: "Add-on", answer: addon.label, modifier: n(addon.price) });
  }
  const { min, max } = estimateQuote({
    base: input.form.base_price,
    min: input.form.min_price,
    max: input.form.max_price,
    picks,
    addons: addonPrices,
  });
  return { min, max, answers: verified };
}
