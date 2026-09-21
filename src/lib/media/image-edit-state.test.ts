import { describe, expect, it } from "vitest";
import { imageEditCapableModel } from "@/lib/ai/free";
import {
  MANUAL_EDIT_CAPABILITY,
  canSatisfyEditRequest,
  describeAiEditCapability,
} from "./image-edit-state";

describe("image editing capability truthfulness", () => {
  it("never treats a generation-only model as edit capable", () => {
    for (const model of [
      "gemini-2.5-flash-image",
      "gpt-image-1",
      "stable-diffusion-xl-base-1.0",
      "flux-1-schnell",
      "black-forest-labs/flux-dev",
    ])
      expect(imageEditCapableModel(model)).toBe(false);
  });

  it("recognises genuine image-to-image models", () => {
    for (const model of [
      "stable-diffusion-xl-img2img",
      "some/image-to-image-model",
      "sd-inpainting-2",
    ])
      expect(imageEditCapableModel(model)).toBe(true);
  });

  it("refuses an edit request that would run on a generation-only model", () => {
    expect(
      canSatisfyEditRequest({
        hasSource: true,
        modelSupportsEditing: imageEditCapableModel("gpt-image-1"),
      }),
    ).toBe(false);
  });

  it("refuses an edit request with no source picture", () => {
    expect(canSatisfyEditRequest({ hasSource: false, modelSupportsEditing: true })).toBe(false);
  });

  it("reports not_configured, unsupported, quota_limited, unavailable and verified honestly", () => {
    expect(describeAiEditCapability({ configured: false, editCapableModel: false }).state).toBe(
      "not_configured",
    );
    expect(describeAiEditCapability({ configured: true, editCapableModel: false }).state).toBe(
      "unsupported",
    );
    expect(
      describeAiEditCapability({ configured: true, editCapableModel: true, quotaSpent: true }).state,
    ).toBe("quota_limited");
    expect(
      describeAiEditCapability({ configured: true, editCapableModel: true, probePassed: false })
        .state,
    ).toBe("unavailable");
    expect(
      describeAiEditCapability({ configured: true, editCapableModel: true }).state,
    ).toBe("unavailable");
    const verified = describeAiEditCapability({
      configured: true,
      editCapableModel: true,
      probePassed: true,
    });
    expect(verified.state).toBe("verified");
    expect(verified.available).toBe(true);
  });

  it("only ever enables AI editing in the verified state", () => {
    const states = [
      { configured: false, editCapableModel: false },
      { configured: true, editCapableModel: false },
      { configured: true, editCapableModel: true, quotaSpent: true },
      { configured: true, editCapableModel: true, probePassed: false },
      { configured: true, editCapableModel: true },
    ];
    for (const probe of states) expect(describeAiEditCapability(probe).available).toBe(false);
  });

  it("never describes manual picture controls as AI editing", () => {
    expect(MANUAL_EDIT_CAPABILITY.available).toBe(true);
    expect(MANUAL_EDIT_CAPABILITY.message.toLowerCase()).toContain("no ai model");
    expect(MANUAL_EDIT_CAPABILITY.controls).toContain("focal_point");
    expect(MANUAL_EDIT_CAPABILITY.controls).toContain("revert");
  });
});
