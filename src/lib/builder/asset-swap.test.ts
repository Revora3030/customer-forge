import { describe, expect, it } from "vitest";
import type { CompositionTree } from "@/lib/builder/composition-tree";
import {
  cleanAltText,
  hasLicenceOnFile,
  pictureAlt,
  planPictureSwap,
  swapOrigin,
  withPicture,
  type SwapMedia,
} from "./asset-swap";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const COMP = "33333333-3333-4333-8333-333333333333";

function tree(picture: Partial<{ src: string; mediaRef: string; alt: string }>): CompositionTree {
  return {
    version: 1,
    root: {
      type: "stack",
      children: [
        { type: "heading", text: "Our work" },
        { type: "media", ...picture },
      ],
    },
  } as CompositionTree;
}

function media(over: Partial<SwapMedia> = {}): SwapMedia {
  return {
    id: "m1",
    url: `${ORG}/work/driveway.jpg`,
    alt_text: null,
    source: "owner",
    license: null,
    license_url: null,
    attribution: null,
    creator: null,
    source_page: null,
    ...over,
  };
}

const stock = media({
  url: "https://images.pexels.com/photos/1/pexels-photo-1.jpeg",
  source: "stock:pexels",
  license: "pexels",
  creator: "Jane Doe",
  source_page: "https://www.pexels.com/photo/1/",
  alt_text: "Pressure washing a driveway",
});

const base = { organizationId: ORG, path: "root.1", sectionComponentIds: new Set([COMP]) };

describe("planPictureSwap", () => {
  it("only swaps a picture at a real path", () => {
    expect(
      planPictureSwap({ ...base, tree: tree({ alt: "x" }), path: "root.9", media: media() }),
    ).toEqual({ ok: false, problem: "bad_path" });
    expect(
      planPictureSwap({ ...base, tree: tree({ alt: "x" }), path: "root.0", media: media() }),
    ).toEqual({ ok: false, problem: "not_picture" });
  });

  it("repoints the section's own picture component and keeps the old alt text", () => {
    const plan = planPictureSwap({
      ...base,
      tree: tree({ mediaRef: COMP, alt: "Clean patio" }),
      media: media(),
      currentComponentUrl: `${ORG}/old.jpg`,
    });
    expect(plan).toMatchObject({
      ok: true,
      mode: "component",
      componentId: COMP,
      mediaUrl: `${ORG}/work/driveway.jpg`,
      alt: "Clean patio",
    });
    if (plan.ok) expect(plan.visual).toEqual({ alt: "Clean patio", source: "customer" });
  });

  it("asks for alt text when nothing describes the picture", () => {
    expect(
      planPictureSwap({
        ...base,
        tree: tree({ src: "https://example.com/a.jpg" }),
        media: media(),
      }),
    ).toEqual({ ok: false, problem: "needs_alt" });
    const plan = planPictureSwap({
      ...base,
      tree: tree({}),
      media: media(),
      alt: "  Freshly <b>sealed</b> drive ",
    });
    expect(plan.ok && plan.alt).toBe("Freshly bsealed/b drive");
  });

  it("never hot-links a web picture without its licence on file", () => {
    const bare = media({
      url: "https://cdn.example.com/photo.jpg",
      source: "stock",
      alt_text: "x",
    });
    expect(planPictureSwap({ ...base, tree: tree({ alt: "a" }), media: bare })).toEqual({
      ok: false,
      problem: "unlicensed",
    });
    expect(
      planPictureSwap({
        ...base,
        tree: tree({ alt: "a" }),
        media: { ...stock, source_page: "http://pexels.com/1" }, // DevSkim: ignore DS137138 -- test fixture: plain-http source page must be rejected.
      }),
    ).toEqual({
      ok: false,
      problem: "unlicensed",
    });
    expect(
      planPictureSwap({
        ...base,
        tree: tree({ alt: "a" }),
        media: { ...stock, url: "http://cdn.example.com/a.jpg" }, // DevSkim: ignore DS137138 -- test fixture: plain-http picture address must be rejected.
      }),
    ).toEqual({
      ok: false,
      problem: "unsafe_address",
    });
  });

  it("puts a licensed free photo in the node with credit and licence recorded", () => {
    const plan = planPictureSwap({
      ...base,
      tree: tree({ src: "https://example.com/old.jpg" }),
      media: stock,
    });
    expect(plan.ok && plan.mode).toBe("src");
    if (plan.ok && plan.mode === "src") {
      expect(plan.tree.root.children?.[1]).toEqual({
        type: "media",
        src: stock.url,
        alt: "Pressure washing a driveway",
      });
      expect(plan.visual).toEqual({
        alt: "Pressure washing a driveway",
        source: "stock",
        credit: "Photo by Jane Doe",
        license: "pexels",
        source_url: "https://www.pexels.com/photo/1/",
      });
    }
  });

  it("rejects a file from another workspace's folder", () => {
    expect(
      planPictureSwap({
        ...base,
        tree: tree({ alt: "a" }),
        media: media({ url: `${OTHER}/x.jpg` }),
      }),
    ).toEqual({ ok: false, problem: "foreign_file" });
    expect(
      planPictureSwap({
        ...base,
        tree: tree({ alt: "a" }),
        media: media({ url: `${ORG}/../${OTHER}/x.jpg` }),
      }),
    ).toEqual({
      ok: false,
      problem: "foreign_file",
    });
  });

  it("treats a picture pointing at another block's component as not its own", () => {
    const plan = planPictureSwap({
      ...base,
      tree: tree({ mediaRef: "44444444-4444-4444-8444-444444444444", alt: "a" }),
      media: media(),
    });
    expect(plan).toMatchObject({ ok: true, mode: "new_component" });
  });

  it("reports an unchanged swap so no restore point is wasted", () => {
    expect(
      planPictureSwap({
        ...base,
        tree: tree({ mediaRef: COMP, alt: "a" }),
        media: media(),
        currentComponentUrl: `${ORG}/work/driveway.jpg`,
      }),
    ).toEqual({
      ok: false,
      problem: "unchanged",
    });
    expect(
      planPictureSwap({ ...base, tree: tree({ src: stock.url, alt: "a" }), media: stock }),
    ).toEqual({ ok: false, problem: "unchanged" });
  });

  it("marks AI pictures as generated", () => {
    const plan = planPictureSwap({
      ...base,
      tree: tree({ alt: "a" }),
      media: media({ source: "generated" }),
    });
    expect(plan.ok && plan.visual.source).toBe("generated");
  });
});

describe("helpers", () => {
  it("withPicture changes only the chosen node and does not mutate", () => {
    const before = tree({ src: "https://example.com/old.jpg", alt: "old" });
    const after = withPicture(before, "root.1", { mediaRef: COMP, alt: "new" });
    expect(after.root.children?.[1]).toEqual({ type: "media", mediaRef: COMP, alt: "new" });
    expect(after.root.children?.[0]).toEqual(before.root.children?.[0]);
    expect(before.root.children?.[1]).toEqual({
      type: "media",
      src: "https://example.com/old.jpg",
      alt: "old",
    });
  });

  it("pictureAlt, cleanAltText, swapOrigin, hasLicenceOnFile", () => {
    expect(pictureAlt(tree({ alt: "Roof repair" }), "root.1")).toBe("Roof repair");
    expect(pictureAlt(tree({ alt: "Roof repair" }), "root.0")).toBe("");
    expect(cleanAltText("a\u0000b".padEnd(400, "x"))).toHaveLength(160);
    expect(swapOrigin({ source: "stock:pexels" })).toBe("stock");
    expect(swapOrigin({ source: null })).toBe("customer");
    expect(hasLicenceOnFile(stock)).toBe(true);
    expect(hasLicenceOnFile({ ...stock, creator: null, attribution: null })).toBe(false);
  });
});
