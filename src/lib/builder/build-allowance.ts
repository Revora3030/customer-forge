// Mirrors the database rule that caps full site builds: at most
// DAILY_BUILD_LIMIT generation_jobs per workspace in any rolling 24 hours
// (public.enforce_daily_build_limit, BEFORE INSERT on generation_jobs). Every
// queued job counts, whatever its status, exactly like the trigger's count.
export const DAILY_BUILD_LIMIT = 5;
export const BUILD_WINDOW_MS = 24 * 60 * 60 * 1000;

export type BuildAllowance = { used: number; left: number; limit: number; nextFreeAt: Date | null };

export function buildAllowance(createdAts: ReadonlyArray<string | null | undefined>, now: number = Date.now()): BuildAllowance {
  const inWindow = createdAts
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((time) => Number.isFinite(time) && time > now - BUILD_WINDOW_MS && time <= now + 60_000)
    .sort((a, b) => a - b);
  const used = Math.min(inWindow.length, DAILY_BUILD_LIMIT);
  const left = Math.max(0, DAILY_BUILD_LIMIT - inWindow.length);
  // With every build used, the next one frees up when the oldest of the
  // newest DAILY_BUILD_LIMIT builds leaves the 24-hour window.
  const oldestCounted = inWindow.length >= DAILY_BUILD_LIMIT ? inWindow[inWindow.length - DAILY_BUILD_LIMIT] : undefined;
  return { used, left, limit: DAILY_BUILD_LIMIT, nextFreeAt: left === 0 && oldestCounted !== undefined ? new Date(oldestCounted + BUILD_WINDOW_MS) : null };
}

export function buildAllowanceText(allowance: BuildAllowance, formatTime: (date: Date) => string): string {
  if (allowance.left > 0) return `${allowance.left} of ${allowance.limit} builds left in the last 24 hours. Chat edits don't count.`;
  const when = allowance.nextFreeAt ? ` The next one frees up at ${formatTime(allowance.nextFreeAt)}.` : "";
  return `All ${allowance.limit} builds for the last 24 hours are used.${when} Chat edits still work.`;
}
