import { generateStructuredOutput, generateText, freeAiStatus, lastAiOutcome } from "../src/lib/ai/router.server";
import { builderAiAvailable, builderMediaAvailability } from "../src/lib/ai/availability";
import { freeProviderChain } from "../src/lib/ai/free";

const caller = { task: "verify.live" };
async function probe(label: string, order: string, role: "primary" | "fast" | "coding") {
  process.env["FREE_AI_PROVIDER_ORDER"] = order;
  try {
    const r = await generateStructuredOutput(caller, {
      role,
      messages: [{ role: "user", content: 'Answer with JSON only: {"ok":true}' }],
    });
    console.log(label, "OK", r.provider, r.model, "fallbackUsed=", r.fallbackUsed, JSON.stringify(r.data).slice(0, 60));
  } catch (e) {
    console.log(label, "FAIL", (e as Error).message);
  }
}
for (const p of ["cloudflare", "openrouter", "google"] as const) {
  console.log("chain", p, JSON.stringify(freeProviderChain("primary").filter((c) => c.name === p).map((c) => c.model)));
}
await probe("cloudflare/primary", "cloudflare", "primary");
await probe("cloudflare/fast", "cloudflare", "fast");
await probe("openrouter/primary", "openrouter", "primary");
await probe("openrouter/fast", "openrouter", "fast");
await probe("openrouter/coding", "openrouter", "coding");
await probe("google/primary", "google", "primary");
delete process.env["FREE_AI_PROVIDER_ORDER"];
const t = await generateText(caller, { role: "fast", messages: [{ role: "user", content: "Say hello in five words." }] });
console.log("text", t.provider, t.model, JSON.stringify(t.text.slice(0, 80)));
console.log("builderAiAvailable", builderAiAvailable(), "media", JSON.stringify(builderMediaAvailability()));
console.log("status", JSON.stringify(freeAiStatus(), null, 1));
console.log("last", JSON.stringify(lastAiOutcome()));
