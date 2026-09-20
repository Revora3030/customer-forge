delete process.env.CLOUDFLARE_AI_API_TOKEN;
delete process.env.CLOUDFLARE_API_TOKEN;
delete process.env.OPENROUTER_API_KEY;
process.env.FREE_AI_ENABLED = "true";
process.env.FREE_AI_ONLY = "true";
process.env.FREE_AI_GOOGLE_FREE_TIER = "true";
process.env.FREE_AI_PROVIDER_ORDER = "google";

const { generateStructuredOutput, generateText, freeAiStatus } = await import("../src/lib/ai/router.server");
const caller = { task: "verify.google" };
for (const role of ["primary", "fast", "coding"] as const) {
  try {
    const r = await generateStructuredOutput(caller, {
      role,
      messages: [{ role: "user", content: 'Answer with JSON only: {"ok":true}' }],
    });
    console.log(role, "OK", r.provider, r.model, "fallbackUsed=", r.fallbackUsed, JSON.stringify(r.data).slice(0, 60));
  } catch (e) { console.log(role, "FAIL", (e as Error).message); }
}
try {
  const t = await generateText(caller, { role: "fast", messages: [{ role: "user", content: "Say hello in five words." }] });
  console.log("text OK", t.provider, t.model, JSON.stringify(t.text.slice(0, 80)));
} catch (e) { console.log("text FAIL", (e as Error).message); }
console.log("google status", JSON.stringify(freeAiStatus().providers.find((p) => p.name === "google")));
