import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { validateComposition, COMPOSITION_PRIMITIVES, INTERACTIVE_PRIMITIVES } from "@/lib/builder/composition-tree";
import { legacySectionToComposition } from "@/lib/builder/legacy-composition";
import { buildModelPath, glbProblem, isModelPath, isModelUrl, isOrgModelPath, MAX_MODEL_BYTES } from "@/lib/site-models";

const ORG = "6f1e2d3c-4b5a-4987-8765-43210fedcba9";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const MODEL_URL = "https://cdn.example/storage/v1/object/sign/site-models/x/models/y.glb?token=abc";
const REFS = { allowedMediaRefs: new Set(["temp_model", "temp_photo"]), modelRefs: new Set(["temp_model"]) };
const viewer = (extra: Record<string, unknown> = {}) => ({ type: "model_3d_viewer", mediaRef: "temp_model", text: "Turn the boat", alt: "A 24ft centre-console boat", ...extra });
const tree = (node: unknown) => ({ version: 1, root: { type: "stack", children: [node] } });

function glb(totalLength: number, { magic = 0x46546c67, version = 2, chunk = 0x4e4f534a } = {}) {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, magic, true);
  view.setUint32(4, version, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, chunk, true);
  return bytes;
}

describe("3D model files", () => {
  it("accepts only a complete binary glTF 2.0 header within the size limit", () => {
    expect(glbProblem(glb(5000), 5000)).toBeNull();
    expect(glbProblem(glb(5000, { magic: 0x89504e47 }), 5000)).toMatch(/binary glTF/);
    expect(glbProblem(glb(5000, { version: 1 }), 5000)).toMatch(/2\.0/);
    expect(glbProblem(glb(5000), 4000)).toMatch(/incomplete/);
    expect(glbProblem(glb(5000, { chunk: 0x004e4942 }), 5000)).toMatch(/scene/);
    expect(glbProblem(new Uint8Array(8), 8)).toMatch(/too small/);
    expect(glbProblem(glb(MAX_MODEL_BYTES + 1), MAX_MODEL_BYTES + 1)).toMatch(/25 MB/);
  });

  it("keeps every model inside its workspace's models folder", () => {
    const path = buildModelPath(ORG);
    expect(isModelPath(path)).toBe(true);
    expect(isOrgModelPath(path, ORG)).toBe(true);
    expect(isOrgModelPath(path, OTHER)).toBe(false);
    for (const bad of [`${ORG}/photo.jpg`, `${ORG}/models/../x.glb`, `${ORG}/models/x.glb`, `../${ORG}/models/${ORG}.glb`])
      expect(isModelPath(bad)).toBe(false);
    expect(() => buildModelPath("not-a-workspace")).toThrow();
    expect(isModelUrl(MODEL_URL)).toBe(true);
    expect(isModelUrl("https://cdn.example/a.jpg?x=.glb")).toBe(false);
  });
});

describe("model_3d_viewer primitive", () => {
  it("is a registered interactive primitive", () => {
    expect(COMPOSITION_PRIMITIVES).toContain("model_3d_viewer");
    expect(INTERACTIVE_PRIMITIVES.has("model_3d_viewer")).toBe(true);
  });

  it("validates: needs a supplied model ref and alt, allows one poster", () => {
    expect(validateComposition(tree(viewer()), REFS).ok).toBe(true);
    expect(validateComposition(tree(viewer({ children: [{ type: "media", mediaRef: "temp_photo", alt: "The boat" }] })), REFS).ok).toBe(true);
    expect(validateComposition(tree(viewer({ mediaRef: undefined })), REFS).ok).toBe(false);
    expect(validateComposition(tree(viewer({ alt: "" })), REFS).ok).toBe(false);
    expect(validateComposition(tree(viewer({ mediaRef: "temp_photo" })), REFS).ok).toBe(false);
    expect(validateComposition(tree(viewer({ children: [{ type: "text", text: "x" }] })), REFS).ok).toBe(false);
  });

  it("never lets a model be used as a picture", () => {
    const result = validateComposition(tree({ type: "media", mediaRef: "temp_model", alt: "Boat" }), REFS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.problem).join(" ")).toMatch(/only in a model_3d_viewer/);
  });

  it("server-renders the poster and a labelled stage; the 3D canvas loads only on request", () => {
    const checked = validateComposition(tree(viewer({ children: [{ type: "media", mediaRef: "temp_photo", alt: "The boat at the dock" }] })), REFS);
    if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
    const rendered = renderToStaticMarkup(
      <CompositionRenderer tree={checked.tree} scope="t" resolveMedia={(ref) => (ref === "temp_model" ? MODEL_URL : "https://cdn.example/boat.jpg")} />,
    );
    const html = rendered.slice(rendered.indexOf("<section data-composition"));
    expect(html).toContain("rv-model");
    expect(html).toContain('src="https://cdn.example/boat.jpg"');
    expect(html).toContain("Turn the boat");
    expect(html).not.toContain("<canvas");
    // The "View in 3D" control only appears after hydration confirms WebGL.
    expect(html).not.toContain("View in 3D");
  });

  it("renders nothing when the reference isn't a .glb, and media nodes never draw a model", () => {
    const checked = validateComposition(tree(viewer()), { allowedMediaRefs: REFS.allowedMediaRefs });
    if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
    const html = renderToStaticMarkup(<CompositionRenderer tree={checked.tree} scope="t" resolveMedia={() => "https://cdn.example/boat.jpg"} />);
    expect(html).not.toContain("rv-model\"");
    const pic = validateComposition(tree({ type: "media", mediaRef: "temp_model", alt: "Boat" }), { allowedMediaRefs: REFS.allowedMediaRefs });
    if (!pic.ok) throw new Error(JSON.stringify(pic.issues));
    const picHtml = renderToStaticMarkup(<CompositionRenderer tree={pic.tree} scope="t" resolveMedia={() => MODEL_URL} />);
    expect(picHtml).not.toContain(".glb");
  });

  it("an older plain section shows an uploaded model in its viewer", () => {
    const legacy = legacySectionToComposition({
      id: "s1",
      kind: "hero",
      heading: "Our boats",
      components: [{ id: "temp_model", kind: "model_3d", label: "Centre console", url: MODEL_URL }],
    } as never, {});
    expect(JSON.stringify(legacy)).toContain('"model_3d_viewer"');
  });
});

describe("adversarial: the site-models bucket is workspace-scoped", () => {
  const sql = readFileSync("supabase/migrations/20261029153000_site_models.sql", "utf8");
  it("is private, .glb-only and size-limited", () => {
    expect(sql).toMatch(/'site-models', 'site-models', false, 26214400, ARRAY\['model\/gltf-binary'\]/);
    expect(sql).toMatch(/SET public = false/);
  });
  it("every policy is bound to the bucket, the models folder and the caller's own workspace", () => {
    const policies = sql.split(/CREATE POLICY/).slice(1);
    expect(policies).toHaveLength(3);
    for (const policy of policies) {
      expect(policy).toMatch(/bucket_id = 'site-models'/);
      expect(policy).toMatch(/\(storage\.foldername\(name\)\)\[2\] = 'models'/);
      expect(policy).toMatch(/private\.(is_org_member|can_manage_org)\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/);
      expect(policy).toMatch(/TO authenticated/);
    }
    expect(sql).not.toMatch(/TO (anon|public)\b/i);
    expect(sql).not.toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/site_models_manager_insert[\s\S]*can_manage_org/);
    expect(sql).toMatch(/site_models_manager_delete[\s\S]*can_manage_org/);
  });
});
