import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MapsLinkFields } from "./maps-link";

export type MapsLinkResponse =
  | { ok: true; fields: MapsLinkFields; /** Free map frame, shown to the owner so they can see it before building. */ embedUrl: string | null }
  | { ok: false; message: string };

// A signed-in person can read a handful of Maps links an hour.
const WINDOW_MS = 60 * 60_000;
const PER_WINDOW = 30;
const recent = new Map<string, number[]>();

function allowed(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= PER_WINDOW) return false;
  hits.push(now);
  recent.set(userId, hits);
  return true;
}

/**
 * Reads a pasted Google Maps link for the owner to confirm. Full links are
 * read as text. Share short links are followed with a plain request that only
 * reads the redirect's Location header; Google's pages are never fetched or
 * scraped, and no Google Places key is used.
 */
export const readMapsLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { url: string }) => {
    const url = String(input?.url ?? "").trim().slice(0, 2000);
    if (url.length < 8) throw new Error("Paste a Google Maps link.");
    return { url };
  })
  .handler(async ({ context, data }): Promise<MapsLinkResponse> => {
    if (!allowed(String(context.userId)))
      return { ok: false, message: "You've read several links in the last hour. Try again a little later." };
    const { parseMapsLink, mapsLinkFromResolved, mapsEmbedUrl } = await import("./maps-link");
    try {
      let parsed = parseMapsLink(data.url);
      if (parsed.ok && parsed.kind === "short_link") {
        const { resolveShortLink } = await import("./maps-link.server");
        parsed = parseMapsLink(mapsLinkFromResolved(await resolveShortLink(parsed.url)));
      }
      if (!parsed.ok) return { ok: false, message: parsed.message };
      if (parsed.kind !== "place")
        return { ok: false, message: "Couldn't open that share link. Paste the full address from the Google Maps browser bar instead." };
      return { ok: true, fields: parsed.fields, embedUrl: mapsEmbedUrl(parsed.fields) };
    } catch (error) {
      console.warn("maps link read failed", (error as Error).message);
      return { ok: false, message: "Couldn't open that link just now. Paste the full address from the Google Maps browser bar, or type your details." };
    }
  });
