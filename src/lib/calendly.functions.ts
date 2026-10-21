import { createServerFn } from "@tanstack/react-start";
import { pickPublicEventTypes, type PublicBookingOption } from "./calendly-options";

/**
 * Revora's own public "Book a call" options from the owner's linked Calendly.
 * Public by design: returns only what Calendly already publishes on the
 * booking page (event name, length, booking link). Cached briefly so page
 * views don't hit Calendly on every render.
 */
let cache: { at: number; options: PublicBookingOption[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

export const getRevoraBookingOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ options: PublicBookingOption[]; available: boolean }> => {
    if (cache && Date.now() - cache.at < TTL_MS) return { options: cache.options, available: true };
    const lovable = process.env["LOVABLE_API_KEY"];
    const key = process.env["CALENDLY_API_KEY"];
    if (!lovable || !key) return { options: [], available: false };
    const headers = { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": key };
    const base = "https://connector-gateway.lovable.dev/calendly";
    try {
      const me = await fetch(`${base}/users/me`, { headers });
      if (!me.ok) {
        console.error(`Calendly users/me failed [${me.status}]: ${await me.text()}`);
        return { options: [], available: false };
      }
      const user = ((await me.json()) as { resource?: { uri?: string } }).resource?.uri;
      if (!user) return { options: [], available: false };
      const url = new URL(`${base}/event_types`);
      url.searchParams.set("user", user);
      url.searchParams.set("active", "true");
      url.searchParams.set("count", "20");
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        console.error(`Calendly event_types failed [${res.status}]: ${await res.text()}`);
        return { options: [], available: false };
      }
      const options = pickPublicEventTypes(await res.json());
      cache = { at: Date.now(), options };
      return { options, available: true };
    } catch (err) {
      console.error("Calendly lookup failed", err);
      return { options: [], available: false };
    }
  },
);
