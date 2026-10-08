/**
 * Turns the apply pipeline's internal step labels into one plain sentence the
 * business owner can act on.
 *
 * The apply run records every outcome as a short code (`skipped
 * set_section:unresolved_section`, `stale set_component (component removed)`).
 * Those codes are honest but unreadable, so an owner who sees "42 of 60
 * applied" is left guessing. This maps the codes onto everyday language, with
 * no invention: a code it doesn't recognise is counted, never described.
 *
 * Pure and dependency-free so it can be unit tested and used on either side.
 */

/** Reason code → what actually happened, in the owner's words. */
const REASONS: Array<{ match: RegExp; text: string }> = [
  {
    match: /unresolved_(section|page|component)/,
    text: "some updates pointed at a part of your site that was never created",
  },
  {
    match: /cross_page_target|cross_section_target/,
    text: "a reordering step tried to move something between pages",
  },
  { match: /\(page removed\)|stale (add|set|move|remove)_page/, text: "a page had been removed" },
  { match: /\(section removed\)/, text: "a section had been removed" },
  { match: /\(component removed\)/, text: "an item on the page had been removed" },
  { match: /duplicate/, text: "the same change appeared twice" },
  {
    match: /generate_component_image:(generation|upload|media)_failed/,
    text: "a new picture couldn't be made or saved, so the current picture stayed",
  },
  { match: /generate_component_image:link_failed|link_generated_image/, text: "a new picture couldn't be placed on the page" },
  {
    match: /set_composition:would_remove_/,
    text: "a redesign would have removed a working form or contact block, so it was held back",
  },
];

/**
 * A skipped label with no reason code is a write the database refused (the
 * apply step records just the action name). That is still describable.
 */
const WRITE_FAILED = "some changes couldn't be saved just now";

export type ApplyOutcome = {
  /** How many steps reached the website. */
  applied: number;
  /** Steps that were attempted and did not write. */
  failed: number;
  /** Steps whose target no longer existed by the time apply ran. */
  stale: number;
  /** Raw per-step labels from the apply run. */
  details?: string[];
};

/** The reasons behind the skipped steps, deduplicated, in the owner's words. */
export function skippedReasons(details: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const line of details) {
    if (!/^(skipped|stale)\b/.test(line)) continue;
    let known = false;
    for (const reason of REASONS) {
      if (reason.match.test(line)) {
        known = true;
        if (!out.includes(reason.text)) out.push(reason.text);
      }
    }
    // "skipped set_design_tokens" — a bare action name means the write failed.
    if (!known && /^skipped [a-z_]+$/.test(line.trim()) && !out.includes(WRITE_FAILED)) out.push(WRITE_FAILED);
  }
  return out;
}

/**
 * One sentence explaining a partly-applied plan, or an empty string when
 * everything landed. Never claims a cause it cannot see in the labels.
 */
export function applySummary(outcome: ApplyOutcome): string {
  const skipped = (outcome.failed ?? 0) + (outcome.stale ?? 0);
  if (skipped <= 0) return "";
  const total = outcome.applied + skipped;
  const head = `${outcome.applied} of ${total} update${total === 1 ? "" : "s"} reached your website`;
  const reasons = skippedReasons(outcome.details);
  const tail = reasons.length
    ? ` — the other ${skipped} ${skipped === 1 ? "was" : "were"} skipped because ${reasons.join(", and ")}.`
    : ` — the other ${skipped} ${skipped === 1 ? "was" : "were"} skipped, so nothing was left half-finished.`;
  const fix = " Ask for the same change again and Revora will plan it against your site as it is now.";
  return head + tail + fix;
}
