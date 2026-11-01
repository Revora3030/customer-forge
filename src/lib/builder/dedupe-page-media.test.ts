import { describe, expect, it } from "vitest";
import type { CompositionNode } from "@/lib/builder/composition-tree";
import { dedupePageMedia, mediaKey } from "@/lib/builder/dedupe-page-media";

const media = (mediaRef: string): CompositionNode => ({ type: "media", mediaRef, alt: "car" });
const section = (...children: CompositionNode[]): CompositionNode => ({ type: "stack", children });
const urls: Record<string, string> = { hero: "https://x.test/car.jpg?w=1200", again: "https://x.test/car.jpg?w=800", other: "https://x.test/other.jpg", third: "https://x.test/third.jpg", logo: "https://img.logo.dev/a.com" };
const urlOf = (_i: number, ref: string) => urls[ref] ?? null;
const refsOf = (root: CompositionNode | null) => (root?.children ?? []).filter((c) => c.type === "media").map((c) => c.src ?? c.mediaRef);

describe("dedupePageMedia (audit item 3: hero photo reused in section 2)", () => {
  it("treats resize query strings as the same picture", () => {
    expect(mediaKey(urls["hero"])).toBe(mediaKey(urls["again"]));
  });
  it("swaps a repeat of the hero picture for an unused library picture", () => {
    const out = dedupePageMedia([section(media("hero")), section(media("again"))], { urlOf, pool: [urls["hero"]!, urls["other"]!] });
    expect(refsOf(out[0]!)).toEqual(["hero"]);
    expect(refsOf(out[1]!)).toEqual([urls["other"]]);
    expect(out[1]!.children![0]!.mediaRef).toBeUndefined();
  });
  it("drops the repeat when the library has no spare picture", () => {
    const out = dedupePageMedia([section(media("hero")), section({ type: "heading", text: "Hi" }, media("again"))], { urlOf, pool: [urls["hero"]!] });
    expect(out[1]!.children).toEqual([{ type: "heading", text: "Hi" }]);
  });
  it("keeps a scene's copy and only empties its backdrop", () => {
    const scene: CompositionNode = { type: "scene", children: [media("again"), { type: "heading", text: "Detailing" }] };
    const out = dedupePageMedia([section(media("hero")), scene], { urlOf, pool: [] });
    const kids = out[1]!.children!;
    expect(kids).toHaveLength(2);
    expect(kids[0]).toMatchObject({ type: "media" });
    expect(kids[0]!.src).toBeUndefined();
    expect(kids[0]!.mediaRef).toBeUndefined();
    expect(kids[1]!.text).toBe("Detailing");
  });
  it("leaves repeats inside one section, galleries, logos and untouched pages alone", () => {
    const roots = [section(media("hero")), section(media("other"), media("other")), { type: "gallery", children: [media("again")] } as CompositionNode, section(media("logo")), section(media("logo"))];
    expect(dedupePageMedia(roots, { urlOf, pool: [urls["third"]!] })).toEqual(roots);
  });
  it("does not mutate its input", () => {
    const roots = [section(media("hero")), section(media("again"))];
    const copy = structuredClone(roots);
    dedupePageMedia(roots, { urlOf, pool: [urls["other"]!] });
    expect(roots).toEqual(copy);
  });
});
