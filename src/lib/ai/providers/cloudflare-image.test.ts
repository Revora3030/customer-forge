import { describe, expect, it } from "vitest";
import {
  EDIT_STRENGTH,
  FULL_COVERAGE_MASK_PNG_BASE64,
  buildCloudflareImageBody,
} from "@/lib/ai/providers/cloudflare-image";
import { imageEditCapableModel, isFreeEligibleModel } from "@/lib/ai/free";

const PNG_HEADER = [137, 80, 78, 71, 13, 10, 26, 10];

describe("cloudflare image request bodies", () => {
  it("makes a plain prompt body when no source picture is given", () => {
    expect(buildCloudflareImageBody("a tidy workshop")).toEqual({ prompt: "a tidy workshop" });
  });

  it("uses the maximum 8 quality steps for Flux and a capped prompt", () => {
    expect(buildCloudflareImageBody("a tidy workshop", null, "@cf/black-forest-labs/flux-1-schnell")).toEqual({
      prompt: "a tidy workshop",
      steps: 8,
    });
    const long = buildCloudflareImageBody("x".repeat(3000), null, "@cf/black-forest-labs/flux-1-schnell");
    expect(long.prompt.length).toBe(2048);
  });

  it("keeps text, watermarks and blur out of Stable Diffusion photos", () => {
    const body = buildCloudflareImageBody("a tidy workshop", null, "@cf/bytedance/stable-diffusion-xl-lightning");
    expect(body).toMatchObject({ prompt: "a tidy workshop" });
    expect((body as { negative_prompt: string }).negative_prompt).toMatch(/watermark/);
  });

  it("sends the source picture and a full-coverage mask when editing", () => {
    const body = buildCloudflareImageBody("same photo at dusk", {
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      mimeType: "image/png",
    });
    if (!("image" in body)) throw new Error("expected an edit body");
    expect(body.prompt).toBe("same photo at dusk");
    expect(body.image.slice(0, 8)).toEqual(PNG_HEADER);
    expect(body.mask.slice(0, 8)).toEqual(PNG_HEADER);
    expect(body.mask.length).toBeGreaterThan(100);
    expect(body.strength).toBe(EDIT_STRENGTH);
    expect(body.num_steps).toBeGreaterThan(0);
  });

  it("keeps the edit strength below a full redraw so the subject survives", () => {
    expect(EDIT_STRENGTH).toBeGreaterThan(0);
    expect(EDIT_STRENGTH).toBeLessThan(1);
  });

  it("carries a decodable mask", () => {
    expect(() => atob(FULL_COVERAGE_MASK_PNG_BASE64)).not.toThrow();
  });

  it("treats only image-to-image / inpainting models as edit capable", () => {
    expect(imageEditCapableModel("@cf/runwayml/stable-diffusion-v1-5-inpainting")).toBe(true);
    expect(imageEditCapableModel("@cf/runwayml/stable-diffusion-v1-5-img2img")).toBe(true);
    expect(imageEditCapableModel("@cf/black-forest-labs/flux-1-schnell")).toBe(false);
  });

  it("keeps the free edit model eligible and billed picture models out", () => {
    expect(isFreeEligibleModel("cloudflare", "@cf/runwayml/stable-diffusion-v1-5-inpainting")).toBe(
      true,
    );
    expect(isFreeEligibleModel("cloudflare", "@cf/leonardo/phoenix-1.0")).toBe(false);
    expect(isFreeEligibleModel("cloudflare", "@cf/black-forest-labs/flux-2-dev")).toBe(false);
  });
});
