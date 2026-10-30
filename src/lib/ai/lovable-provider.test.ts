/**
 * The Lovable AI Gateway paid lane: registered only when LOVABLE_API_KEY is
 * present, ordered behind Revora's own keys, excluded from free-only scopes,
 * and speaking the gateway's chat-completions wire format with the right
 * per-model token/reasoning rules. All HTTP is stubbed; ambient deployment
 * credentials must never trigger a real call (provider-test-environment).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";
import { providerChain, providerConfig } from "@/lib/ai/config";
import { lovableAdapter, readChatStream } from "@/lib/ai/providers/lovable";
import { categoryForStatus } from "@/lib/ai/errors";
import { thinkerAttemptTimeoutMs, thinkerChainBudgetMs } from "@/lib/ai/thinker.server";

const saved = { ...process.env };

beforeEach(() => {
  isolateProviderEnvironment();
  vi.resetModules();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

type CapturedCall = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function stubGateway(status = 200, payload?: unknown) {
  const calls: CapturedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>))
        headers[key.toLowerCase()] = value;
      calls.push({
        url: String(input),
        headers,
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      if (status !== 200) return new Response("gateway failure", { status });
      if (String(input).endsWith("/messages") && payload) {
        // The adapter streams Messages calls; replay the payload as SSE frames.
        const p = payload as { content?: { text?: string }[]; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
        const frames = [
          { type: "message_start", message: { usage: { input_tokens: p.usage?.input_tokens } } },
          ...(p.content ?? []).map((block) => ({ type: "content_block_delta", delta: { type: "text_delta", text: block.text ?? "" } })),
          { type: "message_delta", delta: { stop_reason: p.stop_reason }, usage: { output_tokens: p.usage?.output_tokens } },
          { type: "message_stop" },
        ];
        return new Response(frames.map((f) => `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`).join(""), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      return new Response(
        JSON.stringify(
          payload ?? {
            choices: [{ message: { content: "lovable answered" } }],
            usage: { prompt_tokens: 7, completion_tokens: 4 },
          },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return calls;
}

describe("lovable provider registration", () => {
  it("is absent from the paid chain without a key", () => {
    expect(providerConfig("lovable")).toBeNull();
    expect(providerChain().map((entry) => entry.name)).not.toContain("lovable");
  });

  it("is the only provider in the chain, even when old provider keys are present", () => {
    process.env["GOOGLE_AI_API_KEY"] = "test-google";
    process.env["OPENAI_API_KEY"] = "test-openai";
    process.env["AI_DEFAULT_PROVIDER"] = "openai";
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    expect(providerChain().map((entry) => entry.name)).toEqual(["lovable"]);
  });

  it("serves a model roster for every role from the verified gateway catalogue", () => {
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    const config = providerConfig("lovable");
    expect(config).not.toBeNull();
    for (const roster of Object.values(config!.models)) {
      for (const model of roster.split(",").map((id) => id.trim())) {
        expect(model).toMatch(/^(openai|google|anthropic)\//);
      }
    }
    // Claude is part of the team: the adapter speaks the native /v1/messages
    // endpoint for anthropic/* ids.
    expect(
      Object.values(config!.models).some((roster) => roster.includes("anthropic/claude-")),
    ).toBe(true);
  });
});

describe("lovable anthropic messages wire format", () => {
  const ask = async (model: string) => {
    const calls = stubGateway(200, { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
    await lovableAdapter.chat({ apiKey: "test-lovable", model, messages: [{ role: "user", content: "hi" }], json: false, maxOutputTokens: 64, signal: new AbortController().signal });
    return (calls[0]!.body["output_config"] as { effort: string }).effort;
  };

  it("asks every Claude model for low effort by default", async () => {
    expect(await ask("anthropic/claude-fable-5-1")).toBe("low");
    expect(await ask("anthropic/claude-sonnet-5")).toBe("low");
  });

  it("lets AI_FABLE_EFFORT raise Fable only, and ignores unknown values", async () => {
    vi.stubEnv("AI_FABLE_EFFORT", "high");
    expect(await ask("anthropic/claude-fable-5-1")).toBe("high");
    expect(await ask("anthropic/claude-sonnet-5")).toBe("low");
    expect(await ask("anthropic/claude-opus-5-5")).toBe("low");
    vi.stubEnv("AI_FABLE_EFFORT", "ultra");
    expect(await ask("anthropic/claude-fable-5-1")).toBe("low");
    vi.unstubAllEnvs();
  });

  it("calls /v1/messages with a top-level system prompt and Anthropic usage", async () => {
    const calls = stubGateway(200, {
      content: [{ type: "text", text: "claude answered" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 11, output_tokens: 6 },
    });
    const result = await lovableAdapter.chat({
      apiKey: "test-lovable",
      model: "anthropic/claude-sonnet-5",
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hello" },
      ],
      json: false,
      maxOutputTokens: 256,
      signal: new AbortController().signal,
    });
    expect(result.text).toBe("claude answered");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 6 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://ai.gateway.lovable.dev/v1/messages");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer test-lovable");
    expect(calls[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0]!.body["model"]).toBe("anthropic/claude-sonnet-5");
    expect(calls[0]!.body["system"]).toBe("be terse");
    expect(calls[0]!.body["max_tokens"]).toBe(256);
    expect(calls[0]!.body["messages"]).toEqual([{ role: "user", content: "hello" }]);
  });

  it("converts image parts to base64 Messages blocks", async () => {
    const calls = stubGateway(200, {
      content: [{ type: "text", text: "seen" }],
      usage: { input_tokens: 3, output_tokens: 1 },
    });
    await lovableAdapter.chat({
      apiKey: "test-lovable",
      model: "anthropic/claude-haiku-4-5",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image", dataUrl: "data:image/png;base64,QUJD", mimeType: "image/png" },
          ],
        },
      ],
      json: false,
      maxOutputTokens: 64,
      signal: new AbortController().signal,
    });
    expect(calls[0]!.body["messages"]).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
        ],
      },
    ]);
  });

  it("treats a refusal stop_reason as a failed answer so the router fails over", async () => {
    stubGateway(200, { content: [], stop_reason: "refusal" });
    await expect(
      lovableAdapter.chat({
        apiKey: "test-lovable",
        model: "anthropic/claude-opus-5-5",
        messages: [{ role: "user", content: "hello" }],
        json: false,
        maxOutputTokens: 64,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ category: "bad_response", provider: "lovable" });
  });

  it("streams anthropic answers as chat-completions SSE", async () => {
    stubGateway(200, {
      content: [{ type: "text", text: "streamed claude" }],
      usage: { input_tokens: 2, output_tokens: 2 },
    });
    const stream = await lovableAdapter.stream({
      apiKey: "test-lovable",
      model: "anthropic/claude-sonnet-5",
      messages: [{ role: "user", content: "hello" }],
      maxOutputTokens: 64,
      signal: new AbortController().signal,
    });
    const text = await new Response(stream).text();
    expect(text).toContain("streamed claude");
    expect(text).toContain("data: [DONE]");
  });
});

describe("lovable adapter wire format", () => {
  it("calls the gateway chat-completions endpoint with both key headers", async () => {
    const calls = stubGateway();
    const result = await lovableAdapter.chat({
      apiKey: "test-lovable",
      model: "google/gemini-3.8-flash",
      messages: [{ role: "user", content: "hello" }],
      json: false,
      maxOutputTokens: 256,
      temperature: 0.4,
      signal: new AbortController().signal,
    });
    expect(result.text).toBe("lovable answered");
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 4 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(calls[0]!.headers["authorization"]).toBe("Bearer test-lovable");
    expect(calls[0]!.headers["lovable-api-key"]).toBe("test-lovable");
    expect(calls[0]!.headers["x-lovable-aig-sdk"]).toBe("fetch");
    // Non-reasoning Gemini models take max_tokens and the caller's temperature.
    expect(calls[0]!.body["model"]).toBe("google/gemini-3.8-flash");
    expect(calls[0]!.body["max_tokens"]).toBe(256);
    expect(calls[0]!.body["temperature"]).toBe(0.4);
    expect(calls[0]!.body["max_completion_tokens"]).toBeUndefined();
  });

  it("sends GPT-6 models max_completion_tokens and a reasoning effort, never a temperature", async () => {
    const calls = stubGateway();
    await lovableAdapter.chat({
      apiKey: "test-lovable",
      model: "openai/gpt-6-sol",
      messages: [{ role: "user", content: "hello" }],
      json: false,
      maxOutputTokens: 512,
      temperature: 0.9,
      signal: new AbortController().signal,
    });
    expect(calls[0]!.body["max_completion_tokens"]).toBe(512);
    expect(calls[0]!.body["reasoning_effort"]).toBe("low");
    expect(calls[0]!.body["max_tokens"]).toBeUndefined();
    expect(calls[0]!.body["temperature"]).toBeUndefined();
  });

  it("says \"json\" in the prompt when JSON mode is on, because the gateway refuses it otherwise", async () => {
    const calls = stubGateway();
    const base = { apiKey: "test-lovable", model: "openai/gpt-6.1-sol", json: true, maxOutputTokens: 256, signal: new AbortController().signal };
    const sent = () => (calls.at(-1)!.body["messages"] as { role: string; content: string }[]);
    // No mention anywhere: it is added once, to the first system message.
    await lovableAdapter.chat({ ...base, messages: [{ role: "system", content: "Review the plan." }, { role: "user", content: "Is it fine?" }] });
    expect(calls.at(-1)!.body["response_format"]).toEqual({ type: "json_object" });
    expect(sent().map((m) => m.content)).toEqual(["Review the plan.\n\nRespond with a single JSON object.", "Is it fine?"]);
    // No system message: one is put in front.
    await lovableAdapter.chat({ ...base, messages: [{ role: "user", content: "Is it fine?" }] });
    expect(sent()[0]).toEqual({ role: "system", content: "Respond with a single JSON object." });
    // Already mentioned (any case, any message): left exactly as written.
    await lovableAdapter.chat({ ...base, messages: [{ role: "user", content: "Answer in Json please" }] });
    expect(sent()).toEqual([{ role: "user", content: "Answer in Json please" }]);
    // JSON mode off: untouched.
    await lovableAdapter.chat({ ...base, json: false, messages: [{ role: "user", content: "hi" }] });
    expect(sent()).toEqual([{ role: "user", content: "hi" }]);
  });

  it("treats an empty answer as a failure so the router fails over", async () => {
    stubGateway(200, { choices: [{ message: { content: "" } }] });
    await expect(
      lovableAdapter.chat({
        apiKey: "test-lovable",
        model: "openai/gpt-6-astra",
        messages: [{ role: "user", content: "hello" }],
        json: false,
        maxOutputTokens: 128,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ category: "bad_response", provider: "lovable" });
  });
});

describe("lovable through the router", () => {
  it("answers through the gateway when it is the only keyed provider", async () => {
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    const calls = stubGateway();

    const { generateText } = await import("@/lib/ai/router.server");
    const result = await generateText(
      { task: "test.lovable", organizationId: null, userId: null },
      { messages: [{ role: "user", content: "hello" }] },
    );

    expect(result.text).toBe("lovable answered");
    expect(result.provider).toBe("lovable");
    expect(calls.some((call) => call.url.includes("ai.gateway.lovable.dev"))).toBe(true);
  }, 30_000);

  it("never reaches the gateway inside a free-only spending scope", async () => {
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    const calls = stubGateway();

    const { generateText } = await import("@/lib/ai/router.server");
    const { withAiSpendScope } = await import("@/lib/ai/spend-scope.server");
    await expect(
      withAiSpendScope({ freeOnly: true, reason: "demo_workspace" }, () =>
        generateText(
          { task: "test.lovable", organizationId: null, userId: null },
          { messages: [{ role: "user", content: "hello" }] },
        ),
      ),
    ).rejects.toMatchObject({ name: "RevoraAiError" });
    expect(calls.some((call) => call.url.includes("ai.gateway.lovable.dev"))).toBe(false);
  }, 30_000);
});

describe("per-job model preference", () => {
  it("moves preferred paid models first and avoided ones last without dropping any", async () => {
    const { applyModelPreference } = await import("./router.server");
    const chain = [
      { model: "a", free: null },
      { model: "b", free: null },
      { model: "c", free: null },
      { model: "free-x", free: {} },
    ];
    expect(applyModelPreference(chain, ["c"], ["a"]).map((e) => e.model)).toEqual(["c", "b", "free-x", "a"]);
  });
  it("gives fact checking to Claude Sonnet 5 and SEO to Gemini 4 Argon", async () => {
    const { REVIEW_AREA_MODELS } = await import("@/lib/builder/review-panel.server");
    expect(REVIEW_AREA_MODELS.truthfulness).toEqual(["anthropic/claude-sonnet-5"]);
    expect(REVIEW_AREA_MODELS.seo).toEqual(["google/gemini-4-argon"]);
  });
});

/**
 * A long answer from a slow model used to sit on one silent connection until
 * the gateway's edge gave up with a 524 after about two minutes. The router
 * then repeated the identical request on the same model (another 125 s) and
 * left the fallback model 49 s of the chain, so a first build's creative step
 * failed with every model idle. These tests pin the three fixes: answers are
 * streamed, an edge timeout is a timeout (handed to the next model, not
 * retried), and a stalled stream is cut quickly.
 */
const encoder = new TextEncoder();
const sse = (events: unknown[], tail = "data: [DONE]\n\n") =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + tail;
const delta = (content: string, finish: string | null = null) => ({ choices: [{ delta: { content }, finish_reason: finish }] });

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new Response(text, { headers: { "content-type": "text/event-stream" } }).body!;
}

/** A stream that delivers its chunks and then goes silent without ever closing. */
function stallingStream(chunks: string[]): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent < chunks.length) {
        controller.enqueue(encoder.encode(chunks[sent]!));
        sent += 1;
        return undefined;
      }
      return new Promise<void>(() => undefined);
    },
  });
}

type StreamCaptured = { url: string; body: Record<string, unknown> };

function stubStreamFetch(respond: (call: StreamCaptured, index: number) => Response) {
  const calls: StreamCaptured[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const call = { url: String(input), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {} };
      calls.push(call);
      return respond(call, calls.length - 1);
    }),
  );
  return calls;
}

const ask = (model = "openai/gpt-6.1-sol", maxOutputTokens = 4000) =>
  lovableAdapter.chat({
    apiKey: "test-lovable",
    model,
    messages: [{ role: "user", content: "plan the site" }],
    json: true,
    maxOutputTokens,
    signal: new AbortController().signal,
  });

describe("a gateway edge timeout is a timeout, not an outage", () => {
  it("classifies 504, 522 and 524 as timeouts and leaves real outages alone", () => {
    for (const status of [408, 504, 522, 524]) expect(categoryForStatus(status), String(status)).toBe("timeout");
    for (const status of [500, 502, 503]) expect(categoryForStatus(status), String(status)).toBe("provider_unavailable");
  });
});

describe("chat-completions answers are streamed", () => {
  it("asks for a stream with usage and returns the accumulated answer", async () => {
    const calls = stubStreamFetch(
      () =>
        new Response(
          sse([
            delta('{"brief":'),
            delta('{"concept":"x"}}'),
            { choices: [{ delta: {}, finish_reason: "stop" }] },
            { choices: [], usage: { prompt_tokens: 120, completion_tokens: 33 } },
          ]),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const result = await ask();
    expect(result.text).toBe('{"brief":{"concept":"x"}}');
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 33 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(calls[0]!.body["stream"]).toBe(true);
    expect(calls[0]!.body["stream_options"]).toEqual({ include_usage: true });
    expect(calls[0]!.body["max_completion_tokens"]).toBe(4000);
    expect(calls[0]!.body["response_format"]).toEqual({ type: "json_object" });
  });

  it("still accepts a plain JSON completion when the gateway ignores stream", async () => {
    stubStreamFetch(
      () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "plain answer" } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const result = await ask("google/gemini-3.8-flash");
    expect(result.text).toBe("plain answer");
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });

  it("reports a streamed answer cut off at the output limit as a failure, never a partial plan", async () => {
    stubStreamFetch(() => new Response(sse([delta("half a pla", "length")]), { headers: { "content-type": "text/event-stream" } }));
    await expect(ask()).rejects.toMatchObject({ category: "bad_response", provider: "lovable" });
  });

  it("treats an empty stream as a failure so the router fails over", async () => {
    stubStreamFetch(() => new Response(sse([{ choices: [{ delta: {}, finish_reason: "stop" }] }]), { headers: { "content-type": "text/event-stream" } }));
    await expect(ask()).rejects.toMatchObject({ category: "bad_response" });
  });

  it("drops stream_options once, and remembers the gateway refused it", async () => {
    const calls = stubStreamFetch((call) =>
      "stream_options" in call.body
        ? new Response('{"error":"Unknown parameter: stream_options"}', { status: 400 })
        : new Response(sse([delta("ok", "stop")]), { headers: { "content-type": "text/event-stream" } }),
    );
    const { lovableAdapter: adapter } = await import("@/lib/ai/providers/lovable");
    const run = () =>
      adapter.chat({
        apiKey: "test-lovable",
        model: "openai/gpt-6.1-sol",
        messages: [{ role: "user", content: "hi" }],
        json: false,
        maxOutputTokens: 100,
        signal: new AbortController().signal,
      });
    expect((await run()).text).toBe("ok");
    expect(calls).toHaveLength(2);
    expect("stream_options" in calls[1]!.body).toBe(false);
    expect((await run()).text).toBe("ok");
    expect(calls).toHaveLength(3);
    expect("stream_options" in calls[2]!.body).toBe(false);
  });

  it("falls back to the plain request when the gateway refuses to stream a model, and remembers it for that model only", async () => {
    const calls = stubStreamFetch((call) =>
      call.body["stream"] === true
        ? new Response('{"error":"streaming is not supported with this response format"}', { status: 400 })
        : new Response(JSON.stringify({ choices: [{ message: { content: "plain ok" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), {
            headers: { "content-type": "application/json" },
          }),
    );
    const { lovableAdapter: adapter } = await import("@/lib/ai/providers/lovable");
    const run = (model: string) =>
      adapter.chat({ apiKey: "test-lovable", model, messages: [{ role: "user", content: "hi" }], json: true, maxOutputTokens: 100, signal: new AbortController().signal });
    expect((await run("openai/gpt-6.1-sol")).text).toBe("plain ok");
    // streamed (refused), streamed again without stream_options is not tried: the refusal is not about it.
    expect(calls.map((call) => call.body["stream"] === true)).toEqual([true, false]);
    // The next call for this model goes straight to the plain request.
    expect((await run("openai/gpt-6.1-sol")).text).toBe("plain ok");
    expect(calls.map((call) => call.body["stream"] === true)).toEqual([true, false, false]);
    // Another model still tries streaming first.
    await run("google/gemini-3.8-flash");
    expect(calls[3]!.body["stream"]).toBe(true);
  });

  it("reports a genuinely malformed request as it always was, without remembering a refusal", async () => {
    const calls = stubStreamFetch(() => new Response('{"error":"messages must not be empty"}', { status: 400 }));
    await expect(ask("openai/gpt-6-sol")).rejects.toMatchObject({ category: "invalid_request", detail: expect.stringContaining("messages must not be empty") });
    // The streamed request, then the plain one to be sure; both failed.
    expect(calls).toHaveLength(2);
    // Not remembered: the next call still tries streaming first.
    await expect(ask("openai/gpt-6-sol")).rejects.toMatchObject({ category: "invalid_request" });
    expect(calls[2]!.body["stream"]).toBe(true);
  });

  it("sends the plain request when an operator switches streaming off", async () => {
    vi.stubEnv("AI_LOVABLE_STREAM", "off");
    const calls = stubStreamFetch(
      () => new Response(JSON.stringify({ choices: [{ message: { content: "plain" } }] }), { headers: { "content-type": "application/json" } }),
    );
    expect((await ask()).text).toBe("plain");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body["stream"]).toBeUndefined();
    expect(calls[0]!.body["stream_options"]).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("turns a gateway 524 into a timeout the router can act on", async () => {
    stubStreamFetch(() => new Response("error code: 524", { status: 524 }));
    await expect(ask()).rejects.toMatchObject({ category: "timeout", status: 524 });
  });
});

describe("readChatStream", () => {
  it("reads CRLF-framed events and ignores keep-alive comments and malformed frames", async () => {
    const text = [
      ": keep-alive",
      "",
      `data: ${JSON.stringify(delta("one "))}`,
      "",
      "data: not json",
      "",
      `data: ${JSON.stringify(delta("two", "stop"))}`,
      "",
      "data: [DONE]",
      "",
    ].join("\r\n");
    const read = await readChatStream(streamOf(text));
    expect(read.text).toBe("one two");
    expect(read.finishReason).toBe("stop");
  });

  it("fails on an error frame", async () => {
    await expect(readChatStream(streamOf(sse([{ error: { message: "model overloaded" } }])))).rejects.toMatchObject({
      category: "bad_response",
      detail: "model overloaded",
    });
  });

  it("cuts a stream that goes silent instead of waiting out the whole attempt", async () => {
    const started = Date.now();
    await expect(
      readChatStream(stallingStream([`data: ${JSON.stringify(delta("start"))}\n\n`]), { firstChunkMs: 500, idleMs: 40 }),
    ).rejects.toMatchObject({ category: "timeout", provider: "lovable" });
    expect(Date.now() - started).toBeLessThan(400);
  });

  it("gives a slow first token longer than the gaps between later chunks", async () => {
    const started = Date.now();
    await expect(readChatStream(stallingStream([]), { firstChunkMs: 60, idleMs: 20 })).rejects.toMatchObject({ category: "timeout" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });
});

describe("a timed-out model hands over instead of being asked again", () => {
  it("asks the next model after one 524, not the same model twice", async () => {
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    process.env["AI_LOVABLE_MODEL_FAST"] = "openai/gpt-6.1-sol,anthropic/claude-sonnet-5";
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    const models: string[] = [];
    stubStreamFetch((call) => {
      models.push(String(call.body["model"]));
      if (String(call.body["model"]).startsWith("openai/")) return new Response("error code: 524", { status: 524 });
      return new Response(
        [
          `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 9 } } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "claude took over" } })}\n\n`,
          `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } })}\n\n`,
        ].join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    const { generateText } = await import("@/lib/ai/router.server");
    const result = await generateText(
      { task: "test.gateway-timeout", organizationId: null, userId: null },
      { role: "fast", messages: [{ role: "user", content: "hello" }] },
    );
    expect(result.text).toBe("claude took over");
    expect(models).toEqual(["openai/gpt-6.1-sol", "anthropic/claude-sonnet-5"]);
  }, 30_000);
});

describe("the chain budget leaves the fallback a real attempt", () => {
  it("covers two full attempts for every answer size, up to a six-minute ceiling", () => {
    for (const tokens of [500, 1200, 3500, 6000]) {
      expect(thinkerChainBudgetMs(tokens), String(tokens)).toBeGreaterThanOrEqual(
        Math.min(350_000, thinkerAttemptTimeoutMs(tokens) * 2),
      );
    }
    expect(thinkerChainBudgetMs(9500)).toBe(360_000);
    // Short answers no longer hold a build for five minutes when a model is down.
    expect(thinkerChainBudgetMs(500)).toBeLessThan(300_000);
  });
});

describe("a stopped build stops spending", () => {
  const configure = () => {
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    process.env["AI_LOVABLE_MODEL_FAST"] = "openai/gpt-6.1-sol,anthropic/claude-sonnet-5";
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
  };
  const ask = async (scope: { signal: AbortSignal }) => {
    const { generateText } = await import("@/lib/ai/router.server");
    const { withAiSpendScope } = await import("@/lib/ai/spend-scope.server");
    return withAiSpendScope({ freeOnly: false, reason: null, signal: scope.signal }, () =>
      generateText({ task: "test.stopped", organizationId: null, userId: null }, { role: "fast", messages: [{ role: "user", content: "hello" }] }),
    );
  };

  it("never starts a call for a build that was already stopped", async () => {
    configure();
    const calls = stubStreamFetch(() => new Response("should not be called", { status: 500 }));
    const stopped = new AbortController();
    stopped.abort();
    await expect(ask(stopped)).rejects.toMatchObject({ category: "cancelled", status: 499 });
    expect(calls).toHaveLength(0);
  }, 30_000);

  it("aborts a call in flight and does not move on to the next model", async () => {
    configure();
    const aborted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          aborted.push("started");
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        }),
      ),
    );
    const owner = new AbortController();
    const pending = ask(owner);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(aborted).toEqual(["started"]);
    owner.abort();
    await expect(pending).rejects.toMatchObject({ category: "cancelled" });
    // One request was in flight; stopping did not start the fallback model's.
    expect(aborted).toEqual(["started"]);
  }, 30_000);

  it("does not bench the provider or count the stop as a failure", async () => {
    configure();
    const { degradedProviders } = await import("@/lib/ai/provider-backoff");
    stubStreamFetch(() => new Response("unused", { status: 500 }));
    const stopped = new AbortController();
    stopped.abort();
    await expect(ask(stopped)).rejects.toMatchObject({ category: "cancelled" });
    expect(degradedProviders()).toEqual([]);
  }, 30_000);

  it("keeps the stop signal through a nested spending scope", async () => {
    const { withAiSpendScope, scopedBuildStopped } = await import("@/lib/ai/spend-scope.server");
    const owner = new AbortController();
    const seen = withAiSpendScope({ freeOnly: false, reason: null, signal: owner.signal }, () =>
      withAiSpendScope({ freeOnly: false, reason: null }, () => {
        const before = scopedBuildStopped();
        owner.abort();
        return [before, scopedBuildStopped()];
      }),
    );
    expect(seen).toEqual([false, true]);
    // Outside any build there is nothing to stop.
    expect(scopedBuildStopped()).toBe(false);
  });
});
