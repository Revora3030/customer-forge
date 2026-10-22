import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reserveBudget = vi.fn();
const settleBudget = vi.fn();
const recordUsage = vi.fn();
vi.mock("@/lib/ai/luna.server", () => ({
  MICROCENTS_PER_DOLLAR: 100_000_000,
  reserveBudget: (...a: unknown[]) => reserveBudget(...a),
  settleBudget: (...a: unknown[]) => settleBudget(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));

let key: string | null = "k";
vi.mock("@/lib/ai/config", () => ({ providerConfig: () => (key ? { apiKey: key } : null) }));
const post = vi.fn();
vi.mock("@/lib/ai/providers/lovable", () => ({ postLovableSpeech: (...a: unknown[]) => post(...a) }));

import { lovableSpeechBody, synthesizeLovableSpeech, LOVABLE_SPEECH_MAX_BYTES } from "./lovable-speech.server";
import { resolveVoiceProvider } from "@/lib/jarvis-voice.functions";

const wav = () => {
  const b = new Uint8Array(100);
  b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  b.set([..."WAVE"].map((c) => c.charCodeAt(0)), 8);
  return b;
};

beforeEach(() => {
  key = "k";
  reserveBudget.mockResolvedValue({ allowed: true, paid: null, cap: 1 });
  settleBudget.mockResolvedValue(undefined);
  recordUsage.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("Lovable speech", () => {
  it("sends the Gemini TTS body to /v1/audio/speech and returns WAV", async () => {
    post.mockResolvedValue(new Response(wav(), { status: 200 }));
    const r = await synthesizeLovableSpeech("Hello there", { organizationId: null });
    expect(r.ok && r.contentType).toBe("audio/wav");
    expect((post.mock.calls[0]![0] as { stream_format: string }).stream_format).toBe("audio");
    expect(settleBudget).toHaveBeenCalledWith(null, expect.any(Number), expect.any(Number), null);
  });

  it("refuses without calling the provider when the cap is used up", async () => {
    reserveBudget.mockResolvedValue({ allowed: false, paid: null, cap: 1 });
    const r = await synthesizeLovableSpeech("Hi", { organizationId: null });
    expect(r.ok ? "" : r.code).toBe("budget_exhausted");
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses when the ledger cannot be read", async () => {
    reserveBudget.mockResolvedValue(null);
    const r = await synthesizeLovableSpeech("Hi", { organizationId: null });
    expect(r.ok ? "" : r.code).toBe("ledger_unavailable");
  });

  it("reports upstream failure and settles the reservation to zero", async () => {
    post.mockResolvedValue((new Response("no", { status: 402 })));
    const r = await synthesizeLovableSpeech("Hi", { organizationId: null });
    expect(r.ok ? "" : r.code).toBe("provider_error");
    expect(settleBudget.mock.calls[0]![2]).toBe(0);
  });

  it("rejects non-audio bodies and oversize audio", async () => {
    post.mockResolvedValue((new Response("{\"x\":1}".padEnd(200, " "), { status: 200 })));
    expect((await synthesizeLovableSpeech("Hi", { organizationId: null })).ok).toBe(false);
    post.mockResolvedValue((new Response(new Uint8Array(LOVABLE_SPEECH_MAX_BYTES + 1), { status: 200 })));
    const r = await synthesizeLovableSpeech("Hi", { organizationId: null });
    expect(r.ok ? "" : r.code).toBe("too_large");
  });

  it("is unavailable without a key", async () => {
    key = null;
    const r = await synthesizeLovableSpeech("Hi", { organizationId: null });
    expect(r.ok ? "" : r.code).toBe("not_configured");
  });

  it("body never carries OpenAI-only fields", () => {
    const body = lovableSpeechBody("google/gemini-3.1-flash-tts-preview", "Hi");
    expect(body).not.toHaveProperty("voice");
    expect(body).not.toHaveProperty("response_format");
  });
});

describe("voice provider choice", () => {
  it("Auto keeps ElevenLabs when configured, else Lovable", () => {
    expect(resolveVoiceProvider("auto", true, true)).toBe("elevenlabs");
    expect(resolveVoiceProvider("auto", false, true)).toBe("lovable");
    expect(resolveVoiceProvider("lovable", true, false)).toBeNull();
    expect(resolveVoiceProvider("elevenlabs", false, true)).toBeNull();
  });
});
