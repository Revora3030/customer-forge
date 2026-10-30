/**
 * Server-only reader for the live Lovable AI catalogue (GET /v1/models — a
 * listing, no tokens generated). Bounded 8s timeout, 10-minute cache, and the
 * last good copy is kept when a refresh fails so routing never empties because
 * of a transient read error. The key never leaves the server.
 */
import { ineligibleReason, parseCatalogue, surfaceFor, type CatalogueModel } from "./catalogue";

const URL = "https://ai.gateway.lovable.dev/v1/models";
const TTL_MS = 10 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 1000;

export type CatalogueSnapshot =
  | { state: "live" | "stale"; models: CatalogueModel[]; fetchedAt: string; error: string | null }
  | { state: "unavailable"; models: null; fetchedAt: null; error: string };

let good: { at: number; models: CatalogueModel[] } | null = null;
let lastFailure: { at: number; error: string } | null = null;
let inflight: Promise<void> | null = null;

/** Test seam. */
export function resetCatalogueCache() {
  good = null;
  lastFailure = null;
  inflight = null;
}

function filterEnabled() {
  return (process.env["AI_CATALOGUE_FILTER"] ?? "").trim().toLowerCase() !== "off";
}

async function refresh(fetcher: typeof fetch): Promise<void> {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) {
    lastFailure = { at: Date.now(), error: "LOVABLE_API_KEY is not configured." };
    return;
  }
  try {
    const response = await fetcher(URL, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Catalogue read failed (${response.status}).`);
    good = { at: Date.now(), models: parseCatalogue(await response.json()) };
    lastFailure = null;
  } catch (error) {
    lastFailure = { at: Date.now(), error: error instanceof Error ? error.message.slice(0, 200) : "Catalogue read failed." };
  }
}

export async function liveCatalogue(fetcher: typeof fetch = fetch): Promise<CatalogueSnapshot> {
  const now = Date.now();
  const fresh = good && now - good.at < TTL_MS;
  const backingOff = lastFailure && now - lastFailure.at < RETRY_AFTER_FAILURE_MS;
  if (!fresh && !backingOff) {
    inflight ??= refresh(fetcher).finally(() => {
      inflight = null;
    });
    await inflight;
  }
  if (good) {
    const stale = Date.now() - good.at >= TTL_MS || lastFailure !== null;
    return { state: stale ? "stale" : "live", models: good.models, fetchedAt: new Date(good.at).toISOString(), error: lastFailure?.error ?? null };
  }
  return { state: "unavailable", models: null, fetchedAt: null, error: lastFailure?.error ?? "Catalogue not read yet." };
}

/**
 * Router filter: a predicate that drops roster ids the live catalogue can't
 * serve for this role. When the catalogue can't be read at all, the static
 * roster (verified at commit time) is used and health reports "unverified".
 */
export async function catalogueFilterFor(role: string): Promise<((model: string) => boolean) | null> {
  if (!filterEnabled()) return null;
  const snapshot = await liveCatalogue();
  if (!snapshot.models) return null;
  const byId = new Map(snapshot.models.map((model) => [model.id, model]));
  return (model) => ineligibleReason(byId.get(model), surfaceFor(role, model), role === "vision") === null;
}

/**
 * Dynamic text-capable fallbacks discovered from the live catalogue.
 *
 * Configured rosters remain first choice. This returns only models that can
 * answer on the router's exact text endpoint, accept text input, produce text
 * output, pass deprecation/retention policy, and (for vision) accept images.
 * If catalogue verification is unavailable or disabled, return no dynamic
 * additions and leave the known static roster as the fallback.
 */
export async function eligibleCatalogueModelsForRole(role: string): Promise<string[]> {
  if (!filterEnabled()) return [];
  const snapshot = await liveCatalogue();
  if (!snapshot.models) return [];
  return snapshot.models
    .filter((model) => {
      const surface = surfaceFor(role, model.id);
      if (surface !== "chat-completions" && surface !== "messages") return false;
      if (!model.inputs.includes("text") || !model.outputs.includes("text")) return false;
      if (ineligibleReason(model, surface, role === "vision") !== null) return false;
      return true;
    })
    .map((model) => model.id)
    .sort((a, b) => a.localeCompare(b));
}
