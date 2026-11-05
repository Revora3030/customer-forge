/**
 * FICTIONAL SAMPLE — not a real business. Every name, line and picture here is
 * invented for a local timing harness; nothing is shown to anyone.
 */
import type { CompositionTree } from "@/lib/builder/composition-tree";

const HERO = "11111111-1111-4111-8111-111111111111";

export type FixtureSection = {
  id: string;
  kind: string;
  settings: { composition: CompositionTree };
  components: { id: string; url: string; settings: { visual: Record<string, unknown> } }[];
};

const tree = (root: unknown) => ({ version: 1, root }) as unknown as CompositionTree;

export const FIXTURE_NAME = "Sample Plumbing Co. (fictional)";

export const FIXTURE_SECTIONS: FixtureSection[] = [
  {
    id: "hero",
    kind: "custom",
    settings: {
      composition: tree({
        type: "scene",
        children: [
          { type: "media", mediaRef: HERO, alt: "Fictional sample photo" },
          { type: "heading", level: 1, text: "Sample Plumbing Co. — fictional sample site" },
          { type: "text", text: "Placeholder text for a local timing test. Not a real business." },
          { type: "button", text: "Request a quote", href: "#quote" },
        ],
      }),
    },
    components: [{ id: HERO, url: "/fixture/hero.jpg", settings: { visual: { width: 2400, height: 1600, alt: "Fictional sample photo" } } }],
  },
  ...["Services (sample)", "How it works (sample)", "Service area (sample)"].map((title, index) => ({
    id: `s${index}`,
    kind: "custom",
    settings: {
      composition: tree({
        type: "stack",
        children: [
          { type: "heading", level: 2, text: title },
          { type: "text", text: "Placeholder paragraph for the harness. [Your own words go here.]" },
          { type: "text", text: "Placeholder paragraph two. No facts, prices or reviews are shown." },
        ],
      }),
    },
    components: [],
  })),
];
