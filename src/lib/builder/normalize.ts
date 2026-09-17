/**
 * REVORA LANGUAGE NORMALISER — plain speech in, comparable words out.
 *
 * Free-first semantic preprocessor for the deterministic builder. It translates
 * conversational outcome language into vocabulary already understood by the
 * compiler, so customers can describe results instead of builder mechanics.
 */

const REWRITES: [RegExp, string][] = [
  [/\bcan you (?:please )?/g, ""], [/\bcould you (?:please )?/g, ""], [/\bwould you (?:please )?/g, ""],
  [/\bplease\b/g, ""], [/\bpls\b/g, ""], [/\bplz\b/g, ""], [/\bi(?:'| a)?m thinking (?:we|you) (?:should|could)\b/g, ""],
  [/\bi(?:'|)d like (?:you )?to\b/g, ""], [/\bi want you to\b/g, ""], [/\bi need you to\b/g, ""], [/\blet(?:'|)s\b/g, ""],
  [/\bwould be (?:good|great|nice)\b/g, ""], [/\bdon(?:'|)t\b/g, "do not"], [/\bdoesn(?:'|)t\b/g, "does not"],
  [/\bcan(?:'|)t\b/g, "cannot"], [/\bwon(?:'|)t\b/g, "will not"], [/\bit(?:'|)s\b/g, "it is"], [/\bthat(?:'|)s\b/g, "that is"],
  [/\bi(?:'|)ve\b/g, "i have"], [/\bi(?:'|)ll\b/g, "i will"], [/\bhomepage\b/g, "home page"], [/\bhp\b/g, "home page"],
  [/\bpg\b/g, "page"], [/\bcta\b/g, "call to action"], [/\bfaqs?\b/g, "faq"], [/\bhvac\b/g, "hvac"], [/\bac\b/g, "hvac"],
  [/\bа\/c\b/g, "hvac"], [/\bmob\b/g, "mobile"], [/\bpics?\b/g, "photos"], [/\bimgs?\b/g, "images"], [/\bvid(?:eo)?s?\b/g, "video"],
  [/\binfo\b/g, "information"], [/\bnum(?:ber)?\b/g, "number"], [/\bbiz\b/g, "business"], [/\btestimonials?\b/g, "reviews"],
  [/\bsocial proof\b/g, "reviews"], [/\bcopy(?:writing)?\b/g, "text"], [/\bpop\b/g, "stand out"],
];

const TYPOS: Record<string, string> = {
  webiste: "website", websight: "website", wesbite: "website", wbsite: "website", weebsite: "website", websit: "website",
  sevices: "services", servcies: "services", serivces: "services", servicees: "services", bookign: "booking", bookinng: "booking",
  contct: "contact", cotnact: "contact", gallry: "gallery", galery: "gallery", proffesional: "professional", profesional: "professional",
  premuim: "premium", premim: "premium", moblie: "mobile", mobil: "mobile", responsve: "responsive", colour: "color", colours: "colors",
  plumbling: "plumbing", plumming: "plumbing", roofin: "roofing", rooffing: "roofing", electricain: "electrician", electical: "electrical",
  lanscaping: "landscaping", landscapng: "landscaping", hearder: "header", heder: "header", buton: "button", buttton: "button", bigge: "bigger",
  darkr: "darker", pricng: "pricing", priccing: "pricing", quot: "quote", qupte: "quote", appoitment: "appointment", appointmet: "appointment",
  anitmate: "animate", animtion: "animation", googl: "google", custmers: "customers", cutomers: "customers", bookng: "booking",
};

/** Conversational idioms, business outcomes and design language. */
const IDIOMS: [RegExp, string][] = [
  [/\btop (?:part|bit|section|area)\b/g, "hero"], [/\bthe top\b/g, "hero"], [/\bfirst thing (?:people|visitors|they) see\b/g, "hero"],
  [/\babove the fold\b/g, "hero"], [/\bfirst screen\b/g, "hero"], [/\bhit(?:s)? harder\b/g, "bolder stronger call to action"], [/\bmore punch\b/g, "bolder"],
  [/\bpack a punch\b/g, "bolder"], [/\blook expensive\b/g, "premium"], [/\bfeel expensive\b/g, "premium"], [/\bmake it look expensive\b/g, "premium modern"],
  [/\bhigh class\b/g, "premium"], [/\btop notch\b/g, "premium"], [/\bcheap looking\b/g, "premium"], [/\bnot cheap\b/g, "premium"],
  [/\bnot generic\b/g, "distinctive premium modern"], [/\btoo plain\b/g, "premium visual"], [/\bimportant (?:stuff|things|information|info)\b/g, "hierarchy"],
  [/\beasier to find\b/g, "hierarchy"], [/\bwhere people (?:see|look) (?:it )?first\b/g, "hierarchy"], [/\bstand(?:s)? out\b/g, "bolder call to action"],
  [/\bthroughout (?:the|my) (?:site|website)\b/g, "on every page"], [/\bevery page\b/g, "on every page"], [/\ball (?:the )?pages\b/g, "on every page"],
  [/\bsite[- ]?wide\b/g, "on every page"], [/\bsound(?:s)? more professional\b/g, "rewrite professional"], [/\bsell better\b/g, "rewrite conversion"],
  [/\bmake more money\b/g, "conversion leads"], [/\bmake more sales\b/g, "conversion leads"], [/\bget me more customers\b/g, "conversion leads call to action"],
  [/\bget more customers\b/g, "conversion leads call to action"], [/\bget more clients\b/g, "conversion leads call to action"], [/\bget me more leads\b/g, "conversion leads call to action"],
  [/\bget more leads\b/g, "conversion leads call to action"], [/\bget me more calls\b/g, "conversion calls call to action"], [/\bget more calls\b/g, "conversion calls call to action"],
  [/\bget me more bookings\b/g, "conversion booking call to action"], [/\bget more bookings\b/g, "conversion booking call to action"],
  [/\bget more appointments\b/g, "conversion booking call to action"], [/\bget people to call\b/g, "calls call to action"], [/\bget people to book\b/g, "booking call to action"],
  [/\bturn visitors into customers\b/g, "conversion"], [/\bturn more visitors into customers\b/g, "conversion hierarchy call to action"], [/\bgrow my business\b/g, "conversion leads redesign"],
  [/\bmake my website better\b/g, "redesign conversion visual hierarchy mobile"], [/\bmake my site better\b/g, "redesign conversion visual hierarchy mobile"],
  [/\bmake the website better\b/g, "redesign conversion visual hierarchy mobile"], [/\bmake everything better\b/g, "redesign conversion visual hierarchy mobile"],
  [/\bmake it better\b/g, "redesign conversion visual hierarchy mobile"], [/\bmake this better\b/g, "redesign conversion visual hierarchy mobile"], [/\bmake it great\b/g, "redesign conversion visual hierarchy mobile"],
  [/\bmake this great\b/g, "redesign conversion visual hierarchy mobile"], [/\bfix whatever is wrong\b/g, "fix hierarchy conversion mobile visual"], [/\bfix everything\b/g, "fix hierarchy conversion mobile visual"],
  [/\bupgrade my website\b/g, "redesign conversion visual mobile"], [/\bfrom scratch\b/g, "build a website"], [/\bstart over\b/g, "build a website"],
  [/\bredesign (?:the |my )?(?:whole |entire )?(?:site|website)\b/g, "build a website restyle"], [/\bkeep my business (?:information|details|info)\b/g, "keep business facts"],
  [/\bdo not change my information\b/g, "keep business facts"], [/\blooks? (?:old fashioned|outdated|dated|old school)\b/g, "premium modern"], [/\blooks? cluttered\b/g, "minimal hierarchy"],
  [/\btoo busy\b/g, "minimal"], [/\btoo much going on\b/g, "minimal hierarchy"], [/\btoo plain\b/g, "premium visual"], [/\bboring\b/g, "visual bolder"], [/\bbland\b/g, "visual premium"],
  [/\bmake it pop\b/g, "visual bolder"], [/\bmake it wow\b/g, "visual premium"], [/\beye[- ]catching\b/g, "visual bolder"], [/\bmake it mobile friendly\b/g, "mobile"],
  [/\b(?:work|works) (?:great |really |well )?on phones?\b/g, "mobile"], [/\bphone friendly\b/g, "mobile"], [/\bload faster\b/g, "speed"], [/\bshow up (?:higher )?(?:in|on) google\b/g, "seo"], [/\brank (?:higher|better)\b/g, "seo"],
  [/\bfound (?:locally|online|on google)\b/g, "seo"], [/\bnear me searches?\b/g, "local seo"], [/\bmake it easier\b/g, "simple hierarchy"], [/\bkeep it simple\b/g, "simple minimal"],
  [/\bdo the same\b/g, "repeat previous change"], [/\bdo that everywhere\b/g, "on every page"],
];

const PRONOUNS = /\b(it|that|this|those|these|them|the same|same thing|same style|same look)\b/;
const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
const fixTypos = (text: string) => text.replace(/[a-z]+/g, (word) => TYPOS[word] ?? word);

export type Normalised = { text: string; original: string; carried: string | null };

export function normalise(instruction: string, history: string[] = []): Normalised {
  const original = collapse(instruction);
  let text = fixTypos(collapse(original.toLowerCase()));
  for (const [pattern, replacement] of REWRITES) text = text.replace(pattern, replacement);

  // Capture the follow-up subject before idiom expansion. Phrases such as
  // "make it better" are intentionally expanded below, but that expansion
  // would otherwise remove the pronoun that tells us to inspect prior context.
  const hasFollowUpReference = PRONOUNS.test(text);
  let carried: string | null = null;
  if (hasFollowUpReference) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const previous = normaliseSubjectOnly(history[index] ?? "");
      if (previous) {
        carried = previous;
        break;
      }
    }
  }

  for (const [pattern, replacement] of IDIOMS) text = text.replace(pattern, replacement);
  text = collapse(text);

  if (carried) {
    text = collapse(`${text} ${carried}`);
  }

  return { text, original, carried };
}

const SUBJECT_WORDS = [
  "hero", "services", "pricing", "reviews", "gallery", "faq", "contact", "booking", "quote", "process", "benefits", "area",
  "offer", "guarantee", "home page", "about", "button", "design", "colors", "font", "layout", "navigation", "header", "footer",
  "mobile", "seo", "speed", "leads", "conversion", "calls", "visual", "animation", "3d", "photos", "video", "premium", "hierarchy",
];

export function normaliseSubjectOnly(previous: string): string | null {
  let text = fixTypos(collapse(previous.toLowerCase()));
  for (const [pattern, replacement] of IDIOMS) text = text.replace(pattern, replacement);
  const found = SUBJECT_WORDS
    .map((word) => ({ word, index: text.indexOf(word) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.word);
  return found.length ? found.slice(0, 4).join(" ") : null;
}
