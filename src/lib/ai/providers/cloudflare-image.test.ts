import { describe, expect, it } from "vitest";
import {
  EDIT_STRENGTH,
  FULL_COVERAGE_MASK_PNG_BASE64,
  buildCloudflareImageBody,
} from "@/lib/ai/providers/cloudflare-image";
import { imageEditCapableModel, isFreeEligibleModel } from "@/lib/ai/free";
import { decodeBase64Bytes } from "@/lib/base64";

const PNG_HEADER = [137, 80, 78, 71, 13, 10, 26, 10];

describe("cloudflare image request bodies", () => {
  it("makes a plain prompt body when no source picture is given", () => {
    expect(buildCloudflareImageBody("a tidy workshop")).toEqual({ prompt: "a tidy workshop" });
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
    expect(() => decodeBase64Bytes(FULL_COVERAGE_MASK_PNG_BASE64)).not.toThrow();
    expect([...decodeBase64Bytes(FULL_COVERAGE_MASK_PNG_BASE64).slice(0, 8)]).toEqual(PNG_HEADER);
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
