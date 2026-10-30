/**
 * Trial-length drift guard. The owner rule is a 3-day, no-card, full-access
 * free trial. `FULL_ACCESS_TRIAL_DAYS` in offer.ts is the only place that
 * number may live; every label, email, prompt and trial stamp derives from it.
 *
 * This exists because the growth-assessment email hard-coded
 * "Start 1 day of free full access" during the September 1-day experiment and
 * kept saying it after the trial went back to 3 days.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FULL_ACCESS_TRIAL_DAYS, GROWTH_SYSTEM } from "@/lib/offer";
import { TRIAL_DAYS, newTrialEndsAt } from "@/lib/trial";
import { REVORA_OFFER, formatRevoraOffer } from "@/lib/jarvis-acquisition-policy";
import { OFFER_LOCKED_NOTE } from "@/lib/agent-authority";
import { template as assessmentEmail } from "@/lib/email-templates/growth-assessment";

const OWNER_TRIAL_DAYS = 3;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === "migrations") continue;
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|md)$/.test(name) && !/\.(test|spec|e2e)\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const NUM = String.raw`(\d+|one|two|three|four|five|six|seven|ten|fourteen|thirty|a single)`;
const UNIT = String.raw`(day|days|hour|hours|week|weeks)`;
const ACCESS = String.raw`(free|trial|full[ -]access|full[ -]system access)`;
// "N days of free full access", "1-day full-access trial", "free for 7 days",
// "trial ... 24 hours". Kept to one line and a short gap so unrelated numbers
// on the same line are not pulled in.
const LENGTH_THEN_ACCESS = new RegExp(String.raw`\b${NUM}[ -]${UNIT}\b[^\n.;]{0,25}?\b${ACCESS}`, "gi");
const ACCESS_THEN_LENGTH = new RegExp(String.raw`\b${ACCESS}\b[^\n.;]{0,25}?\b${NUM}[ -]${UNIT}\b`, "gi");

// The free FIRST MONTH of the paid plan is a different, 30-day thing.
const FIRST_MONTH = /\b(30|thirty)[ -]days?\b|first month|month two/i;
// Reminder/expiry timing and unrelated windows, not the trial length itself.
const NOT_A_LENGTH = /\b(ends within|ending in the next|ahead by default|ago|before|after \d|in the last)\b/i;

function isOwnerLength(phrase: string): boolean {
  const m = phrase.match(new RegExp(String.raw`\b${NUM}[ -]${UNIT}\b`, "i"));
  if (!m) return true;
  return /^(3|three)$/i.test(m[1] ?? "") && /^days?$/i.test(m[2] ?? "");
}

describe("full-access trial length", () => {
  it("is exactly the owner's 3 days at the single source of truth", () => {
    expect(FULL_ACCESS_TRIAL_DAYS).toBe(OWNER_TRIAL_DAYS);
    expect(GROWTH_SYSTEM.fullAccessTrialDays).toBe(OWNER_TRIAL_DAYS);
    expect(GROWTH_SYSTEM.fullAccessWindow).toBe("3 days");
    expect(GROWTH_SYSTEM.fullAccessWindowUpper).toBe("3 DAYS");
    expect(GROWTH_SYSTEM.fullAccessWindowAdjective).toBe("3-day");
    expect(TRIAL_DAYS).toBe(OWNER_TRIAL_DAYS);
    expect(REVORA_OFFER.trialDays).toBe(OWNER_TRIAL_DAYS);
  });

  it("stamps new workspaces with a 3-day window", () => {
    const from = new Date("2026-10-30T12:00:00.000Z");
    expect(newTrialEndsAt(from)).toBe("2026-11-02T12:00:00.000Z");
  });

  it("says 3 days in the growth-assessment email button", () => {
    const html = renderToStaticMarkup(
      createElement(assessmentEmail.component as never, assessmentEmail.previewData as never),
    );
    expect(html).toContain("Start 3 days of free full access");
    expect(html).not.toMatch(/\b1 day\b/i);
  });

  it("says 3-day in the bot offer statements", () => {
    expect(formatRevoraOffer()).toContain("3-day full-access trial");
    expect(OFFER_LOCKED_NOTE).toContain("3-day full-access trial");
  });

  it("no copy in src, docs or the agent guides states any other trial length", () => {
    const files = [...sourceFiles("src"), ...sourceFiles("docs"), "CLAUDE.md", "AGENTS.md", "README.md"];
    const offenders: string[] = [];
    let seen = 0;
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const re of [LENGTH_THEN_ACCESS, ACCESS_THEN_LENGTH]) {
        for (const match of text.matchAll(re)) {
          const line = text.slice(text.lastIndexOf("\n", match.index) + 1, text.indexOf("\n", match.index));
          if (FIRST_MONTH.test(match[0]) || NOT_A_LENGTH.test(line)) continue;
          seen += 1;
          if (!isOwnerLength(match[0])) offenders.push(`${file}: ${match[0]}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
