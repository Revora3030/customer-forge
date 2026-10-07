import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompositionTree } from "./composition-tree";
import { applyInlineText, cleanInlineText, isInlinePath, nodeAtPath } from "./inline-edit";
import { liveStatusLine } from "./live-status";
import {
  PREVIEW_BRIDGE_SOURCE,
  actionPrompt,
  readBuilderMessage,
  readDraftPing,
  readPreviewMessage,
  selectionPrefix,
} from "./preview-bridge";

const tree: CompositionTree = {
  version: 1,
  root: {
    type: "stack",
    children: [
      { type: "heading", level: 1, text: "Mobile detailing" },
      { type: "row", children: [{ type: "button", text: "Book now", href: "/contact" }, { type: "media", mediaRef: "m1" }] },
    ],
  },
};

describe("inline text edits", () => {
  it("addresses nodes by the renderer's tree path", () => {
    expect(nodeAtPath(tree, "root.0")?.text).toBe("Mobile detailing");
    expect(nodeAtPath(tree, "root.1.0")?.type).toBe("button");
    expect(nodeAtPath(tree, "root.9")).toBeNull();
    expect(isInlinePath("root.1.0")).toBe(true);
    expect(isInlinePath("root.__proto__")).toBe(false);
    expect(isInlinePath("../root")).toBe(false);
  });

  it("changes only that node's text and never mutates the input", () => {
    const result = applyInlineText(tree, "root.1.0", "  Book a detail  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(nodeAtPath(result.tree, "root.1.0")).toEqual({ type: "button", text: "Book a detail", href: "/contact" });
    expect(nodeAtPath(tree, "root.1.0")?.text).toBe("Book now");
    expect(result.before).toBe("Book now");
  });

  it("refuses non-text nodes, containers, empty and unchanged text", () => {
    expect(applyInlineText(tree, "root.1.1", "x")).toEqual({ ok: false, reason: "not_editable" });
    expect(applyInlineText(tree, "root.1", "x")).toEqual({ ok: false, reason: "not_editable" });
    expect(applyInlineText(tree, "root.0", "   ")).toEqual({ ok: false, reason: "empty" });
    expect(applyInlineText(tree, "root.0", "Mobile detailing")).toEqual({ ok: false, reason: "unchanged" });
    expect(applyInlineText(tree, "root.7", "x")).toEqual({ ok: false, reason: "bad_path" });
  });

  it("strips markup and control characters", () => {
    expect(cleanInlineText("<script>alert(1)</script>Hi\u0007 there")).toBe("alert(1)Hi there");
    expect(cleanInlineText("a".repeat(900))).toHaveLength(600);
  });
});

describe("preview bridge: elements, actions, patches", () => {
  it("reads an element-level pick with a hover action", () => {
    const message = readPreviewMessage({
      source: PREVIEW_BRIDGE_SOURCE,
      type: "select",
      id: "sec-1",
      kind: "composition",
      label: "Headline banner",
      text: "Book now",
      path: "root.1.0",
      element: "button",
      action: "punchier",
    });
    expect(message).toMatchObject({ type: "select", path: "root.1.0", element: "button", action: "punchier" });
  });

  it("drops unsafe paths, elements and unknown actions", () => {
    const message = readPreviewMessage({
      source: PREVIEW_BRIDGE_SOURCE,
      type: "select",
      id: "sec-1",
      path: "root.0;alert(1)",
      element: "<img>",
      action: "drop_table",
    });
    expect(message).toEqual({ source: PREVIEW_BRIDGE_SOURCE, type: "select", id: "sec-1", kind: null, label: null, text: null });
  });

  it("reads inline edits and builder patches/status", () => {
    expect(readPreviewMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "inline-edit", id: "s1", path: "root.0", text: " New  words " }))
      .toEqual({ source: PREVIEW_BRIDGE_SOURCE, type: "inline-edit", id: "s1", path: "root.0", text: "New words" });
    expect(readPreviewMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "inline-edit", id: "s1", path: "x", text: "a" })).toBeNull();
    expect(readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "patch-text", id: "s1", path: "root.0", text: "Hi" }))
      .toMatchObject({ type: "patch-text", path: "root.0" });
    expect(readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "status", text: "Sol is designing…" }))
      .toMatchObject({ type: "status", text: "Sol is designing…" });
  });

  it("describes an element pick precisely for the assistant", () => {
    const prefix = selectionPrefix({ id: "s1", label: "Headline banner", kind: "hero", path: "root.1.0", element: "button", text: "Book now" });
    expect(prefix).toBe('On the button "Book now" (element root.1.0) inside the "Headline banner" block (id s1):');
  });

  it("turns hover actions into truthful prompts", () => {
    expect(actionPrompt("punchier", { label: null, kind: null })).toMatch(/don't invent/);
    expect(actionPrompt("photo", { label: null, kind: null, element: "media" })).toContain("this media");
    expect(actionPrompt("delete", { label: null, kind: null })).toBe("Remove this section from the page.");
  });

  it("validates cross-tab draft pings", () => {
    expect(readDraftPing({ type: "draft-changed", organizationId: "11111111-1111-4111-8111-111111111111", at: 1 })).toBeTruthy();
    expect(readDraftPing({ type: "draft-changed", organizationId: "nope" })).toBeNull();
  });
});

describe("live status line", () => {
  it("names the team member for the real stage", () => {
    expect(liveStatusLine("generating your pictures", "Headline banner")).toBe("Luna is making photos for Headline banner…");
    expect(liveStatusLine("reviewing for safety", null)).toBe("Terra is checking your site…");
    expect(liveStatusLine("polishing the design", "Services")).toBe("Sol is designing Services…");
    expect(liveStatusLine("", "x")).toBeNull();
  });
});

describe("preview-only surfaces stay off the public site", () => {
  const read = (path: string) => readFileSync(resolve(__dirname, "../../..", path), "utf8");
  it("mounts the editing bridge only in preview and simulates preview leads", () => {
    expect(read("src/routes/s.$slug.$page.tsx")).toContain("{preview ? <PreviewSelectBridge /> : null}");
    const forms = read("src/components/site/SiteForms.tsx");
    expect(forms).toContain("useLeadSubmit()");
    expect(forms).toContain("Preview only — this test was not sent to your leads.");
    expect(read("src/components/site/CompositionRenderer.tsx")).toContain('ctx.editable && !key.includes(".dup.")');
  });
});
