import { describe, expect, it } from "vitest";
import {
  inspectMediaIntegrity,
} from "@/lib/builder/media-integrity";

const contract = {
  pages: [
    {
      slug: "home",
      title: "Home",
      sections: [{ id: "hero", role: "hero", layout: "stack", media: "required" }],
    },
  ],
} as never;

describe("media integrity", () => {
  it("rejects image components with unsafe or empty media references", () => {
    const violations = inspectMediaIntegrity(
      [
        {
          slug: "home",
          sections: [
            {
              kind: "hero",
              components: [
                { kind: "image", media_url: "javascript:alert(1)", settings: { visual: { alt: "Hero" } } },
                { kind: "image", media_url: "", settings: { visual: { alt: "Hero" } } },
              ],
            },
          ],
        },
      ] as never,
      contract,
    );

    expect(violations.map((v) => v.kind)).toContain("invalid_media_reference");
    expect(violations.map((v) => v.kind)).toContain("image_component_without_source");
  });

  it("requires authored accessibility text for resolved images", () => {
    const violations = inspectMediaIntegrity(
      [
        {
          slug: "home",
          sections: [
            {
              kind: "hero",
              media_url: "/media/hero.webp",
              components: [
                { kind: "image", media_url: "/media/hero.webp", settings: { visual: {} } },
              ],
            },
          ],
        },
      ] as never,
      contract,
    );

    expect(violations.map((v) => v.kind)).toContain("missing_image_alt");
  });
});
