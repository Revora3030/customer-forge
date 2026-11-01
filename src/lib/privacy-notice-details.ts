/**
 * Owner-written privacy facts for the generated client privacy notice
 * (client-privacy-notice.ts): how long the business keeps enquiries and who
 * else it shares them with. The platform cannot know either, so they are only
 * ever what the owner typed; blank means the notice shows a placeholder.
 *
 * Stored inside the existing `website_settings.generation` jsonb under
 * `privacyNotice`, so no migration is needed. Published sites read it from the
 * published copy, so an edit reaches visitors on the next Publish.
 */

export const PRIVACY_DETAILS_KEY = "privacyNotice";
export const PRIVACY_DETAIL_MAX_LENGTH = 600;

export type PrivacyNoticeDetails = {
  retention: string | null;
  sharing: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Trimmed, single-spaced, length-capped text, or null when blank. */
export function cleanPrivacyDetail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, PRIVACY_DETAIL_MAX_LENGTH) : null;
}

export function readPrivacyNoticeDetails(generation: unknown): PrivacyNoticeDetails {
  const raw = isRecord(generation) ? generation[PRIVACY_DETAILS_KEY] : null;
  const details = isRecord(raw) ? raw : {};
  return {
    retention: cleanPrivacyDetail(details["retention"]),
    sharing: cleanPrivacyDetail(details["sharing"]),
  };
}

/** A copy of `generation` with the owner's privacy details set (other keys kept). */
export function withPrivacyNoticeDetails(
  generation: unknown,
  details: { retention?: unknown; sharing?: unknown },
): Record<string, unknown> {
  const base = isRecord(generation) ? generation : {};
  return {
    ...base,
    [PRIVACY_DETAILS_KEY]: {
      retention: cleanPrivacyDetail(details.retention),
      sharing: cleanPrivacyDetail(details.sharing),
    },
  };
}
