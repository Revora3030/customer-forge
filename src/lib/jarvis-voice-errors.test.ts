import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeElevenLabsFailure, ElevenLabsError, readErrorBody } from "@/lib/jarvis-voice.server";
import { voiceFallbackCode } from "@/components/app/jarvis-voice-gate";

// Bodies shaped like ElevenLabs' real error responses.
const body = (status: string, message: string) => JSON.stringify({ detail: { status, message } });

describe("ElevenLabs failures are described truthfully", () => {
  it("401 quota_exceeded", () => {
    const failure = describeElevenLabsFailure(
      401,
      body("quota_exceeded", "This request exceeds your quota of 10000. You have 12 credits remaining, while 40 credits are required for this request."),
    );
    expect(failure.code).toBe("quota_exceeded");
    expect(failure.message).toContain("ElevenLabs character quota is used up");
  });

  it("401 detected_unusual_activity", () => {
    const failure = describeElevenLabsFailure(
      401,
      body("detected_unusual_activity", "Unusual activity detected. Free Tier usage disabled. If you are using a proxy/VPN you might need to purchase a Paid Plan."),
    );
    expect(failure.code).toBe("detected_unusual_activity");
    expect(failure.message).toContain("ElevenLabs blocked this server (free plans can't be used from cloud servers)");
  });

  it("401 missing_permissions and invalid_api_key", () => {
    const missing = describeElevenLabsFailure(
      401,
      body("missing_permissions", "The API key you used is missing the permission text_to_speech to execute this operation."),
    );
    expect(missing.code).toBe("missing_permissions");
    expect(missing.message).toContain("the key is missing a permission");
    const invalid = describeElevenLabsFailure(401, body("invalid_api_key", "Invalid API key"));
    expect(invalid.code).toBe("invalid_api_key");
    expect(invalid.message).toContain("the API key was rejected");
  });

  it("302 is a refused redirect", () => {
    expect(describeElevenLabsFailure(302, "").message).toContain("redirect refused");
  });

  it("402 needs a paid plan", () => {
    const failure = describeElevenLabsFailure(402, body("payment_required", "Payment required."));
    expect(failure.code).toBe("payment_required");
    expect(failure.message).toContain("ElevenLabs needs a paid plan or payment");
  });

  it("429 separates concurrency from rate limits", () => {
    expect(
      describeElevenLabsFailure(429, body("too_many_concurrent_requests", "Too many concurrent requests. Your current subscription is associated with a maximum of 2 concurrent requests.")).code,
    ).toBe("too_many_concurrent_requests");
    expect(describeElevenLabsFailure(429, body("system_busy", "We are experiencing heavy traffic.")).code).toBe("rate_limited");
  });

  it("422, voice_not_found and unknown statuses", () => {
    expect(describeElevenLabsFailure(422, JSON.stringify({ detail: [{ msg: "field required" }] })).message).toContain("invalid request");
    expect(describeElevenLabsFailure(400, body("voice_not_found", "A voice with the voice_id abc was not found.")).code).toBe("voice_not_found");
    expect(describeElevenLabsFailure(418, "not json").code).toBe("http_error");
  });

  it("each mapped message maps back to its code on the client, so telemetry carries no text", () => {
    for (const [status, text] of [
      [401, body("quota_exceeded", "")],
      [401, body("detected_unusual_activity", "")],
      [401, body("invalid_api_key", "")],
      [401, body("missing_permissions", "")],
      [404, ""],
      [402, ""],
      [422, ""],
      [429, body("too_many_concurrent_requests", "")],
      [429, ""],
      [302, ""],
      [401, ""],
    ] as const) {
      const failure = describeElevenLabsFailure(status, text);
      expect(voiceFallbackCode(failure.message)).toBe(failure.code);
    }
  });

  it("reads at most 2KB of an error body", async () => {
    const text = await readErrorBody(new Response("x".repeat(10_000), { status: 500 }));
    expect(text.length).toBe(2048);
  });

  it("throws a typed error and reports it without the spoken text", () => {
    const error = new ElevenLabsError(401, "quota_exceeded", "quota");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(401);
    const server = readFileSync("src/lib/jarvis-voice.server.ts", "utf8");
    const report = server.slice(server.indexOf("export async function reportVoiceFailure"), server.indexOf("export async function requestElevenLabsSpeech"));
    expect(report).toContain('route: "jarvis.voice"');
    expect(report).toContain('level: "warning"');
    expect(report).toContain("context: { status: error.status, code: error.code, stream }");
    expect(report).not.toMatch(/\btext\b/);
  });

  it("the status check reuses the mapper and the test is click-only", () => {
    const fns = readFileSync("src/lib/jarvis-voice.functions.ts", "utf8");
    expect(fns).toContain("describeElevenLabsFailure(response.status");
    expect(fns).toContain("key can't list voices; speech may still work");
    const test = fns.slice(fns.indexOf("export const testJarvisVoice"));
    expect(test).toContain("await assertAdmin(context);");
    expect(fns).toContain('const TEST_PHRASE = "Jarvis voice check.";');
    expect(test).toContain("requestElevenLabsSpeech(TEST_PHRASE");
    const status = readFileSync("src/components/app/JarvisVoiceStatus.tsx", "utf8");
    expect(status).toContain("onClick={() => test.mutate()}");
    expect(status).not.toContain("useEffect");
    expect(status).not.toContain("useQuery");
  });
});
