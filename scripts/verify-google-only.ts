delete process.env.CLOUDFLARE_AI_API_TOKEN;
delete process.env.CLOUDFLARE_API_TOKEN;
delete process.env.OPENROUTER_API_KEY;
process.env.FREE_AI_ENABLED = "true";
process.env.FREE_AI_ONLY = "true";
process.env.FREE_AI_GOOGLE_FREE_TIER = "true";
process.env.FREE_AI_PROVIDER_ORDER = "google";

const { generateStructuredOutput, generateText } = await import("../src/lib/ai/router.server");

for (const role of ["primary", "fast", "coding"] as const) {
  try {
    const r = await generateStructuredOutput({
      task: "verify.google",
      role,
      json: true,
      messages: [{ role: "user", content: 'Reply only with JSON {"ok":true}' }],
      shape: (v: unknown) => (v as { ok?: boolean })?.ok === true,
    } as never);
    console.log(role, "OK", (r as { provider: string; model: string }).provider, (r as { model: string }).model);
  } catch (e) {
    console.log(role, "FAIL", (e as Error).message, JSON.stringify((e as { details?: unknown }).details ?? null));
  }
}
try {
  const t = await generateText({ task: "verify.google.text", role: "fast", messages: [{ role: "user", content: "Say hello in one short sentence." }] } as never);
  console.log("text OK", JSON.stringify(t).slice(0, 200));
} catch (e) { console.log("text FAIL", (e as Error).message); }
