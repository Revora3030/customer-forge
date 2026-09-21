/**
 * IMAGE EDITING CAPABILITY STATE (truthful, never optimistic)
 * ===========================================================
 *
 * Two different things are deliberately kept apart:
 *
 *   - MANUAL editing  — framing, aspect ratio, focal point, alt text, credit,
 *     replace, revert. Deterministic, always available, no model involved.
 *     It is NEVER described as AI editing.
 *   - AI editing      — a model that receives an existing picture and returns a
 *     modified picture. Only reported as available after a real edit probe
 *     succeeds against a model that actually supports image-to-image.
 *
 * A generation-only model can never satisfy an edit request: text-to-image
 * produces a new picture, which is not an edit of the customer's picture.
 */

export type AiEditState =
  /** A real edit probe succeeded against an edit-capable model. */
  | "verified"
  /** No provider credential configured for image work. */
  | "not_configured"
  /** Providers configured, but none exposes an image-to-image model. */
  | "unsupported"
  /** An edit-capable model exists but the probe failed / provider is down. */
  | "unavailable"
  /** Provider reachable but the free allowance for today is spent. */
  | "quota_limited";

export type AiEditCapability = {
  state: AiEditState;
  /** True only for "verified". Nothing else may enable an AI edit action. */
  available: boolean;
  /** Plain-language explanation shown to the customer. */
  message: string;
};

export type AiEditProbe = {
  /** Any image provider credential present. */
  configured: boolean;
  /** At least one model advertises image-to-image / inpaint support. */
  editCapableModel: boolean;
  /** Result of the live edit probe, undefined when it was not run. */
  probePassed?: boolean;
  /** Free daily allowance exhausted. */
  quotaSpent?: boolean;
};

/** Always-true manual capability. Wording must not imply AI involvement. */
export const MANUAL_EDIT_CAPABILITY = {
  available: true,
  controls: [
    "aspect_ratio",
    "focal_point",
    "fit",
    "alt_text",
    "provenance",
    "replace",
    "revert",
  ] as const,
  message:
    "Framing, focal point, fit, description and credit are edited directly. No AI model is used.",
};

export function describeAiEditCapability(probe: AiEditProbe): AiEditCapability {
  if (!probe.configured)
    return {
      state: "not_configured",
      available: false,
      message: "AI picture editing is not configured. Manual picture controls are available.",
    };
  if (!probe.editCapableModel)
    return {
      state: "unsupported",
      available: false,
      message:
        "No configured model can edit an existing picture. Picture generation is a different capability and cannot edit your picture.",
    };
  if (probe.quotaSpent)
    return {
      state: "quota_limited",
      available: false,
      message: "Today's free picture allowance is used up. Manual picture controls still work.",
    };
  if (probe.probePassed === true)
    return {
      state: "verified",
      available: true,
      message: "AI picture editing was verified against a live edit check.",
    };
  return {
    state: "unavailable",
    available: false,
    message:
      probe.probePassed === false
        ? "The live picture-editing check failed, so AI editing stays switched off."
        : "AI picture editing has not been verified yet, so it stays switched off.",
  };
}

/**
 * Guard for the request boundary: an edit request must carry a source picture
 * and must only ever run on a model that supports editing.
 */
export function canSatisfyEditRequest(input: {
  hasSource: boolean;
  modelSupportsEditing: boolean;
}): boolean {
  return input.hasSource && input.modelSupportsEditing;
}
