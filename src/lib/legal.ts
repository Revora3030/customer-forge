/**
 * Facts the legal pages (privacy policy, terms) depend on, in one place.
 *
 * REVIEW WITH A LAWYER BEFORE RELYING ON THIS. The policies describe what the
 * code actually does; they do not claim compliance with any specific law.
 *
 * Revora Growth Systems currently has no legal entity (the previous LLC was
 * dissolved and a new one is being formed). Until it exists, `entityName`
 * stays null and the pages say so plainly. Never put a guessed entity name
 * here: set it only once the new LLC is registered.
 */
export const LEGAL = {
  /** Trading name used everywhere. */
  tradingName: "Revora Growth Systems",
  /** PLACEHOLDER — set to the registered LLC name once it is formed. */
  entityName: null as string | null,
  /** Where the business is run from (no public street address). */
  location: "Raleigh, North Carolina, USA",
  /** Bump whenever the text of /privacy or /terms changes materially. */
  privacyLastUpdated: "November 1, 2026",
  termsLastUpdated: "November 1, 2026",
} as const;

/** "Revora Growth Systems (legal entity: …)" — honest while no LLC exists. */
export function operatorStatement(): string {
  return LEGAL.entityName
    ? `${LEGAL.tradingName} is a trading name of ${LEGAL.entityName}.`
    : `${LEGAL.tradingName} is operated from ${LEGAL.location}. [Legal entity name to be added here once the new company is registered.]`;
}
