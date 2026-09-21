/**
 * Cloudflare Workers AI adapter — Revora's own Cloudflare account token,
 * called through Cloudflare's OpenAI-compatible endpoint for chat, and through
 * Workers AI's own `ai/run` endpoint for image generation.
 *
 * Workers Free includes a daily Neuron allowance, so the models Revora selects
 * here (see `src/lib/ai/free.ts`) cost nothing to run. The account id is read
 * from the server environment at call time, never bundled.
 *
 * Image generation is live-verified against this account: `ai/run` answers
 * either JSON (`{ result: { image: <base64 jpeg> } }`) or a raw PNG body,
 * depending on the model, and both shapes are handled below.
 */

import { RevoraAiError } from "@/lib/ai/errors";
import { imageEditCapableModel } from "@/lib/ai/free";
import { buildCloudflareImageBody } from "@/lib/ai/providers/cloudflare-image";
import { createOpenAiCompatibleAdapter } from "@/lib/ai/providers/openai-compatible";
import { providerHttpError } from "@/lib/ai/providers/shared";
import type { ProviderAdapter } from "@/lib/ai/types";

function accountId() {
  return process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim() ?? null;
}

const chatAdapter = createOpenAiCompatibleAdapter({
  name: "cloudflare",
  baseUrl: () => {
    const id = accountId();
    if (!id) return null;
    return `https://api.cloudflare.com/client/v4/accounts/${id}/ai/v1`;
  },
});

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

export const cloudflareAdapter: ProviderAdapter = {
  ...chatAdapter,

  async image({ apiKey, model, prompt, source, signal }) {
    const id = accountId();
    if (!id)
      throw new RevoraAiError(503, "Revora's Cloudflare AI provider is not configured.", {
        category: "not_configured",
        provider: "cloudflare",
      });
    // Editing an existing picture only works on an image-to-image / inpainting
    // model. The router filters the chain down to those before calling, so a
    // text-to-image model reaching here with a source is a routing fault, not a
    // request Revora may quietly answer with an unrelated new picture.
    if (source && !imageEditCapableModel(model))
      throw new RevoraAiError(403, "That Cloudflare picture model cannot change a picture.", {
        category: "policy",
        provider: "cloudflare",
      });


    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "user-agent": "RevoraGrowthSystems/1.0 (+https://revoragrowthsystems.com)",
          accept: "application/json, image/*",
        },
        body: JSON.stringify(buildCloudflareImageBody(prompt, source)),
        signal,
      },
    );
    if (!response.ok) throw await providerHttpError("cloudflare", response);

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        result?: { image?: unknown };
        success?: boolean;
        errors?: { message?: string }[];
      };
      const base64 = payload.result?.image;
      if (typeof base64 !== "string" || base64.length === 0)
        throw new RevoraAiError(502, "Revora's Cloudflare image model returned no picture.", {
          category: "bad_response",
          provider: "cloudflare",
          detail: payload.errors?.[0]?.message?.slice(0, 200) ?? null,
        });
      // Workers AI returns JPEG bytes for the flux family.
      return { base64, mimeType: "image/jpeg" };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0)
      throw new RevoraAiError(502, "Revora's Cloudflare image model returned an empty picture.", {
        category: "bad_response",
        provider: "cloudflare",
      });
    return {
      base64: bytesToBase64(bytes),
      mimeType: contentType.startsWith("image/") ? contentType.split(";")[0]! : "image/png",
    };
  },
};
