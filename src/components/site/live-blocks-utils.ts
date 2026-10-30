import { mergeSplitServices } from "@/lib/builder/intake-sanitize";
import { currency } from "@/lib/format";
import { safeParagraph, safeText } from "@/lib/builder/presentation";
import { resolveImageSource } from "@/lib/brand-logos";
import { matchService } from "@/lib/builder/cinematic-primitives";
import { packageScope } from "@/lib/builder/service-packages";

type ServiceRow = {
  id: string;
  name: string | null;
  description?: string | null;
  price?: number | string | null;
  starting_price?: number | string | null;
  duration_minutes?: number | null;
  image_url?: string | null;
  bookable?: boolean | null;
  featured?: boolean | null;
  sort_order?: number | null;
};

type ReviewRow = { id: string; author_name: string | null; rating: number | null; comment: string | null };

const money = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Human duration: 90 -> "1 hr 30 min". */
export function durationLabel(minutes: number | null | undefined): string | null {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return null;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  if (!h) return `${rest} min`;
  return rest ? `${h} hr ${rest} min` : `${h} hr`;
}

/** Same-page link that opens the booking form with this service selected. */
export function packageBookHref(base: string, serviceId: string): string {
  const path = base.replace(/#.*$/, "");
  return `${path}#book-${encodeURIComponent(serviceId)}`;
}

/** The owner's active services, featured first, ready to display. */
export function serviceMenuItems(rows: ServiceRow[], limit = 12, industry: string | null = null) {
  return mergeSplitServices([...rows])
    .filter((row) => safeText(row.name))
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .slice(0, Math.max(1, limit))
    .map((row) => {
      const exact = money(row.price);
      const from = money(row.starting_price);
      const image = row.image_url && /^https:\/\//i.test(row.image_url) ? resolveImageSource(row.image_url) : null;
      return {
        id: row.id,
        name: safeText(row.name)!,
        description: safeParagraph(row.description) || null,
        inclusions: safeParagraph(row.description) ? [] : packageScope(industry),
        price: exact ? currency(exact) : from ? `From ${currency(from)}` : null,
        duration: durationLabel(row.duration_minutes),
        image,
        bookable: Boolean(row.bookable),
      };
    });
}

/**
 * An offer card's facts: the named service's own name, price and duration,
 * straight from the owner's Services tool. An unknown service, or one with
 * no price, yields no price — a card never shows an invented amount.
 */
export function offerFactsFor(rows: ServiceRow[], service: string): { name: string; price: string | null; duration: string | null } | null {
  const match = matchService(service, serviceMenuItems(rows, 500));
  return match ? { name: match.name, price: match.price, duration: match.duration } : null;
}

/** Published reviews with real words, best and newest first. */
export function reviewWallItems(rows: ReviewRow[], limit = 6) {
  return rows
    .map((row) => ({
      id: row.id,
      author: safeText(row.author_name) || "Verified customer",
      rating: Math.max(1, Math.min(5, Math.round(Number(row.rating ?? 5)) || 5)),
      comment: safeParagraph(row.comment) || "",
    }))
    .filter((row) => row.comment.length >= 8)
    .slice(0, Math.max(1, limit));
}

export type EstimatorOption = { id: string; name: string; amount: number | null; from: boolean; minutes: number | null };

/**
 * Zero-token price/time estimator options: only the owner's own services that
 * carry a real price or duration. Nothing is estimated that the owner did not
 * enter, so a business with no prices or durations gets no estimator.
 */
export function estimatorOptions(rows: ServiceRow[], limit = 12): EstimatorOption[] {
  return mergeSplitServices([...rows])
    .filter((row) => safeText(row.name))
    .map((row) => {
      const exact = money(row.price);
      const from = money(row.starting_price);
      const minutes = Number(row.duration_minutes);
      return {
        id: row.id,
        name: safeText(row.name)!,
        amount: exact ?? from,
        from: !exact && Boolean(from),
        minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
      };
    })
    .filter((option) => option.amount !== null || option.minutes !== null)
    .slice(0, Math.max(1, limit));
}

/** Running total for the visitor's picks: sum of real prices and durations, "from" when any pick is a starting price. */
export function estimateTotal(options: EstimatorOption[], picked: ReadonlySet<string>) {
  const chosen = options.filter((option) => picked.has(option.id));
  const priced = chosen.filter((option) => option.amount !== null);
  const timed = chosen.filter((option) => option.minutes !== null);
  return {
    count: chosen.length,
    price: priced.length ? `${chosen.some((o) => o.from || o.amount === null) ? "From " : ""}${currency(priced.reduce((sum, o) => sum + (o.amount ?? 0), 0))}` : null,
    duration: timed.length ? durationLabel(timed.reduce((sum, o) => sum + (o.minutes ?? 0), 0)) : null,
    unpriced: chosen.length - priced.length,
  };
}
