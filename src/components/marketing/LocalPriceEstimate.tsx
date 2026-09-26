import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUsdRate } from "@/lib/currency.functions";

const REGION_CURRENCY: Record<string, string> = {
  GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", IN: "INR", JP: "JPY", MX: "MXN", BR: "BRL",
  ZA: "ZAR", NG: "NGN", KE: "KES", PH: "PHP", SG: "SGD", AE: "AED", CH: "CHF", SE: "SEK",
  NO: "NOK", DK: "DKK", PL: "PLN", JM: "JMD", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR",
  NL: "EUR", IE: "EUR", PT: "EUR", BE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
};

/** Shows the price in the visitor's own currency as an estimate. Billing stays in USD. */
export function LocalPriceEstimate({ setup, monthly }: { setup: number; monthly: number }) {
  const [currency, setCurrency] = useState<string | null>(null);
  useEffect(() => {
    const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
    const c = REGION_CURRENCY[region];
    if (c) setCurrency(c);
  }, []);
  const fetchRate = useServerFn(getUsdRate);
  const q = useQuery({
    queryKey: ["usd-rate", currency],
    queryFn: () => fetchRate({ data: { currency: currency! } }),
    enabled: !!currency,
    staleTime: 6 * 3600_000,
  });
  const rate = q.data?.rate;
  if (!currency || !rate) return null;
  const fmt = new Intl.NumberFormat(navigator.language, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return (
    <p className="mt-4 text-[12px] text-muted-foreground">
      About {fmt.format(setup * rate)} setup and {fmt.format(monthly * rate)}/month in your
      currency. Estimate only — you're billed in US dollars.
    </p>
  );
}
