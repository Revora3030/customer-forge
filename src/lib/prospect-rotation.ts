/**
 * Prospect autopilot rotation: walks (trade, metro) pairs across runs so the
 * autopilot keeps finding new businesses without the operator typing targets.
 *
 * Pure data and ordering only. The server records when each pair was last
 * searched (prospect_rotation_cursor) and asks nextRotationPairs which pairs
 * are due; explicit targets are always searched first, and every search still
 * goes through the shared Google Places budget.
 */

/** High-margin local services where a simple website plausibly earns its keep. */
export const ROTATION_TRADES = [
  "auto detailing",
  "roofing",
  "HVAC",
  "plumbing",
  "electrician",
  "landscaping",
  "pressure washing",
  "pest control",
  "garage door repair",
  "fence installation",
  "concrete contractor",
  "painting contractor",
  "home remodeling",
  "flooring installation",
  "pool service",
  "tree service",
  "gutter cleaning",
  "window cleaning",
  "junk removal",
  "moving company",
  "carpet cleaning",
  "solar installation",
  "foundation repair",
  "septic service",
  "water damage restoration",
  "locksmith",
  "appliance repair",
  "towing",
  "med spa",
  "dentist",
] as const;

/** Top one to three metros per state (by population), all 50 states. */
export const ROTATION_METROS: Readonly<Record<string, readonly string[]>> = {
  AL: ["Birmingham", "Huntsville", "Mobile"],
  AK: ["Anchorage", "Fairbanks"],
  AZ: ["Phoenix", "Tucson", "Mesa"],
  AR: ["Little Rock", "Fayetteville"],
  CA: ["Los Angeles", "San Diego", "Sacramento"],
  CO: ["Denver", "Colorado Springs", "Fort Collins"],
  CT: ["Hartford", "New Haven", "Stamford"],
  DE: ["Wilmington", "Dover"],
  FL: ["Miami", "Tampa", "Orlando"],
  GA: ["Atlanta", "Savannah", "Augusta"],
  HI: ["Honolulu"],
  ID: ["Boise", "Idaho Falls"],
  IL: ["Chicago", "Rockford", "Springfield"],
  IN: ["Indianapolis", "Fort Wayne", "Evansville"],
  IA: ["Des Moines", "Cedar Rapids"],
  KS: ["Wichita", "Overland Park"],
  KY: ["Louisville", "Lexington"],
  LA: ["New Orleans", "Baton Rouge", "Shreveport"],
  ME: ["Portland", "Bangor"],
  MD: ["Baltimore", "Frederick"],
  MA: ["Boston", "Worcester", "Springfield"],
  MI: ["Detroit", "Grand Rapids", "Lansing"],
  MN: ["Minneapolis", "Saint Paul", "Rochester"],
  MS: ["Jackson", "Gulfport"],
  MO: ["Kansas City", "St. Louis", "Springfield"],
  MT: ["Billings", "Missoula"],
  NE: ["Omaha", "Lincoln"],
  NV: ["Las Vegas", "Reno"],
  NH: ["Manchester", "Nashua"],
  NJ: ["Newark", "Jersey City", "Trenton"],
  NM: ["Albuquerque", "Las Cruces"],
  NY: ["New York", "Buffalo", "Rochester"],
  NC: ["Charlotte", "Raleigh", "Greensboro"],
  ND: ["Fargo", "Bismarck"],
  OH: ["Columbus", "Cleveland", "Cincinnati"],
  OK: ["Oklahoma City", "Tulsa"],
  OR: ["Portland", "Eugene", "Salem"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown"],
  RI: ["Providence", "Warwick"],
  SC: ["Charleston", "Columbia", "Greenville"],
  SD: ["Sioux Falls", "Rapid City"],
  TN: ["Nashville", "Memphis", "Knoxville"],
  TX: ["Houston", "Dallas", "Austin"],
  UT: ["Salt Lake City", "Provo", "Ogden"],
  VT: ["Burlington"],
  VA: ["Virginia Beach", "Richmond", "Arlington"],
  WA: ["Seattle", "Spokane", "Tacoma"],
  WV: ["Charleston", "Huntington"],
  WI: ["Milwaukee", "Madison", "Green Bay"],
  WY: ["Cheyenne", "Casper"],
};

export const ROTATION_STATES = Object.keys(ROTATION_METROS).sort();

/** A (trade, metro) pair is searched at most once per this many days. */
export const ROTATION_COOLDOWN_DAYS = 2;

export type RotationSettings = {
  enabled: boolean;
  /** Empty means every built-in trade. */
  trades: string[];
  /** Two-letter state codes; empty means every state. */
  states: string[];
};

export const DEFAULT_ROTATION: RotationSettings = { enabled: false, trades: [], states: [] };

export type RotationPair = { key: string; trade: string; city: string; state: string };

const TRADE_BY_LOWER = new Map(ROTATION_TRADES.map((trade) => [trade.toLowerCase(), trade as string]));

function uniqueList<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Validates a rotation change; throws a plain-language reason. */
export function parseRotation(value: unknown): RotationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Rotation must be {enabled, trades, states}.");
  const raw = value as Record<string, unknown>;
  if (typeof raw["enabled"] !== "boolean") throw new Error("rotation.enabled must be true or false.");
  const list = (key: "trades" | "states") => {
    const items = raw[key] ?? [];
    if (!Array.isArray(items)) throw new Error(`rotation.${key} must be a list.`);
    return items.map((item) => (typeof item === "string" ? item.trim() : ""));
  };
  const trades = list("trades").map((trade) => {
    const known = TRADE_BY_LOWER.get(trade.toLowerCase());
    if (!known) throw new Error(`"${trade.slice(0, 60)}" isn't one of the rotation trades.`);
    return known;
  });
  const states = list("states").map((state) => {
    const code = state.toUpperCase();
    if (!ROTATION_METROS[code]) throw new Error(`"${state.slice(0, 20)}" isn't a US state code.`);
    return code;
  });
  return { enabled: raw["enabled"], trades: uniqueList(trades), states: uniqueList(states).sort() };
}

/** Reads a stored rotation value; anything unreadable is the safe default (off). */
export function readRotation(value: unknown): RotationSettings {
  try {
    return parseRotation(value);
  } catch {
    return { ...DEFAULT_ROTATION };
  }
}

export const rotationPairKey = (trade: string, city: string, state: string) => `${trade}|${city}|${state}`.toLowerCase();

/** FNV-1a: a stable shuffle so consecutive searches vary by trade and place. */
function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Every configured (trade, metro) pair, in a stable mixed order. */
export function rotationPairs(rotation: RotationSettings): RotationPair[] {
  const trades = rotation.trades.length ? rotation.trades : [...ROTATION_TRADES];
  const states = rotation.states.length ? rotation.states : ROTATION_STATES;
  const pairs: RotationPair[] = [];
  for (const state of states) {
    for (const city of ROTATION_METROS[state] ?? []) {
      for (const trade of trades) pairs.push({ key: rotationPairKey(trade, city, state), trade, city, state });
    }
  }
  return pairs
    .map((pair) => ({ pair, rank: stableHash(pair.key) }))
    .sort((a, b) => a.rank - b.rank || a.pair.key.localeCompare(b.pair.key))
    .map(({ pair }) => pair);
}

/**
 * The next pairs due: never-searched ones first (in rotation order), then the
 * longest-ago searched, skipping any searched within the cooldown.
 */
export function nextRotationPairs(
  pairs: RotationPair[],
  lastSearched: ReadonlyMap<string, string>,
  now: Date,
  limit: number,
  cooldownDays = ROTATION_COOLDOWN_DAYS,
): RotationPair[] {
  if (limit <= 0) return [];
  const cutoff = now.getTime() - cooldownDays * 86_400_000;
  const due = pairs
    .map((pair, index) => ({ pair, index, at: Date.parse(lastSearched.get(pair.key) ?? "") }))
    .filter((entry) => !Number.isFinite(entry.at) || entry.at < cutoff);
  due.sort((a, b) => {
    const aNever = !Number.isFinite(a.at);
    const bNever = !Number.isFinite(b.at);
    if (aNever !== bNever) return aNever ? -1 : 1;
    if (!aNever && a.at !== b.at) return a.at - b.at;
    return a.index - b.index;
  });
  return due.slice(0, limit).map((entry) => entry.pair);
}

/** Plain-language summary, for the approval card and the Operations card. */
export function describeRotation(rotation: RotationSettings): string {
  if (!rotation.enabled) return "don't rotate through trades and metros";
  const trades = rotation.trades.length ? `${rotation.trades.length} trade${rotation.trades.length === 1 ? "" : "s"}` : "all trades";
  const states = rotation.states.length ? rotation.states.join(", ") : "all 50 states";
  return `rotate through ${trades} across metros in ${states}`;
}
