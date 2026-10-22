import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
