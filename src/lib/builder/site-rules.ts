/**
 * "RULES FOR MY SITE" — one block of plain-language rules the owner writes
 * themselves (words never to use, tone of voice, service area, ...).
 *
 * Unlike remembered facts, which Revora records as it goes, these are written
 * by the owner, are always handed to the AI with every build, and can be
 * edited or deleted at any time. They steer wording and style only: they never
 * make a claim true and never override what the live website or the business
 * profile say.
 *
 * Pure functions only — no database, no network.
 */

export const SITE_RULES_LIMIT = 2000;

/** Tidies what the owner typed without changing what they said. */
export function normalizeSiteRules(input: unknown): string {
  if (typeof input !== "string") return "";
  return (
    input
      .replace(/\r\n?/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export type SiteRulesCheck = { ok: true; rules: string } | { ok: false; message: string };

/** Validates a save. Empty means "nothing to save" (use delete to clear). */
export function checkSiteRules(input: unknown): SiteRulesCheck {
  const rules = normalizeSiteRules(input);
  if (!rules)
    return { ok: false, message: "Write at least one rule, or delete the box to clear it." };
  if (rules.length > SITE_RULES_LIMIT) {
    return {
      ok: false,
      message: `Rules can be up to ${SITE_RULES_LIMIT.toLocaleString("en-US")} characters. Yours is ${rules.length.toLocaleString("en-US")} — shorten it by ${(rules.length - SITE_RULES_LIMIT).toLocaleString("en-US")}.`,
    };
  }
  return { ok: true, rules };
}

/** The standing brief handed to the AI, or null when the owner wrote none. */
export function siteRulesBrief(input: unknown): string | null {
  const rules = normalizeSiteRules(input).slice(0, SITE_RULES_LIMIT);
  if (!rules) return null;
  return [
    "RULES FOR THIS SITE, written by the owner. Always follow them when you write or change anything.",
    "They govern wording, tone and style only; they do not change what is true about the business.",
    "---",
    rules,
    "---",
  ].join("\n");
}
