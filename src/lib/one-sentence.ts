/**
 * CG-06 (G-A2): "describe your business in one sentence".
 *
 * Reads only what the owner actually wrote. Every value returned is a piece of
 * their own sentence (tidied), never a guess: no city, name or trade is made
 * up, and anything we can't find stays empty so the form asks for just that.
 * The owner still sees and can change every filled field before continuing.
 */
import { STYLE_PICKS } from "@/lib/builder/style-picks";

export const ONE_SENTENCE_MAX = 300;

export type OneSentenceFacts = {
  businessName?: string | undefined;
  businessType?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
};

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "),
);

const tidy = (value: string) => value.replace(/\s+/g, " ").replace(/^[\s,.;:!-]+|[\s,.;:!-]+$/g, "").trim();

/** Leading "I run a", "we're an", "we do", "my business is a"… carry no facts. */
const OPENER =
  /^(?:hi[,!.]?\s+)?(?:(?:i|we)\s+(?:run|own|have|operate|do|offer|provide|am|are)\s+|(?:i'm|we're|im)\s+|my\s+(?:business|company)\s+is\s+|our\s+(?:business|company)\s+is\s+|it's\s+|its\s+)?(?:an?\s+|the\s+)?/i;

/** The place: the last "in <Capitalised Place>[, ST]" (or "based in"/"serving"). */
const PLACE =
  /\b(?:in|based in|serving|around|near)\s+((?:[A-Z][A-Za-z.'-]*)(?:\s+[A-Z][A-Za-z.'-]*){0,3})(?:,?\s+([A-Z]{2})\b)?/g;

/** "called X" / "named X" up to a clause break. */
const CALLED = /\b(?:called|named)\s+(.+?)(?=\s+(?:in|based|serving|that|which|and|for|near|around)\b|[,.;!]|$)/i;

/** "<Name> is a/an …" at the very start, when the name is capitalised. */
const NAME_IS = /^((?:[A-Z0-9][\w&'.-]*)(?:\s+(?:[A-Z0-9&][\w&'.-]*|of|and|the))*?)\s+(?:is|are)\s+(?:an?\s+|the\s+)?/;

export function readOneSentence(input: string): OneSentenceFacts {
  const text = tidy(String(input ?? "").slice(0, ONE_SENTENCE_MAX));
  if (!text) return {};
  const facts: OneSentenceFacts = {};
  let rest = text;

  const called = CALLED.exec(rest);
  if (called) {
    facts.businessName = tidy(called[1]!);
    rest = tidy(rest.slice(0, called.index) + " " + rest.slice(called.index + called[0].length));
  } else {
    const nameIs = NAME_IS.exec(rest);
    // "I am a…" / "We are…" are openers, not names.
    if (nameIs && !/^(?:i|we|it|this|my|our)$/i.test(nameIs[1]!)) {
      facts.businessName = tidy(nameIs[1]!);
      rest = rest.slice(nameIs[0].length);
    }
  }

  let place: RegExpExecArray | null = null;
  for (let match = PLACE.exec(rest); match; match = PLACE.exec(rest)) place = match;
  PLACE.lastIndex = 0;
  if (place) {
    let city = tidy(place[1]!);
    let st = place[2]?.toUpperCase();
    // "San Diego CA": the trailing state code was read as part of the city.
    const tail = /\s([A-Z]{2})$/.exec(city);
    if (!st && tail && US_STATES.has(tail[1]!)) {
      st = tail[1]!;
      city = city.slice(0, tail.index);
    }
    facts.city = city;
    if (st && US_STATES.has(st)) facts.state = st;
    rest = rest.slice(0, place.index);
  }

  // What they do: the remaining words before the place, minus filler.
  const trade = tidy(
    rest
      .replace(OPENER, "")
      .replace(/\b(?:business|company)\s*$/i, "")
      .replace(/\s+(?:that|which|who)\b.*$/i, ""),
  );
  if (trade && trade.split(" ").length <= 8 && !/^(?:i|we|it)$/i.test(trade)) facts.businessType = trade;
  return facts;
}

/** Words that clearly point at one of the three look cards (CG-01). */
const LOOK_WORDS: Record<string, RegExp> = {
  "dark-premium": /\b(?:luxury|luxurious|premium|high[- ]end|upscale|elegant|sleek|exclusive|boutique)\b/i,
  "warm-crafted": /\b(?:rustic|warm|cozy|cosy|hand[- ]?made|handcrafted|crafted|artisan(?:al)?|earthy|homey|family[- ]run|old[- ]fashioned)\b/i,
  "clean-trust": /\b(?:clean[- ]looking|clean look|simple|minimal(?:ist)?|no[- ]nonsense|straightforward|trustworthy|professional[- ]looking)\b/i,
};

/**
 * The look card the sentence already implies, or null when it implies none or
 * more than one (then the owner is asked as usual).
 */
export function impliedStylePickId(input: string | null | undefined): string | null {
  const text = String(input ?? "");
  if (!text.trim()) return null;
  const hits = STYLE_PICKS.filter((pick) => LOOK_WORDS[pick.id]?.test(text)).map((pick) => pick.id);
  return hits.length === 1 ? hits[0]! : null;
}

/** Fill only the empty fields; never overwrite what the owner typed. */
export function fillFromSentence<T extends Record<keyof OneSentenceFacts, string>>(current: T, facts: OneSentenceFacts): T {
  const next = { ...current };
  for (const key of ["businessName", "businessType", "city", "state"] as const) {
    const value = facts[key];
    if (value && !String(next[key] ?? "").trim()) next[key] = value as T[typeof key];
  }
  return next;
}
