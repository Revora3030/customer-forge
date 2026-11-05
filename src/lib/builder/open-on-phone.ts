/**
 * "Open on your phone" — which address a QR code should point at.
 *
 * A published site uses its always-working platform address. A draft uses the
 * newest private preview link that is still switched on and not expired. When
 * there is no such link we return null: no QR is better than a QR for an
 * address that does not exist.
 */
import { PLATFORM_ORIGIN, clientSitePath } from "@/lib/revora-address";

export type PhoneLink = {
  kind: "live" | "preview";
  url: string;
  /** Plain-language name for what the QR opens. */
  label: string;
};

type LinkLike = { token: string; revoked: boolean; expires_at: string };

/** Newest first, like the query returns them. */
export function activePreviewToken(links: readonly LinkLike[] | null | undefined, now = Date.now()): string | null {
  for (const link of links ?? []) {
    const expires = new Date(link.expires_at).getTime();
    if (!link.revoked && Number.isFinite(expires) && expires > now && /^[A-Za-z0-9_-]+$/.test(link.token)) {
      return link.token;
    }
  }
  return null;
}

export function phoneLink(input: {
  publishState: string | null | undefined;
  slug: string | null | undefined;
  links?: readonly LinkLike[] | null | undefined;
  /** Origin the preview link opens on (the builder's own origin). */
  origin?: string | undefined;
  now?: number | undefined;
}): PhoneLink | null {
  if (input.publishState === "published") {
    const path = clientSitePath(input.slug);
    if (!path) return null;
    return { kind: "live", url: `${PLATFORM_ORIGIN}${path}`, label: "your live website" };
  }
  const token = activePreviewToken(input.links, input.now);
  const origin = (input.origin ?? "").replace(/\/+$/, "");
  if (!token || !origin) return null;
  return { kind: "preview", url: `${origin}/p/${token}`, label: "your private draft preview" };
}

export function phoneQrAlt(link: PhoneLink): string {
  return `QR code that opens ${link.label} on a phone`;
}
