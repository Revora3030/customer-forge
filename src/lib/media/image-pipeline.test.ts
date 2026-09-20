import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudflareAdapter } from "@/lib/ai/providers/cloudflare";
import { RevoraAiError } from "@/lib/ai/errors";
import { validateGeneratedImage } from "@/lib/image-studio.server";

const ACCOUNT = "CLOUDFLARE_ACCOUNT_ID";
let savedAccount: string | undefined;

function jpegBase64(bytes = 4096) {
  return btoa("\u00ff\u00d8\u00ff".padEnd(bytes, "x"));
}

beforeEach(() => {
  savedAccount = process.env[ACCOUNT];
  process.env[ACCOUNT] = "test-account";
});

afterEach(() => {
  if (savedAccount === undefined) delete process.env[ACCOUNT];
  else process.env[ACCOUNT] = savedAccount;
  vi.restoreAllMocks();
});

describe("Cloudflare Workers AI picture request", () => {
  it("posts the brief to the account's own model endpoint with a bearer token", async () => {
    const fetchMock = vi.fn(async (url: unknown, init: unknown) => {
      expect(String(url)).toBe(
        "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/black-forest-labs/flux-1-schnell",
      );
      const request = init as { method: string; headers: Record<string, string>; body: string };
      expect(request.method).toBe("POST");
      expect(request.headers["authorization"]).toBe("Bearer cf-token");
      expect(JSON.parse(request.body)).toEqual({ prompt: "A calm workshop interior" });
      return new Response(JSON.stringify({ result: { image: jpegBase64() } }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await cloudflareAdapter.image({
      apiKey: "cf-token",
      model: "@cf/black-forest-labs/flux-1-schnell",
      prompt: "A calm workshop interior",
      source: null,
      signal: new AbortController().signal,
    });
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.base64.length).toBeGreaterThan(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never leaks the token into the error surfaced to the builder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    await expect(
      cloudflareAdapter.image({
        apiKey: "super-secret-token",
        model: "@cf/black-forest-labs/flux-1-schnell",
        prompt: "x",
        source: null,
        signal: new AbortController().signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof RevoraAiError && !JSON.stringify(error.message).includes("super-secret"),
    );
  });

  it("reports an empty provider answer as a bad response instead of a picture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ result: {} }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(
      cloudflareAdapter.image({
        apiKey: "cf-token",
        model: "@cf/black-forest-labs/flux-1-schnell",
        prompt: "x",
        source: null,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/no picture/i);
  });

  it("refuses to edit a picture with a model that cannot edit", async () => {
    await expect(
      cloudflareAdapter.image({
        apiKey: "cf-token",
        model: "@cf/black-forest-labs/flux-1-schnell",
        prompt: "x",
        source: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/cannot edit/i);
  });

  it("fails clearly when the account id is not configured", async () => {
    delete process.env[ACCOUNT];
    await expect(
      cloudflareAdapter.image({
        apiKey: "cf-token",
        model: "@cf/black-forest-labs/flux-1-schnell",
        prompt: "x",
        source: null,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/not configured/i);
  });
});

describe("generated picture validation", () => {
  it("accepts a real JPEG payload", () => {
    expect(validateGeneratedImage({ base64: jpegBase64(), mimeType: "image/jpeg" }).ok).toBe(true);
  });

  it("rejects an unsupported format", () => {
    const result = validateGeneratedImage({ base64: jpegBase64(), mimeType: "text/html" });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty picture", () => {
    expect(validateGeneratedImage({ base64: "AAAA", mimeType: "image/png" }).ok).toBe(false);
  });

  it("rejects damaged picture data", () => {
    expect(validateGeneratedImage({ base64: "!!!not base64!!!", mimeType: "image/png" }).ok).toBe(
      false,
    );
  });

  it("rejects a picture too large to store", () => {
    const huge = "A".repeat(12 * 1024 * 1024);
    expect(validateGeneratedImage({ base64: huge, mimeType: "image/png" }).ok).toBe(false);
  });
});
