/**
 * MEDIA PROVIDER REGISTRY
 * =======================
 *
 * One honest answer to "where can a picture come from right now?".
 *
 * Every source carries an explicit state. Nothing is ever reported as available
 * because code for it exists — a source is only `available` when the credential
 * or asset it needs is actually present in this environment. There is no paid
 * fallback: if no zero-cost source is available, we say so and fall through to
 * generated abstract artwork rather than pretending a generator ran.
 */

export type MediaSourceState =
  | "available"        // usable right now, verified by a present credential/asset
  | "not_configured"   // supported, but no credential present
  | "blocked"          // would cost money or breaks the zero-cost rule
  | "unavailable";     // not supported in this runtime

export type MediaSourceKind = "owner_upload" | "generated_art" | "stock_search" | "ai_generation";

export type MediaSource = {
  id: string;
  kind: MediaSourceKind;
  label: string;
  state: MediaSourceState;
  /** Plain-language reason, safe to show an owner. Never contains secrets. */
  reason: string;
  /** True only for sources that cost nothing. */
  zeroCost: boolean;
};

export type MediaEnvironment = {
  /** Count of real photos the owner has uploaded for this website. */
  ownerAssetCount: number;
  /** Names of credentials present. Values are never read here. */
  presentSecrets: readonly string[];
};

const STOCK_SECRETS = ["PEXELS_API_KEY", "UNSPLASH_ACCESS_KEY", "OPENVERSE_CLIENT_ID"];

/**
 * Resolves the live state of every media source. Pure and side-effect free, so
 * it can be asserted in tests and shown in the admin proof report.
 */
export function resolveMediaSources(env: MediaEnvironment): MediaSource[] {
  const present = new Set(env.presentSecrets);
  const stock = STOCK_SECRETS.find((name) => present.has(name));

  return [
    {
      id: "owner_upload",
      kind: "owner_upload",
      label: "Photos the owner uploaded",
      state: env.ownerAssetCount > 0 ? "available" : "not_configured",
      reason: env.ownerAssetCount > 0
        ? `${env.ownerAssetCount} owner-supplied photo(s) available.`
        : "The owner has not uploaded any photos yet.",
      zeroCost: true,
    },
    {
      id: "generated_art",
      kind: "generated_art",
      label: "Generated abstract artwork",
      state: "available",
      reason: "Drawn in the browser from shapes and colours. Costs nothing and needs no provider.",
      zeroCost: true,
    },
    {
      id: "stock_search",
      kind: "stock_search",
      label: "Free stock photo search",
      state: stock ? "available" : "not_configured",
      reason: stock
        ? `Enabled by a stored free-tier key (${stock}). Subject to that provider's free-tier limits and licence terms.`
        : "No free stock photo key is stored, so stock search is off.",
      zeroCost: true,
    },
    {
      id: "ai_generation",
      kind: "ai_generation",
      label: "AI image generation",
      state: "blocked",
      reason: "Every image model reachable here costs credits per picture, which breaks the zero-cost rule for website building.",
      zeroCost: false,
    },
  ];
}

export type MediaPlan = {
  /** The source that will actually be used. */
  source: MediaSource;
  /** Everything considered, for the proof report. */
  considered: MediaSource[];
  /** True when artwork (not a photograph) will be shown. */
  usesGeneratedArt: boolean;
  /** Plain-language sentence for the owner. Never overclaims. */
  explanation: string;
};

/**
 * Chooses the media source for a slot. Owner photos win, then free stock search
 * when a key is genuinely present, then generated artwork. Paid generation is
 * never selected.
 *
 * `mustBeReal` slots (team photos, proof of work, premises) refuse artwork:
 * they return the generated-art source only when the caller allows decoration,
 * otherwise the slot is reported as unavailable so nothing fabricated is shown.
 */
export function planMedia(env: MediaEnvironment, options?: { mustBeReal?: boolean }): MediaPlan {
  const considered = resolveMediaSources(env);
  const byId = (id: string) => considered.find((source) => source.id === id)!;

  const owner = byId("owner_upload");
  if (owner.state === "available") {
    return {
      source: owner,
      considered,
      usesGeneratedArt: false,
      explanation: "Using the photos the owner uploaded.",
    };
  }

  if (options?.mustBeReal) {
    const stockReal = byId("stock_search");
    if (stockReal.state === "available") {
      return {
        source: stockReal,
        considered,
        usesGeneratedArt: false,
        explanation: "Using a free stock photo, because this spot needs a real picture and none was uploaded.",
      };
    }
    return {
      source: { ...byId("ai_generation"), state: "blocked" },
      considered,
      usesGeneratedArt: false,
      explanation: "This spot needs a real photograph of the business, so it is left out until the owner uploads one. Nothing was invented.",
    };
  }

  const stock = byId("stock_search");
  if (stock.state === "available") {
    return {
      source: stock,
      considered,
      usesGeneratedArt: false,
      explanation: "Using a free stock photo within that provider's free-tier limits.",
    };
  }

  return {
    source: byId("generated_art"),
    considered,
    usesGeneratedArt: true,
    explanation: "No photos are available, so this space shows generated abstract artwork instead of an empty frame.",
  };
}
