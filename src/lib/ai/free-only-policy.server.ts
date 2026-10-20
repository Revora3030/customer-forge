export type FreeOnlyEnvironment = Readonly<Record<string, string | undefined>>;

const FLAGS = ["AI_FREE_ONLY", "FREE_AI_ONLY", "ZERO_COST_ONLY"] as const;
const EXPLICIT_OFF = new Set(["false", "0", "no", "off"]);

/** Invalid/conflicting flags cannot enable paid routing. Eligibility is a separate gate. */
export function freeAiOnly(environment: FreeOnlyEnvironment = process.env): boolean {
  const declared = FLAGS.map((name) => environment[name]).filter(
    (value): value is string => value !== undefined,
  );
  return declared.length === 0 || declared.some((value) => !EXPLICIT_OFF.has(value.trim().toLowerCase()));
}

/**
 * Every purpose may use the paid collective within the existing spending
 * caps. Explicit free-only controls (including invalid/conflicting values)
 * still narrow access; purpose names never silently exclude specialists.
 */
export function paidCollectiveAllowed(
  _purpose: string,
  environment: FreeOnlyEnvironment = process.env,
): boolean {
  const declared = FLAGS.map((name) => environment[name]?.trim().toLowerCase()).filter(
    (value): value is string => value !== undefined && value !== "",
  );
  if (declared.some((value) => !EXPLICIT_OFF.has(value))) return false;
  const cap = environment["AI_PAID_DAILY_CAP_USD"]?.trim();
  const capOn = !cap || (Number.isFinite(Number(cap)) && Number(cap) > 0);
  return capOn;
}
