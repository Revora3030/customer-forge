import { describe, expect, it } from "vitest";
import { readActions } from "@/lib/site-agent";

describe("building a page and filling it in one plan", () => {
  const known = {
    pageIds: new Set<string>(),
    sectionIds: new Set<string>(),
    componentIds: new Set<string>(),
  };

  it("keeps steps that point at a page the same plan creates", () => {
    const actions = readActions(
      [
        { type: "add_page", kind: "services", title: "Services", slug: "services", ref: "temp_1" },
        { type: "add_section", pageId: "temp_1", kind: "hero", heading: "Mobile detailing" },
        { type: "set_page", pageId: "temp_1", patch: { seo_title: "Detailing services" } },
      ],
      known,
    );
    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({ type: "add_page", ref: "temp_1" });
    expect(actions[1]).toMatchObject({ type: "add_section", pageId: "temp_1" });
  });

  it("drops steps that point at a page nobody created", () => {
    const actions = readActions(
      [{ type: "add_section", pageId: "temp_9", kind: "hero", heading: "Hi" }],
      known,
    );
    expect(actions).toHaveLength(0);
  });

  it("ignores a made-up reference name", () => {
    const actions = readActions(
      [
        { type: "add_page", kind: "about", title: "About", slug: "about", ref: "../../etc" },
        { type: "add_section", pageId: "../../etc", kind: "hero" },
      ],
      known,
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "add_page", ref: undefined });
  });
  it("lets one plan create and then edit a section and component", () => {
    const actions = readActions(
      [
        { type: "add_page", kind: "custom", title: "Services", slug: "services", ref: "temp_page" },
        { type: "add_section", pageId: "temp_page", kind: "services", ref: "temp_section", heading: "Services" },
        { type: "set_section_text", sectionId: "temp_section", field: "heading", value: "Our services" },
        { type: "add_component", sectionId: "temp_section", kind: "button", ref: "temp_component", label: "Book" },
        { type: "set_component", componentId: "temp_component", patch: { label: "Book now" } },
        { type: "set_component_visual", componentId: "temp_component", patch: { radius: "pill", shadow: "medium" } },
      ],
      known,
    );
    expect(actions).toHaveLength(6);
    expect(actions[2]).toMatchObject({ sectionId: "temp_section" });
    expect(actions[4]).toMatchObject({ componentId: "temp_component" });
    expect(actions[5]).toMatchObject({ componentId: "temp_component" });
  });

  it("accepts a real AI image request only for a known component", () => {
    const actions = readActions(
      [{
        type: "generate_component_image",
        componentId: "component-1",
        prompt: "Cinematic close-up of a technician carefully detailing a premium vehicle interior",
        alt: "Technician detailing a vehicle interior",
        mode: "replace",
      }],
      { ...known, componentIds: new Set(["component-1"]) },
    );
    expect(actions).toEqual([expect.objectContaining({ type: "generate_component_image", mode: "replace" })]);
  });

  it("accepts AI-authored section and component visual actions", () => {
    const dropped: string[] = [];
    const actions = readActions(
      [
        { type: "set_ai_visual", sectionId: "section-1", patch: { transform: "scale(1.02)", background: "linear-gradient(#111,#333)" } },
        { type: "set_ai_responsive", sectionId: "section-1", width: 390, patch: { gridTemplateColumns: "1fr" } },
        { type: "set_ai_component_visual", componentId: "component-1", patch: { borderRadius: "28px", boxShadow: "0 20px 60px rgba(0,0,0,.2)" } },
        { type: "set_ai_component_responsive", componentId: "component-1", width: 390, patch: { transform: "none" } },
      ],
      { pageIds: new Set(), sectionIds: new Set(["section-1"]), componentIds: new Set(["component-1"]) },
      dropped,
    );
    expect(actions).toHaveLength(4);
    expect(dropped).toHaveLength(0);
  });

  it("reports unknown or malformed actions instead of silently dropping them", () => {
    const dropped: string[] = [];
    const actions = readActions(
      [
        { type: "not-a-real-action" },
        { type: "set_ai_responsive", sectionId: "missing", width: 390, patch: { transform: "none" } },
      ],
      { pageIds: new Set(), sectionIds: new Set(), componentIds: new Set() },
      dropped,
    );
    expect(actions).toHaveLength(0);
    expect(dropped.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts safe section and responsive component style actions", () => {
    const actions = readActions([
      { type: "set_block_style", target: "section", targetId: "section-1", device: "desktop", patch: { bgColor: "#112233", padTop: 64 } },
      { type: "set_block_style", target: "component", targetId: "component-1", device: "mobile", patch: { size: 24, buttonStyle: "outline" } },
    ], { pageIds: new Set(), sectionIds: new Set(["section-1"]), componentIds: new Set(["component-1"]) });
    expect(actions).toEqual([
      expect.objectContaining({ type: "set_block_style", target: "section", device: "desktop", patch: { bgColor: "#112233", padTop: 64 } }),
      expect.objectContaining({ type: "set_block_style", target: "component", device: "mobile", patch: { size: 24, buttonStyle: "outline" } }),
    ]);
  });

  it("drops unsafe style values while still applying the safe ones", () => {
    const actions = readActions([
      { type: "set_block_style", target: "section", targetId: "section-1", patch: { bgColor: "javascript:alert(1)", padTop: 20 } },
    ], { pageIds: new Set(), sectionIds: new Set(["section-1"]), componentIds: new Set() });
    expect(actions).toEqual([
      expect.objectContaining({ type: "set_block_style", patch: { padTop: 20 } }),
    ]);
  });

  it("drops a style action whose every value is unsafe", () => {
    const actions = readActions([
      { type: "set_block_style", target: "section", targetId: "section-1", patch: { bgColor: "url(evil)" } },
    ], { pageIds: new Set(), sectionIds: new Set(["section-1"]), componentIds: new Set() });
    expect(actions).toEqual([]);
  });

  it("keeps only exact supported site fonts", () => {
    const valid = readActions([
      { type: "set_theme", patch: { heading_font: "Lora", body_font: "Manrope" } },
    ], known);
    expect(valid).toEqual([
      expect.objectContaining({ type: "set_theme", patch: { font_preference: "Lora|Manrope" } }),
    ]);
    const unsupported = readActions([
      { type: "set_theme", patch: { font_preference: "Bodoni editorial headings with Manrope body" } },
    ], known);
    expect(unsupported).toEqual([]);
  });

  it("accepts the natural style names and units the models actually write", () => {
    const actions = readActions([
      {
        type: "set_block_style",
        target: "section",
        targetId: "section-1",
        patch: { backgroundColor: "black", color: "gold", fontSize: "44px", fontWeight: "bold", padding: "56px" },
      },
    ], { pageIds: new Set(), sectionIds: new Set(["section-1"]), componentIds: new Set() });
    expect(actions).toEqual([
      expect.objectContaining({
        type: "set_block_style",
        patch: {
          bgColor: "#000000",
          textColor: "#d4af37",
          size: 44,
          weight: 700,
          padTop: 56,
          padRight: 56,
          padBottom: 56,
          padLeft: 56,
        },
      }),
    ]);
  });

  it("lets one plan create a missing image block and generate into it", () => {
    const actions = readActions(
      [
        { type: "add_component", sectionId: "section-1", ref: "temp_picture_1", kind: "hero_image", label: "Hero picture" },
        {
          type: "generate_component_image",
          componentId: "temp_picture_1",
          prompt: "Cinematic editorial photograph created specifically for this business homepage hero",
          alt: "Business homepage editorial photograph",
          mode: "create",
        },
      ],
      { ...known, sectionIds: new Set(["section-1"]) },
    );
    expect(actions).toHaveLength(2);
    expect(actions[1]).toMatchObject({
      type: "generate_component_image",
      componentId: "temp_picture_1",
    });
  });



  it("drops references used before they are declared", () => {
    const actions = readActions(
      [
        { type: "set_component", componentId: "temp_component", patch: { label: "Too early" } },
        { type: "add_component", sectionId: "temp_section", kind: "button", ref: "temp_component", label: "Book" },
      ],
      { ...known, sectionIds: new Set(["section-1"]) },
    );
    expect(actions).toHaveLength(0);
  });

  it("rejects duplicate temporary component refs", () => {
    const actions = readActions(
      [
        { type: "add_component", sectionId: "section-1", kind: "button", ref: "temp_component", label: "One" },
        { type: "add_component", sectionId: "section-1", kind: "button", ref: "temp_component", label: "Two" },
        { type: "set_component", componentId: "temp_component", patch: { label: "Edited" } },
      ],
      { ...known, sectionIds: new Set(["section-1"]) },
    );
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: "add_component", ref: "temp_component" });
    expect(actions[1]).toMatchObject({ type: "set_component", componentId: "temp_component" });
  });

  it("keeps newly-created section refs inside a reorder action", () => {
    const actions = readActions(
      [
        { type: "add_section", pageId: "page-1", kind: "cta", ref: "temp_section", heading: "Ready?" },
        {
          type: "reorder_sections",
          pageId: "page-1",
          sectionIds: ["section-1", "temp_section"],
        },
      ],
      { ...known, pageIds: new Set(["page-1"]), sectionIds: new Set(["section-1"]) },
    );
    expect(actions).toHaveLength(2);
    expect(actions[1]).toMatchObject({
      type: "reorder_sections",
      sectionIds: ["section-1", "temp_section"],
    });
  });

  it("supports component reordering with the same-plan component refs", () => {
    const actions = readActions(
      [
        { type: "add_component", sectionId: "section-1", kind: "button", ref: "temp_component", label: "Book" },
        { type: "reorder_components", sectionId: "section-1", componentIds: ["component-1", "temp_component"] },
      ],
      { ...known, sectionIds: new Set(["section-1"]), componentIds: new Set(["component-1"]) },
    );
    expect(actions).toHaveLength(2);
    expect(actions[1]).toMatchObject({
      type: "reorder_components",
      sectionId: "section-1",
      componentIds: ["component-1", "temp_component"],
    });
  });
  it("rejects duplicate temporary component creators instead of silently creating a second item", () => {
    const actions = readActions(
      [
        { type: "add_component", sectionId: "section-1", kind: "button", ref: "temp_component", label: "One" },
        { type: "add_component", sectionId: "section-1", kind: "button", ref: "temp_component", label: "Two" },
        { type: "set_component", componentId: "temp_component", patch: { label: "Edited" } },
      ],
      { ...known, sectionIds: new Set(["section-1"]) },
    );
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: "add_component", ref: "temp_component" });
    expect(actions[1]).toMatchObject({ type: "set_component", componentId: "temp_component" });
  });

  it("rejects partial component reorders instead of silently dropping unknown ids", () => {
    const actions = readActions(
      [
        { type: "reorder_components", sectionId: "section-1", componentIds: ["component-1", "missing-component"] },
      ],
      { ...known, sectionIds: new Set(["section-1"]), componentIds: new Set(["component-1"]) },
    );
    expect(actions).toHaveLength(0);
  });

});
