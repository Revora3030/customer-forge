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
