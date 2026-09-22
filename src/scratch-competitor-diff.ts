/** Live evidence: two different businesses must get different plans. */
import { callCollective } from "@/lib/ai/luna.server";

const RULES =
  "Use only the given facts. Invent no prices, reviews, results or awards. Return strict JSON.";

async function plan(name: string, sheet: string) {
  const out = await callCollective({
    purpose: "content_strategy",
    complexity: "high",
    system: `${RULES} You are the creative director and content strategist for a first website build. Keep output under 500 words.`,
    user: [
      "FACTS (the only truth you may use):",
      sheet,
      "",
      'Return JSON: {"heroHeadline":string,"heroSubheadline":string,"pages":[{"slug":string,"sections":string[]}],"palette":{"background":string,"accent":string},"typography":{"display":string,"body":string},"artDirection":string}',
    ].join("\n"),
  });
  console.log(`\n===== ${name} =====`);
  console.log("ok:", out.ok, "tier:", out.tier, "model:", (out as { model?: string }).model ?? "-");
  const text = (out as { text?: string }).text ?? JSON.stringify(out);
  console.log(text.slice(0, 2000));
  return text;
}

const mine = await plan(
  "MINE: Supreme Detailing Raleigh",
  "Business: Supreme Detailing. Trade: mobile auto detailing. City: Raleigh, NC. Mobile: comes to the customer. Services: full detail, interior detail, exterior wash. Phone: 9843653695.",
);
const theirs = await plan(
  "COMPETITOR: Northside Roofing Co",
  "Business: Northside Roofing Co. Trade: residential roof replacement and storm repair. City: Toledo, OH. Services: roof replacement, storm damage repair, gutter installation, inspections. Phone: 4195550147.",
);

const words = (t: string) => new Set(t.toLowerCase().match(/[a-z]{5,}/g) ?? []);
const a = words(mine);
const b = words(theirs);
const shared = [...a].filter((w) => b.has(w));
console.log("\n===== DIFFERENCE =====");
console.log("identical output:", mine.trim() === theirs.trim());
console.log(
  `shared long words: ${shared.length} of ${a.size}/${b.size} (overlap ${(
    (shared.length / Math.max(1, Math.min(a.size, b.size))) * 100
  ).toFixed(0)}%)`,
);
