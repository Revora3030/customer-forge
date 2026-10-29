/**
 * Owner-uploaded 3D models (binary glTF, .glb) for the model_3d_viewer
 * primitive. Files live in the private `site-models` bucket at
 * "<organization_id>/models/<uuid>.glb"; each is placed on the site as a
 * website_components row of kind "model_3d" whose media_url is that path.
 */
export const MODEL_BUCKET = "site-models";
export const MODEL_COMPONENT_KIND = "model_3d";
export const MODEL_MIME = "model/gltf-binary";
export const MAX_MODEL_BYTES = 25 * 1024 * 1024;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MODEL_PATH = new RegExp(`^(${UUID})/models/${UUID}\\.glb$`, "i");

/** True for a storage path in the models bucket layout. */
export function isModelPath(path: unknown): path is string {
  return typeof path === "string" && MODEL_PATH.test(path);
}

/** True when the path belongs to this workspace's model folder. */
export function isOrgModelPath(path: unknown, organizationId: string): boolean {
  return isModelPath(path) && path.slice(0, 36).toLowerCase() === organizationId.toLowerCase();
}

export function buildModelPath(organizationId: string, id: string = crypto.randomUUID()): string {
  const path = `${organizationId}/models/${id}.glb`;
  if (!isModelPath(path)) throw new Error("Invalid workspace for a 3D model.");
  return path;
}

/** A signed or public URL that points at a .glb (query strings allowed). */
export function isModelUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".glb");
  } catch {
    return false;
  }
}

/**
 * Checks the binary glTF 2.0 header: magic "glTF", version 2, and a declared
 * length that matches the file. Rejects renamed images, zips or truncated files.
 */
export function glbProblem(bytes: Uint8Array, declaredSize = bytes.byteLength): string | null {
  if (declaredSize > MAX_MODEL_BYTES) return `3D models must be ${Math.round(MAX_MODEL_BYTES / 1024 / 1024)} MB or smaller.`;
  if (bytes.byteLength < 20) return "That file is too small to be a 3D model.";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) return "Only binary glTF (.glb) models are supported.";
  if (view.getUint32(4, true) !== 2) return "Only glTF 2.0 models are supported.";
  if (view.getUint32(8, true) !== declaredSize) return "That .glb file looks incomplete. Export it again and retry.";
  if (view.getUint32(16, true) !== 0x4e4f534a) return "That .glb file has no scene description.";
  return null;
}
