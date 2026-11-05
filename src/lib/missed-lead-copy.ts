/**
 * Wording for the free missed-lead calculator on /tools (BRF-07).
 *
 * Rules: the result is an ESTIMATE of revenue at risk built only from numbers
 * the visitor types. We never call it money "you lost" (we do not know that any
 * of it was lost), we never supply an industry average, and every assumption
 * behind the number is printed next to it.
 */
import { formatUsd, type MissedCallInput } from "@/lib/tools-calc";

export const MISSED_LEAD_HEADING = "What unanswered calls and forms could cost";

export const MISSED_LEAD_INTRO =
  "An estimate from your own numbers. The values pre-filled below are examples to replace, not industry averages.";

export const MISSED_LEAD_RESULT_LABELS = {
  missedPerWeek: "Unanswered per week",
  missedPerMonth: "Unanswered per month",
  jobsPerMonth: "Jobs possibly missed per month",
  revenuePerYear: "Revenue at risk per year",
} as const;

/** Fixed assumptions of the formula, in plain words. */
export const MISSED_LEAD_FIXED_ASSUMPTIONS: readonly string[] = [
  "An unanswered enquiry is assumed to book at the same rate as one you answer. Real rates are often different.",
  "It also assumes none of the people you missed called back or went on to book with you anyway.",
  "A month is 52 ÷ 12 weeks, and a year is 12 months. No seasonality or growth is applied.",
  "Figures are revenue (job value), not profit.",
  "The result is revenue at risk, not a measured loss and not a prediction of what you will recover.",
];

/** The visitor's own inputs, echoed back so the result can be checked by hand. */
export function missedLeadInputLines(input: MissedCallInput): string[] {
  return [
    `${input.enquiriesPerWeek} calls and form enquiries per week`,
    `${input.missedPercent}% of them unanswered or answered late`,
    `${input.closeRatePercent}% of answered enquiries become jobs`,
    `${formatUsd(input.averageJobValue)} average job value`,
  ];
}

/** Everything the page may say about this calculator; the test scans it for banned phrases. */
export function missedLeadAllCopy(input: MissedCallInput): string {
  return [
    MISSED_LEAD_HEADING,
    MISSED_LEAD_INTRO,
    ...Object.values(MISSED_LEAD_RESULT_LABELS),
    ...MISSED_LEAD_FIXED_ASSUMPTIONS,
    ...missedLeadInputLines(input),
  ].join("\n");
}
