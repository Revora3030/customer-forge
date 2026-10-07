/**
 * Turns the build's real progress stage into the one-line status floated on
 * the preview ("Sol is restyling Headline banner…"). Only stages the server
 * actually recorded are shown — nothing here is invented progress.
 */

const BY_STAGE: [RegExp, string, string][] = [
  [/picture|photo|image/i, "Luna", "making photos for"],
  [/review|safety|checking|contrast|quality|result/i, "Terra", "checking"],
  [/polish|design|layout|restyl|brand/i, "Sol", "designing"],
  [/writ|copy|wording/i, "Sol", "writing"],
  [/plan|reading|recall/i, "Sol", "planning"],
  [/restore point|saving|finishing/i, "Sol", "saving"],
];

export function liveStatusLine(stage: string | null | undefined, target: string | null | undefined): string | null {
  const clean = String(stage ?? "").trim();
  if (!clean) return null;
  const match = BY_STAGE.find(([pattern]) => pattern.test(clean));
  const where = target?.trim() ? ` ${target.trim().slice(0, 40)}` : " your site";
  if (!match) return `Sol is ${clean.slice(0, 50)}…`;
  const [, who, verb] = match;
  return `${who} is ${verb}${where}…`;
}
