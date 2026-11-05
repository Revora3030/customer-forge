import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  MISSED_LEAD_FIXED_ASSUMPTIONS,
  missedLeadAllCopy,
  missedLeadInputLines,
} from "@/lib/missed-lead-copy";

const INPUT = {
  enquiriesPerWeek: 20,
  missedPercent: 25,
  closeRatePercent: 40,
  averageJobValue: 450,
};

const BANNED = [/money you lost/i, /you('ve| have)? lost/i, /\bwasted\b/i, /\bguarantee/i];

describe("missed-lead calculator copy (BRF-07)", () => {
  it("never says money was lost or promises a recovery", () => {
    const copy = missedLeadAllCopy(INPUT);
    for (const re of BANNED) expect(copy).not.toMatch(re);
  });

  it("the page source does not use the banned wording either", () => {
    const page = readFileSync("src/routes/tools.tsx", "utf8");
    const section1 = page.slice(
      page.indexOf("{MISSED_LEAD_HEADING}"),
      page.indexOf("2. What a lead is worth"),
    );
    for (const re of BANNED) expect(section1).not.toMatch(re);
    expect(section1).not.toMatch(/Lost revenue|Lost jobs/);
  });

  it("states its assumptions and echoes the visitor's own inputs", () => {
    expect(MISSED_LEAD_FIXED_ASSUMPTIONS.length).toBeGreaterThanOrEqual(4);
    const joined = MISSED_LEAD_FIXED_ASSUMPTIONS.join(" ");
    expect(joined).toMatch(/same rate/);
    expect(joined).toMatch(/52 ÷ 12/);
    expect(joined).toMatch(/revenue/i);
    expect(missedLeadInputLines(INPUT)).toEqual([
      "20 calls and form enquiries per week",
      "25% of them unanswered or answered late",
      "40% of answered enquiries become jobs",
      "$450 average job value",
    ]);
  });
});
