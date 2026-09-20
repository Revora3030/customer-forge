/**
 * FREE-AI RUNTIME PROOF.
 *
 * These tests drive the real router with stubbed HTTP, so they prove the
 * behaviour an owner depends on: a free provider that answers badly, is rate
 * limited, is out of quota or is broken hands the work to the NEXT FREE
 * provider — never to a paid model — and when nothing free can answer, the
 * failure is a clear, non-blocking explanation so the deterministic engine can
 * take over. They also prove the four provider secret names never appear in
 * anything the browser can load, and that no secret value is ever logged.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "ZERO_AI_COST_MODE",
  "FREE_AI_ENABLED",
  "FREE_AI_ONLY",
  "FREE_AI_PROVIDER_ORDER",
  "FREE_AI_CLOUDFLARE_DAILY_CAP",
  "FREE_AI_OPENROUTER_DAILY_CAP",
  "CLOUDFLARE_AI_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "NVIDIA_NIM_API_KEY",
  "NVIDIA_API_KEY",
  "GOOGLE_AI_FREE_API_KEY",
  "GOOGLE_AI_API_KEY",
  "OPENAI_API_KEY",
  "AI_MAX_ATTEMPTS_PER_PROVIDER",
];

const saved: Record<string, string | undefined> = {};

/** Two free providers configured, cloudflare first, no paid keys at all. */
function configureTwoFreeProviders() {
  process.env["CLOUDFLARE_AI_API_TOKEN"] = "cf-token";
  process.env["CLOUDFLARE_ACCOUNT_ID"] = "cf-account";
  process.env["OPENROUTER_API_KEY"] = "or-key";
  process.env["FREE_AI_PROVIDER_ORDER"] = "cloudflare,openrouter";
  process.env["AI_MAX_ATTEMPTS_PER_PROVIDER"] = "1";
}

type Handler = (url: string, init: RequestInit | undefined) => Response;

/** Stubs HTTP: model-discovery calls answer empty, chat calls use `handler`. */
function stubFetch(handler: Handler) {
  const calls: string[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (!url.includes("/chat/completions"))
      return Promise.resolve(
        new Response(JSON.stringify({ data: [], result: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    calls.push(url);
    return Promise.resolve(handler(url, init as RequestInit | undefined));
  });
  return { calls, spy };
}

const ok = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const caller = { task: "test", userId: null, organizationId: null } as const;

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
  vi.resetModules();
});

async function router() {
  vi.resetModules();
  const mod = await import("@/lib/ai/router.server");
  mod.resetAiRuntimeStatus();
  const { resetFreeBudget } = await import("@/lib/ai/free");
  resetFreeBudget();
  const { resetFreeModelDiscovery } = await import("@/lib/ai/free-models.server");
  resetFreeModelDiscovery();
  return mod;
}

describe("automatic failover between free providers", () => {
  it("hands a malformed structured answer to the next free provider", async () => {
    configureTwoFreeProviders();
    const { calls } = stubFetch((url) =>
      url.includes("cloudflare") ? ok("not json at all") : ok('{"ok":true}'),
    );
    const { generateStructuredOutput } = await router();
    const result = await generateStructuredOutput(caller, {
      messages: [{ role: "user", content: "give me json" }],
    });
    expect(result.data).toEqual({ ok: true });
    expect(result.provider).toBe("openrouter");
    expect(result.fallbackUsed).toBe(true);
    expect(calls.some((url) => url.includes("cloudflare"))).toBe(true);
  });

  it("moves on when the first free provider is rate limited", async () => {
    configureTwoFreeProviders();
    stubFetch((url) =>
      url.includes("cloudflare")
        ? new Response("slow down", { status: 429 })
        : ok("second provider answered"),
    );
    const { generateText } = await router();
    const result = await generateText(caller, {
      messages: [{ role: "user", content: "hello" }],
    });
    expect(result.provider).toBe("openrouter");
  });

  it("moves on when the first free provider is broken (5xx)", async () => {
    configureTwoFreeProviders();
    stubFetch((url) =>
      url.includes("cloudflare") ? new Response("boom", { status: 503 }) : ok("covered"),
    );
    const { generateText } = await router();
    expect((await generateText(caller, { messages: [{ role: "user", content: "hi" }] })).provider)
      .toBe("openrouter");
  });

  it("skips a free provider whose daily budget is spent", async () => {
    configureTwoFreeProviders();
    process.env["FREE_AI_CLOUDFLARE_DAILY_CAP"] = "1";
    const { calls } = stubFetch(() => ok("answered"));
    const mod = await router();
    const { noteFreeUse } = await import("@/lib/ai/free");
    noteFreeUse("cloudflare");
    const result = await mod.generateText(caller, {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.provider).toBe("openrouter");
    expect(calls.some((url) => url.includes("cloudflare"))).toBe(false);
  });

  it("never reaches a paid provider when every free provider fails", async () => {
    configureTwoFreeProviders();
    process.env["GOOGLE_AI_API_KEY"] = "paid-google";
    process.env["OPENAI_API_KEY"] = "paid-openai";
    const { calls } = stubFetch(() => new Response("nope", { status: 500 }));
    const { generateText } = await router();
    await expect(
      generateText(caller, { messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ name: "RevoraAiError" });
    expect(calls.some((url) => url.includes("googleapis") || url.includes("api.openai.com"))).toBe(
      false,
    );
  });

  it("explains itself without blocking when no free provider is configured", async () => {
    const { generateText } = await router();
    await expect(
      generateText(caller, { messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ category: "free_unavailable", retryable: false });
  });
});

describe("circuit breaker and last-request status", () => {
  it("rests a provider after repeated failures and reports who served the last call", async () => {
    configureTwoFreeProviders();
    stubFetch((url) =>
      url.includes("cloudflare") ? new Response("boom", { status: 503 }) : ok("covered"),
    );
    const mod = await router();
    for (let index = 0; index < 3; index += 1)
      await mod.generateText(caller, { messages: [{ role: "user", content: "hi" }] });
    const status = mod.freeAiStatus();
    const cloudflare = status.providers.find((entry) => entry.name === "cloudflare");
    expect(cloudflare?.healthy).toBe(false);
    expect(status.last?.provider).toBe("openrouter");
    expect(status.last?.ok).toBe(true);
    expect(status.last?.free).toBe(true);
  });

  it("reports the failure category of a failed last request, with no key material", async () => {
    configureTwoFreeProviders();
    stubFetch(() => new Response("nope", { status: 500 }));
    const mod = await router();
    await mod
      .generateText(caller, { messages: [{ role: "user", content: "hi" }] })
      .catch(() => null);
    const serialized = JSON.stringify(mod.freeAiStatus());
    expect(mod.freeAiStatus().last?.ok).toBe(false);
    expect(serialized).not.toContain("cf-token");
    expect(serialized).not.toContain("or-key");
  });
});

describe("identical requests are not paid for twice", () => {
  it("runs one call for two identical in-flight analyses", async () => {
    const { withAnalysisCache, resetAnalysisCache } = await import("@/lib/ai/cache.server");
    resetAnalysisCache();
    let runs = 0;
    const work = async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "answer";
    };
    const [a, b] = await Promise.all([
      withAnalysisCache("scope", { page: 1 }, work),
      withAnalysisCache("scope", { page: 1 }, work),
    ]);
    expect([a, b]).toEqual(["answer", "answer"]);
    expect(runs).toBe(1);
    expect(await withAnalysisCache("scope", { page: 1 }, work)).toBe("answer");
    expect(runs).toBe(1);
    resetAnalysisCache();
  });
});

/* ------------------------- secrets stay on the server ---------------------- */

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

describe("free provider credentials never reach the browser", () => {
  const SECRET_NAMES = [
    "CLOUDFLARE_AI_API_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "OPENROUTER_API_KEY",
    "GROQ_API_KEY",
    "NVIDIA_NIM_API_KEY",
    "NVIDIA_API_KEY",
    "GOOGLE_AI_FREE_API_KEY",
  ];

  const files = walk(join("src")).filter((file) => !file.includes(".test."));

  it("only the server-side AI layer ever reads a provider secret", () => {
    const offenders = files.filter((file) => {
      if (file.includes(join("src", "lib", "ai"))) return false;
      const body = readFileSync(file, "utf8");
      // Naming a secret in a connector's required-secrets list is fine; READING
      // one outside the server-side AI layer is not.
      if (!/process\.env|import\.meta\.env/.test(body)) return false;
      return SECRET_NAMES.some((name) =>
        new RegExp(`(process\\.env|import\\.meta\\.env)[^\\n]*${name}`).test(body),
      );
    });
    expect(offenders).toEqual([]);
  });


  it("no provider secret is exposed through a client-visible VITE_ variable", () => {
    const offenders = files.filter((file) =>
      /VITE_[A-Z_]*(CLOUDFLARE|OPENROUTER|GOOGLE_AI)[A-Z_]*/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("never logs a provider credential", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const body = readFileSync(file, "utf8");
      for (const line of body.split("\n"))
        if (/console\.(log|info|warn|error|debug)/.test(line) && /apiKey|API_TOKEN|API_KEY/.test(line))
          offenders.push(`${file}: ${line.trim().slice(0, 80)}`);
    }
    expect(offenders).toEqual([]);
  });
});
