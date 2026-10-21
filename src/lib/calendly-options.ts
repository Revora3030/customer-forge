export type PublicBookingOption = { name: string; minutes: number | null; url: string };

/** Keep only active, public, calendly.com booking links; never internal/secret events. */
export function pickPublicEventTypes(payload: unknown): PublicBookingOption[] {
  const list = (payload as { collection?: unknown[] })?.collection;
  if (!Array.isArray(list)) return [];
  const out: PublicBookingOption[] = [];
  for (const raw of list) {
    const e = raw as {
      name?: unknown;
      duration?: unknown;
      scheduling_url?: unknown;
      active?: unknown;
      secret?: unknown;
    };
    if (e.active === false || e.secret === true) continue;
    if (typeof e.name !== "string" || typeof e.scheduling_url !== "string") continue;
    let host = "";
    try {
      const u = new URL(e.scheduling_url);
      if (u.protocol !== "https:") continue;
      host = u.hostname;
    } catch {
      continue;
    }
    if (host !== "calendly.com" && !host.endsWith(".calendly.com")) continue;
    out.push({
      name: e.name.slice(0, 80),
      minutes: typeof e.duration === "number" ? e.duration : null,
      url: e.scheduling_url,
    });
  }
  return out.slice(0, 6);
}
