import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { validateComposition } from "@/lib/builder/composition-tree";
import { guardLeadFormActions, isLeadFormComponent, keptVisibleSentence, unhideLeadComponent, type LeadGuardSite } from "@/lib/builder/lead-form-guard";
import { readDeviceLayer, writeBlockStyle } from "@/lib/site-style";
import type { AgentAction } from "@/lib/site-agent";

const SENTENCE = "I kept your enquiry form visible so visitors can always reach you.";
const form = (extra: Record<string, unknown> = {}) => ({ type: "widget", text: "enquiry_form", ...extra });
const tree = (root: unknown) => ({ version: 1 as const, root }) as never;
const withForm = (rootExtra: Record<string, unknown> = {}, formExtra: Record<string, unknown> = {}) =>
  tree({ type: "stack", ...rootExtra, children: [{ type: "heading", level: 2, text: "Ask us" }, form(formExtra)] });

const site = (overrides: Partial<LeadGuardSite> = {}): LeadGuardSite => ({
  sections: [
    { id: "hero", page_id: "p1", kind: "hero", settings: {}, is_visible: true },
    { id: "lead", page_id: "p1", kind: "composition", settings: { composition: withForm() }, is_visible: true },
  ],
  components: [],
  ...overrides,
});
const run = (actions: unknown[], s = site()) => guardLeadFormActions(actions as AgentAction[], s);

describe("lead form guard — hiding the form component", () => {
  it("refuses hiding the form widget with a plain sentence and keeps the rest of the redesign", () => {
    const out = run([{ type: "set_composition", sectionId: "lead", tree: withForm({}, { style: { hidden: true, background: "#ffffff" } }) }]);
    expect(out.refused).toEqual([SENTENCE]);
    const kept = out.actions[0] as { tree: { root: { children: { style?: Record<string, unknown> }[] } } };
    expect(kept.tree.root.children[1]!.style).toEqual({ background: "#ffffff" });
  });

  it("refuses a phone-only hide, a phone-only buried opacity, and a hidden container around the form", () => {
    const phone = run([{ type: "set_composition", sectionId: "lead", tree: withForm({}, { responsive: { mobile: { hidden: true } } }) }]);
    expect(phone.refused).toEqual([SENTENCE]);
    const buried = run([{ type: "set_composition", sectionId: "lead", tree: withForm({}, { style: { opacity: 0 } }) }]);
    expect(buried.refused).toEqual([SENTENCE]);
    const wrapped = run([{ type: "set_composition", sectionId: "lead", tree: withForm({ style: { hidden: true } }) }]);
    expect(wrapped.refused).toEqual([SENTENCE]);
    const root = (wrapped.actions[0] as { tree: { root: { style?: unknown } } }).tree.root;
    expect(root.style ?? {}).toEqual({});
  });

  it("allows hiding the form on tablet or desktop only, moving it, and restyling it", () => {
    for (const formExtra of [{ responsive: { tablet: { hidden: true } } }, { responsive: { desktop: { hidden: true } } }, { style: { background: "#111111", radius: 12, opacity: 80 } }]) {
      const out = run([{ type: "set_composition", sectionId: "lead", tree: withForm({}, formExtra) }]);
      expect(out.refused).toEqual([]);
      expect(out.actions).toHaveLength(1);
    }
    const moved = run([{ type: "set_composition", sectionId: "lead", tree: tree({ type: "stack", children: [form(), { type: "heading", level: 2, text: "After the form" }] }) }]);
    expect(moved.refused).toEqual([]);
  });

  it("refuses removing the form widget in a redesign and drops that step", () => {
    const out = run([{ type: "set_composition", sectionId: "lead", tree: tree({ type: "stack", children: [{ type: "heading", level: 2, text: "No form" }] }) }]);
    expect(out.actions).toEqual([]);
    expect(out.refused).toEqual([SENTENCE]);
  });

  it("names the booking form and the quote calculator for their own sections", () => {
    const s = site({ sections: [{ id: "b", page_id: "p1", kind: "booking", settings: {}, is_visible: true }, { id: "q", page_id: "p1", kind: "quote", settings: {}, is_visible: true }] });
    const out = run([
      { type: "set_block_style", target: "section", targetId: "b", device: "mobile", patch: { hidden: true } },
      { type: "set_block_style", target: "section", targetId: "q", device: "mobile", patch: { hidden: true } },
    ], s);
    expect(out.refused).toEqual([keptVisibleSentence("booking form"), keptVisibleSentence("quote calculator")]);
  });
});

describe("lead form guard — set_block_style", () => {
  const withComponents = site({
    components: [{ id: "form-c", section_id: "lead", kind: "enquiry_form", settings: {} }, { id: "pic-c", section_id: "lead", kind: "image", settings: {} }],
  });

  it("refuses hiding the form component on phones and on tablet (its query reaches phones), keeps other keys", () => {
    for (const device of ["mobile", "tablet"]) {
      const out = run([{ type: "set_block_style", target: "component", targetId: "form-c", device, patch: { hidden: true, bgColor: "#ffffff" } }], withComponents);
      expect(out.refused).toEqual([SENTENCE]);
      expect((out.actions[0] as { patch: unknown }).patch).toEqual({ bgColor: "#ffffff" });
    }
    const only = run([{ type: "set_block_style", target: "component", targetId: "form-c", device: "mobile", patch: { hidden: true } }], withComponents);
    expect(only.actions).toEqual([]);
  });

  it("refuses hiding or burying the lead section itself on phones, but allows showing it, restyling it and an unrelated picture", () => {
    expect(run([{ type: "set_block_style", target: "section", targetId: "lead", device: "mobile", patch: { hidden: true } }], withComponents).actions).toEqual([]);
    expect(run([{ type: "set_block_style", target: "section", targetId: "lead", device: "mobile", patch: { opacity: 0 } }], withComponents).actions).toEqual([]);
    for (const action of [
      { type: "set_block_style", target: "section", targetId: "lead", device: "mobile", patch: { hidden: null, bgColor: "#101010" } },
      { type: "set_block_style", target: "component", targetId: "form-c", device: "mobile", patch: { bgColor: "#101010" } },
      { type: "set_block_style", target: "component", targetId: "pic-c", device: "mobile", patch: { hidden: true } },
      { type: "set_block_style", target: "section", targetId: "hero", device: "mobile", patch: { hidden: true } },
    ]) {
      const out = run([action], withComponents);
      expect(out.refused).toEqual([]);
      expect(out.actions).toHaveLength(1);
    }
  });
});

describe("lead form guard — removing the section", () => {
  it("refuses hiding, deleting or replacing the site's only lead capture", () => {
    const out = run([
      { type: "set_section_visibility", sectionId: "lead", visible: false },
      { type: "delete_section", sectionId: "lead" },
      { type: "set_custom_block", sectionId: "lead", spec: {} },
      { type: "delete_page", pageId: "p1" },
    ]);
    expect(out.actions).toEqual([]);
    expect(out.refused).toEqual([SENTENCE]);
  });

  it("allows it when another visible lead capture remains, then protects the last one in the same batch", () => {
    const s = site({ sections: [
      { id: "a", page_id: "p1", kind: "contact", settings: {}, is_visible: true },
      { id: "b", page_id: "p2", kind: "composition", settings: { composition: withForm() }, is_visible: true },
    ] });
    const out = run([
      { type: "delete_section", sectionId: "a" },
      { type: "set_section_visibility", sectionId: "b", visible: false },
    ], s);
    expect(out.actions.map((a) => a.type)).toEqual(["delete_section"]);
    expect(out.refused).toEqual([SENTENCE]);
  });

  it("does not count a hidden lead section as capture and leaves ordinary sections alone", () => {
    const s = site({ sections: [
      { id: "a", page_id: "p1", kind: "contact", settings: {}, is_visible: false },
      { id: "b", page_id: "p1", kind: "composition", settings: { composition: withForm() }, is_visible: true },
      { id: "x", page_id: "p1", kind: "hero", settings: {}, is_visible: true },
    ] });
    expect(run([{ type: "delete_section", sectionId: "x" }], s).refused).toEqual([]);
    expect(run([{ type: "delete_section", sectionId: "b" }], s).actions).toEqual([]);
  });
});

describe("lead form guard — stored flags are ignored at render", () => {
  const rendered = (root: unknown) => {
    const checked = validateComposition({ version: 1, root });
    if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
    const html = renderToStaticMarkup(<CompositionRenderer tree={checked.tree} scope="t" resolveWidget={(name) => <p>widget-{name}</p>} />);
    // The shared stylesheet names every rule in the product; only the section's own markup and rules matter here.
    return html.slice(html.indexOf("</style>") + 8);
  };

  it("renders the form even when the saved layout hides it, its container, or its phone layer", () => {
    for (const root of [
      { type: "stack", children: [{ type: "widget", text: "enquiry_form", style: { hidden: true }, responsive: { mobile: { hidden: true } } }] },
      { type: "stack", style: { hidden: true }, responsive: { mobile: { hidden: true } }, children: [{ type: "widget", text: "booking_form" }] },
      { type: "stack", children: [{ type: "widget", text: "quote_calculator", style: { opacity: 0 }, responsive: { mobile: { opacity: 0 } } }] },
    ]) {
      const html = rendered(root);
      expect(html).toContain("widget-");
      expect(html).not.toMatch(/display:\s*none/);
      expect(html).not.toMatch(/opacity:\s*0[;"]/);
    }
  });

  it("still honours a hide flag on a container with no lead form in it", () => {
    const html = rendered({ type: "stack", children: [{ type: "text", text: "decor", style: { hidden: true } }, { type: "widget", text: "enquiry_form" }] });
    expect(html).toMatch(/display:\s*none/);
    expect(html).toContain("widget-enquiry_form");
  });

  it("keeps a tablet-only hide on the form's container, since that never reaches phones", () => {
    const html = rendered({ type: "stack", children: [{ type: "widget", text: "enquiry_form", responsive: { tablet: { hidden: true } } }] });
    expect(html).toMatch(/min-width: 640px[^}]*display:none/);
  });
});

describe("lead form guard — stored component settings", () => {
  it("recognises form components and strips phone-reaching hides, keeping the rest of the style", () => {
    expect(isLeadFormComponent({ kind: "enquiry_form" })).toBe(true);
    expect(isLeadFormComponent({ kind: "image" })).toBe(false);
    let settings: unknown = writeBlockStyle({}, { bgColor: "#abcdef" }, "mobile");
    settings = writeBlockStyle(settings, { hidden: true }, "mobile");
    settings = writeBlockStyle(settings, { hidden: true }, "tablet");
    settings = writeBlockStyle(settings, { hidden: true }, "desktop");
    const clean = unhideLeadComponent(settings);
    expect(readDeviceLayer(clean, "mobile").hidden ?? null).toBeNull();
    expect(readDeviceLayer(clean, "tablet").hidden ?? null).toBeNull();
    expect(readDeviceLayer(clean, "mobile").bgColor).toBe("#abcdef");
  });
});
