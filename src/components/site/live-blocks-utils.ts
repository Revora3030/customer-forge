import { currency } from "@/lib/format";
import { safeParagraph, safeText } from "@/lib/builder/presentation";
import { resolveImageSource } from "@/lib/brand-logos";

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

/** The owner's active services, featured first, ready to display. */
export function serviceMenuItems(rows: ServiceRow[], limit = 12) {
  return [...rows]
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
        price: exact ? currency(exact) : from ? `From ${currency(from)}` : null,
        duration: durationLabel(row.duration_minutes),
        image,
        bookable: Boolean(row.bookable),
      };
    });
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
