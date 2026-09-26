import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Live USD exchange rate for showing a local-currency ESTIMATE only.
 * Billing always stays in USD; nothing here changes what Stripe charges.
 */
let cache: { at: number; rates: Record<string, number> } | null = null;

export const getUsdRate = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ currency: z.string().regex(/^[A-Z]{3}$/) }).parse(data))
  .handler(async ({ data }): Promise<{ rate: number | null; currency: string }> => {
    try {
      if (!cache || Date.now() - cache.at > 6 * 3600_000) {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        if (!res.ok) return { rate: null, currency: data.currency };
        const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
        if (json.result !== "success" || !json.rates) return { rate: null, currency: data.currency };
        cache = { at: Date.now(), rates: json.rates };
      }
      const rate = cache.rates[data.currency];
      return { rate: typeof rate === "number" && rate > 0 ? rate : null, currency: data.currency };
    } catch {
      return { rate: null, currency: data.currency };
    }
  });
