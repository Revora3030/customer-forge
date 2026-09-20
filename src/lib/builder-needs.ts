/**
 * Which cards the builder shows — and nothing more.
 *
 * Pure decision logic so the workspace only surfaces a card when the real
 * workspace data says the website needs it. A healthy site returns [].
 */
export type BuilderNeedKey =
  | "answers"
  | "photos"
  | "look"
  | "domain"
  | "enquiries"
  | "broken";

export type BuilderNeedFacts = {
  canManage: boolean;
  /** Required answers still missing from setup. */
  requiredAnswers: number;
  pagesCount: number;
  mediaCount: number;
  /** Logo and brand colour both confirmed. */
  brandSet: boolean;
  publishState: string;
  domainVerified: boolean;
  /** Enquiry forms plus bookable services. */
  captureCount: number;
  failingChecks: number;
};

export function builderNeedKeys(facts: BuilderNeedFacts): BuilderNeedKey[] {
  if (!facts.canManage) return [];
  const built = facts.pagesCount > 0;
  const keys: BuilderNeedKey[] = [];
  if (facts.requiredAnswers > 0) keys.push("answers");
  if (built && facts.mediaCount === 0) keys.push("photos");
  if (built && !facts.brandSet) keys.push("look");
  if (facts.publishState === "published" && !facts.domainVerified) keys.push("domain");
  if (built && facts.captureCount === 0) keys.push("enquiries");
  if (facts.failingChecks > 0) keys.push("broken");
  return keys;
}
