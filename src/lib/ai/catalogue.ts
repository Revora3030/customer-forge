/**
 * The live Lovable AI model catalogue (GET /v1/models), parsed and classified.
 * Browser-safe and pure: fetching lives in catalogue.server.ts.
 *
 * A model is eligible for an app route only when the live catalogue lists it,
 * it is not deprecated, it supports the exact gateway surface that route calls,
 * and that surface is zero-retention (or explicitly allowed by workspace policy).
 */

export type CatalogueModel = {
  id: string;
  deprecated: boolean;
  surfaces: string[];
  inputs: string[];
  outputs: string[];
  retentionBySurface: Record<string, string>;
};

/** Gateway surfaces this app actually calls, per router role. */
export type AppSurface = "chat-completions" | "messages" | "image-generation" | "transcription" | "videos" | "speech";

/** Retained endpoints the workspace policy explicitly allows. */
const RETENTION_ALLOWED: Record<string, AppSurface[]> = {
  "anthropic/claude-fable-5-1": ["messages"],
  "anthropic/claude-haiku-4-5": ["messages"],
  "anthropic/claude-opus-5-5": ["messages"],
  "anthropic/claude-opus-5": ["messages"],
  "anthropic/claude-sonnet-5": ["messages"],
  "google/gemini-omni-1.1-flash": ["videos"],
};

/** Surfaces the gateway offers that no app feature calls yet (reported, never routed). */
export const UNROUTED_SURFACE_REASON: Record<string, string> = {
  speech: "Text-to-speech: Jarvis voice calls one selected speech model (AI_LOVABLE_MODEL_SPEECH); this one is not selected.",
  embeddings: "Embeddings: not integrated; search memory needs a reviewed vector-storage migration (pgvector) that has not been applied.",
  music: "Music: not integrated; no owner-approved music workflow or saved-audio storage exists yet.",
  live: "Live voice: not integrated; needs a server-minted short-lived session flow, not built yet.",
  systemone: "Typed decisions: no app feature uses the /v1/systemone endpoint.",
  "image-edit": "Image edit: picture edits go through image generation with a reference image.",
  responses: "Responses-only: the app's adapter calls chat-completions for OpenAI ids.",
  interactions: "Interactions: not used by the app.",
};

/** Veo is listed on /v1/videos, but the app's video handler is built for Gemini Omni's body; Veo's body and price are unverified. */
export const VEO_REASON = "Video: not routed; the app's video request body is Gemini Omni-specific and Veo's request shape and pricing are not verified.";

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** Validates the /v1/models payload. Throws on anything that isn't a catalogue, so a bad read is never treated as "no models". */
export function parseCatalogue(payload: unknown): CatalogueModel[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) throw new Error("Model catalogue response had no models.");
  const models: CatalogueModel[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const id = typeof entry["id"] === "string" ? entry["id"] : "";
    if (!/^[a-z0-9-]+\/[a-z0-9.-]+$/i.test(id)) continue;
    const modalities = (entry["modalities"] ?? {}) as { input?: unknown; output?: unknown };
    const retention = entry["data_retention_by_surface"];
    models.push({
      id,
      deprecated: entry["deprecated"] === true,
      surfaces: strings(entry["supported_surfaces"]),
      inputs: strings(modalities.input),
      outputs: strings(modalities.output),
      retentionBySurface:
        retention && typeof retention === "object"
          ? Object.fromEntries(Object.entries(retention as Record<string, unknown>).filter((pair): pair is [string, string] => typeof pair[1] === "string"))
          : {},
    });
  }
  if (models.length === 0) throw new Error("Model catalogue response had no valid model ids.");
  return models;
}

/** The surface a router role would call for this model id. */
export function surfaceFor(role: string, id: string): AppSurface {
  if (role === "image") return "image-generation";
  if (role === "transcription") return "transcription";
  if (role === "video") return "videos";
  if (role === "speech") return "speech";
  return id.startsWith("anthropic/") ? "messages" : "chat-completions";
}

/** Why a model can't serve a surface, or null when it can. */
export function ineligibleReason(model: CatalogueModel | undefined, surface: AppSurface, needsImageInput = false): string | null {
  if (!model) return "Not in the live catalogue.";
  if (model.deprecated) return "Deprecated in the live catalogue.";
  if (!model.surfaces.includes(surface)) return `Doesn't support the ${surface} endpoint this route calls.`;
  if (needsImageInput && !model.inputs.includes("image")) return "Can't read images.";
  const retention = model.retentionBySurface[surface] ?? "zero";
  if (retention !== "zero" && !(RETENTION_ALLOWED[model.id] ?? []).includes(surface))
    return `Retains data on ${surface}; workspace policy doesn't allow it.`;
  return null;
}

export type ModelRouteStatus = {
  id: string;
  outputs: string[];
  deprecated: boolean;
  /** Router roles that may call this model now. */
  roles: string[];
  /** Why it has no route, when roles is empty. */
  reason: string | null;
};

/**
 * Every catalogue model with the roles that can reach it and, when none can,
 * the honest reason. `rosters` maps role -> configured model ids.
 */
export function routeStatus(catalogue: CatalogueModel[], rosters: Record<string, string[]>): ModelRouteStatus[] {
  return catalogue
    .map((model) => {
      const roles: string[] = [];
      const reasons: string[] = [];
      for (const [role, ids] of Object.entries(rosters)) {
        if (!ids.includes(model.id)) continue;
        const reason = ineligibleReason(model, surfaceFor(role, model.id), role === "vision");
        if (reason) reasons.push(`${role}: ${reason}`);
        else roles.push(role);
      }
      let reason: string | null = null;
      if (!roles.length) {
        if (reasons.length) reason = reasons.join(" ");
        else if (model.deprecated) reason = "Deprecated in the live catalogue; not routed.";
        else {
          const known = (model.id.startsWith("google/veo-") ? VEO_REASON : undefined) ?? model.surfaces.map((s) => UNROUTED_SURFACE_REASON[s]).find(Boolean);
          reason = known ?? `Not in any app roster (surfaces: ${model.surfaces.join(", ") || "none"}).`;
        }
      }
      return { id: model.id, outputs: model.outputs, deprecated: model.deprecated, roles, reason };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Roster ids that the live catalogue does not support for that role (stale or incompatible). */
export function staleRosterIds(catalogue: CatalogueModel[], rosters: Record<string, string[]>): { role: string; id: string; reason: string }[] {
  const byId = new Map(catalogue.map((model) => [model.id, model]));
  const stale: { role: string; id: string; reason: string }[] = [];
  for (const [role, ids] of Object.entries(rosters))
    for (const id of ids) {
      const reason = ineligibleReason(byId.get(id), surfaceFor(role, id), role === "vision");
      if (reason) stale.push({ role, id, reason });
    }
  return stale;
}
