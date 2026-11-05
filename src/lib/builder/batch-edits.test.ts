import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CompositionTree } from "@/lib/builder/composition-tree";
import { readPreviewMessage, PREVIEW_BRIDGE_SOURCE } from "@/lib/builder/preview-bridge";
import {
  batchLabel,
  batchVersionLabel,
  describeEdit,
  MAX_BATCH_EDITS,
  planBatch,
  stageEdit,
  type PendingEdit,
} from "./batch-edits";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

const tree = (): CompositionTree =>
  ({
    version: 1,
    root: {
      type: "stack",
      children: [
        { type: "heading", text: "Welcome" },
        { type: "text", text: "We wash cars." },
        { type: "media", src: "a.jpg" },
      ],
    },
  }) as CompositionTree;

const edit = (over: Partial<PendingEdit> = {}): PendingEdit => ({ sectionId: S1, path: "root.0", before: "Welcome", after: "Hello", ...over });

describe("COMP-3 stageEdit", () => {
  it("adds an edit and counts changes", () => {
    const list = stageEdit([], edit());
    expect(list).toHaveLength(1);
    expect(batchLabel(list.length)).toBe("1 change");
    expect(batchLabel(3)).toBe("3 changes");
    expect(batchLabel(0)).toBe("No changes");
  });

  it("editing the same words again keeps the originally saved 'before'", () => {
    const once = stageEdit([], edit());
    const twice = stageEdit(once, edit({ before: "Hello", after: "Hi there" }));
    expect(twice).toEqual([expect.objectContaining({ before: "Welcome", after: "Hi there" })]);
  });

  it("putting the words back removes the entry", () => {
    const once = stageEdit([], edit());
    expect(stageEdit(once, edit({ before: "Hello", after: "Welcome" }))).toEqual([]);
  });

  it("ignores empty text and bad paths, and never mutates the input", () => {
    const base = Object.freeze([edit()]) as readonly PendingEdit[];
    expect(stageEdit(base, edit({ path: "root.1", before: "x", after: "  " }))).toHaveLength(1);
    expect(stageEdit(base, edit({ path: "nope", after: "y" }))).toHaveLength(1);
    expect(base).toHaveLength(1);
  });

  it("strips angle brackets from staged text", () => {
    expect(stageEdit([], edit({ after: "<b>Hi</b>" }))[0]!.after).toBe("bHi/b");
  });

  it("caps the batch size but still allows changing an existing entry", () => {
    let list: PendingEdit[] = [];
    for (let i = 0; i < MAX_BATCH_EDITS + 5; i += 1) list = stageEdit(list, edit({ path: `root.${i}`, after: `new ${i}` }));
    expect(list).toHaveLength(MAX_BATCH_EDITS);
    const changed = stageEdit(list, edit({ path: "root.0", before: "new 0", after: "again" }));
    expect(changed).toHaveLength(MAX_BATCH_EDITS);
    expect(changed[0]!.after).toBe("again");
  });

  it("describes a change in plain words and clips long text", () => {
    expect(describeEdit(edit({ label: "Headline banner" }))).toBe("Headline banner: “Welcome” → “Hello”");
    expect(describeEdit(edit({ before: "x".repeat(100), after: "y" }))).toContain("…");
  });

  it("names the restore point after the batch", () => {
    expect(batchVersionLabel([{ after: "a", label: "Hero" }, { after: "b", label: "Hero" }, { after: "c", label: "About" }])).toBe("Before 3 quick edits: Hero, About");
    expect(batchVersionLabel([{ after: "a" }])).toBe("Before 1 quick edit");
  });
});

describe("COMP-3 planBatch", () => {
  it("applies several edits across blocks and builds on earlier edits in one block", () => {
    const trees = new Map<string, CompositionTree | null>([[S1, tree()], [S2, tree()]]);
    const plan = planBatch(trees, [
      { sectionId: S1, path: "root.0", text: "Hello" },
      { sectionId: S1, path: "root.1", text: "We detail cars." },
      { sectionId: S2, path: "root.0", text: "Other" },
    ]);
    expect(plan.applied).toHaveLength(3);
    expect(plan.skipped).toEqual([]);
    const one = plan.trees.get(S1)!;
    expect(one.root.children?.[0]?.text).toBe("Hello");
    expect(one.root.children?.[1]?.text).toBe("We detail cars.");
    expect(plan.trees.get(S2)!.root.children?.[0]?.text).toBe("Other");
  });

  it("never mutates the input trees", () => {
    const original = tree();
    const before = JSON.stringify(original);
    planBatch(new Map([[S1, original]]), [{ sectionId: S1, path: "root.0", text: "Changed" }]);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("skips bad edits without blocking the good ones", () => {
    const trees = new Map<string, CompositionTree | null>([[S1, tree()], [S2, null]]);
    const plan = planBatch(trees, [
      { sectionId: "missing", path: "root.0", text: "a" },
      { sectionId: S2, path: "root.0", text: "a" },
      { sectionId: S1, path: "root.9", text: "a" },
      { sectionId: S1, path: "root.2", text: "a" },
      { sectionId: S1, path: "root.0", text: "Welcome" },
      { sectionId: S1, path: "root.0", text: "   " },
      { sectionId: S1, path: "root.1", text: "Good edit" },
    ]);
    expect(plan.skipped.map((row) => row.reason)).toEqual(["no_block", "no_layout", "bad_path", "not_editable", "unchanged", "empty"]);
    expect(plan.applied).toEqual([{ sectionId: S1, path: "root.1", before: "We wash cars.", after: "Good edit" }]);
  });
});

describe("COMP-3 wiring", () => {
  it("the preview bridge carries the words from before the edit", () => {
    const message = readPreviewMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "inline-edit", id: "s1", path: "root.0", text: "New", before: " Old " });
    expect(message).toMatchObject({ type: "inline-edit", text: "New", before: " Old " });
    expect(readPreviewMessage({ source: PREVIEW_BRIDGE_SOURCE, type: "inline-edit", id: "s1", path: "root.0", text: "New" })).not.toHaveProperty("before");
  });

  it("direct edits never call the AI and save once", () => {
    const server = readFileSync("src/lib/builder/batch-edits.functions.ts", "utf8");
    expect(server).not.toMatch(/site-agent|ai-|callAI|openai|lovable-ai|\/agent\/(?!workspace-context)/i);
    // One restore point, written before the first site write.
    expect(server.match(/from\("website_versions"\)\s*\.insert/g)).toHaveLength(1);
    const restorePoint = server.indexOf('.from("website_versions")\n        .insert');
    const firstWrite = server.indexOf('.from("website_sections")\n        .update');
    expect(restorePoint).toBeGreaterThan(0);
    expect(firstWrite).toBeGreaterThan(restorePoint);
  });

  it("the preview no longer saves on every edit: it stages and saves via the bar", () => {
    const preview = readFileSync("src/components/app/BuilderPreview.tsx", "utf8");
    expect(preview).not.toContain("saveInlineText");
    expect(preview).toContain("stageEdit(");
    expect(preview).toContain("<PendingEditsBar");
  });
});
