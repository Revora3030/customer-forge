import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { materializeSiteContent, type MaterializeInput } from "@/lib/site-materialize.server";
import { applyDesignContract, type AiDesignContract } from "@/lib/builder/ai-design-contract";
import { validateComposition, writeComposition, readComposition } from "@/lib/builder/composition-tree";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { RENDERABLE_SECTION_KINDS, isRenderableSectionKind } from "@/lib/builder/renderable-sections";
import type { PageArchitecture } from "@/lib/builder/creative-authority";

/** Records every row the materializer writes, so the test sees the saved site. */
function fakeDb() {
  const rows: Record<string, Record<string, unknown>[]> = {};
  let n = 0;
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const done = { data: null, error: null, count: 0 };
      chain["select"] = () => chain;
      chain["eq"] = () => Object.assign(Promise.resolve(done), chain);
      chain["delete"] = () => chain;
      chain["insert"] = (value: Record<string, unknown> | Record<string, unknown>[]) => {
        const list = Array.isArray(value) ? value : [value];
        const saved = list.map((row) => ({ id: `id-${++n}`, ...row }));
        (rows[table] ??= []).push(...saved);
        const result = { data: saved[0], error: null };
        return Object.assign(Promise.resolve({ data: saved, error: null }), {
          select: () => ({ single: () => Promise.resolve(result) }),
        });
      };
      return chain;
    },
  };
  return { db: db as never, rows };
}

const INVENTED = "tide_calendar";

const architecture: PageArchitecture[] = [{
  slug: "home",
  title: "Harbor Kayak Tours",
  purpose: "primary website entry",
  primaryAction: "Contact the team",
  sections: [
    { role: "hero", heading: "Paddle the harbor at first light", custom: true },
    { role: INVENTED, heading: "Read the tide before you book", body: "Our launch times follow the tide table.", custom: true },
    { role: "contact" },
  ],
}];

const input: MaterializeInput = {
  businessName: "Harbor Kayak Tours",
  copy: {
    heroHeadline: "", heroSubheadline: "", primaryCta: "Contact the team", secondaryCta: "",
    intro: "", about: "", benefits: [], serviceCards: [], faqs: [], areaCopy: "",
    metaTitle: "Harbor Kayak Tours", metaDescription: "Guided kayak tours.",
    ogTitle: "Harbor Kayak Tours", ogDescription: "Guided kayak tours.",
  },
  services: [],
  city: null, state: null, serviceArea: null, phone: null, email: null,
  yearsInBusiness: null, photoCount: 0, hasQuoteForm: false, hasBooking: false,
  architect: async () => architecture,
} as unknown as MaterializeInput;

describe("an AI-invented section reaches the finished page unchanged", () => {
  it("is saved with the AI's own kind, words and position — nothing added", async () => {
    const { db, rows } = fakeDb();
    await materializeSiteContent(db, "org-1", input);
    const sections = rows["website_sections"] ?? [];
    expect(sections.map((s) => s["kind"])).toEqual(["hero", INVENTED, "contact"]);
    const invented = sections[1]!;
    expect(invented["heading"]).toBe("Read the tide before you book");
    expect(invented["body"]).toBe("Our launch times follow the tide table.");
    // No button, card or picture was attached because of the section's name.
    const components = (rows["website_components"] ?? []).filter((c) => c["section_id"] === invented["id"]);
    expect(components).toEqual([]);
  });

  it("keeps its place and layout name through the AI design contract", () => {
    const contract = {
      pages: [{
        slug: "home", title: "Home", purpose: "", primaryAction: "",
        sections: [
          { id: "a", role: INVENTED, layout: "tidal-strip", media: "none" },
          { id: "b", role: "hero", layout: "hero", media: "none" },
        ],
      }],
    } as unknown as AiDesignContract;
    const out = applyDesignContract(
      [{ slug: "home", title: "Home", kind: "home", sections: [{ kind: "hero" }, { kind: INVENTED }] }] as never,
      contract,
    );
    const kept = out.pages[0]!.sections as { kind: string; ai_layout?: string }[];
    expect(kept.map((s) => s.kind)).toEqual([INVENTED, "hero"]);
    expect(kept[0]!.ai_layout).toBe("tidal-strip");
    expect(out.droppedSections).toEqual([]);
  });

  it("renders the AI's composition for it without swapping in a built-in design", () => {
    const tree = {
      version: 1,
      label: "Tide calendar",
      root: { type: "stack", children: [
        { type: "heading", text: "Read the tide before you book", level: 2 },
        { type: "text", text: "Our launch times follow the tide table." },
      ] },
    };
    const checked = validateComposition(tree);
    if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
    const stored = readComposition(writeComposition({}, checked.tree));
    expect(stored).toEqual(checked.tree);
    const html = renderToStaticMarkup(createElement(CompositionRenderer, { tree: stored!, scope: "s-tide" }));
    expect(html).toContain("Read the tide before you book");
    expect(html).toContain("Our launch times follow the tide table.");
  });

  it("proves failed AI architecture cannot fall back to the fact inventory", () => {
    const source = readFileSync("src/lib/site-materialize.server.ts", "utf8");
    expect(source).toContain('db.rpc("clear_website_content"');
    expect(source).not.toMatch(/: factInventory\b/);
    expect(source).toContain("no AI-authored architecture or approved design contract was supplied");
  });

  it("is reported, never hidden, if it has no drawable layout", () => {
    expect(isRenderableSectionKind(INVENTED)).toBe(false);
    expect(isRenderableSectionKind("composition")).toBe(true);
  });

  it("the site check's list matches exactly what the page can draw", () => {
    const source = readFileSync("src/components/site/SiteSections.tsx", "utf8");
    const body = source.slice(source.indexOf("function SiteSectionBody"));
    const cases = [...body.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]).sort();
    expect(cases).toEqual([...RENDERABLE_SECTION_KINDS].sort());
  });
});
