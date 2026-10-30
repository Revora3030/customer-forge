import { createServerFn } from "@tanstack/react-start";
import type { Holiday } from "@/lib/holidays";

/**
 * Upcoming national holidays for a public site's booking form and hours block.
 * Anonymous (holiday dates are public facts); only called when the owner has
 * "Closed on public holidays" switched on. Always resolves; [] on any failure.
 */
export const getUpcomingHolidays = createServerFn({ method: "GET" })
  .validator((input: { from?: string }) => {
    const from = typeof input?.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.from) ? input.from : null;
    return { from: from ?? new Date().toISOString().slice(0, 10) };
  })
  .handler(async ({ data }): Promise<Holiday[]> => {
    try {
      const { upcomingHolidays } = await import("@/lib/holidays.server");
      return await upcomingHolidays(data.from, 400);
    } catch {
      return [];
    }
  });
