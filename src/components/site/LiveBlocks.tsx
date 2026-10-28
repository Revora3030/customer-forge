/**
 * Live blocks: parts of a client website that read straight from the owner's
 * workspace tools, so the site always matches what the owner manages.
 *
 * - ServiceMenu reads the Services tool (name, description, price, duration).
 *   Adding, editing, hiding or repricing a service updates every page that
 *   shows the menu — no rebuild needed.
 * - ReviewWall reads the Reviews tool (published reviews only). Publishing or
 *   unpublishing a review changes the site straight away.
 *
 * Both render nothing when there is nothing real to show, and both inherit the
 * site's own theme colours (or the AI's widget theme), never a fixed palette.
 */
import { useState } from "react";
import { Star } from "lucide-react";
import type { WidgetPresentation } from "@/lib/builder/composition-tree";
import type { PublicSite } from "@/lib/public-site.functions";
import { widgetPresentationStyle } from "@/components/site/contact-details-utils";
import { serviceMenuItems, reviewWallItems } from "@/components/site/live-blocks-utils";
import { useOwnAddress, useSiteBase } from "@/components/site/use-own-address";

type Site = NonNullable<PublicSite>;

export function ServiceMenu({ site, presentation, limit = 12 }: { site: Site; presentation?: WidgetPresentation; limit?: number }) {
  const items = serviceMenuItems(site.services ?? [], limit);
  const ownAddress = useOwnAddress();
  const previewBase = useSiteBase();
  if (!items.length) return null;
  const bookHref = previewBase ? `${previewBase}#book` : ownAddress ? "/#book" : `/s/${encodeURIComponent(site.org.slug)}#book`;
  const hasBooking = items.some((item) => item.bookable);
  return (
    <div data-live-block="service_menu" style={widgetPresentationStyle(presentation)} className="w-full">
      {presentation?.eyebrow || presentation?.title ? (
        <div className="mb-6">
          {presentation?.eyebrow ? <p className="eyebrow">{presentation.eyebrow}</p> : null}
          {presentation?.title ? <h3 className="mt-1 font-display text-[22px] font-semibold">{presentation.title}</h3> : null}
          {presentation?.description ? <p className="mt-2 text-[14px] text-muted-foreground">{presentation.description}</p> : null}
        </div>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 text-card-foreground">
            {item.image ? (
              <img src={item.image} alt="" loading="lazy" decoding="async" className="mb-4 aspect-[4/3] w-full rounded-lg object-cover" />
            ) : null}
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-display text-[17px] font-semibold leading-snug">{item.name}</h4>
              {item.price ? <span className="tnum shrink-0 text-[15px] font-semibold text-primary">{item.price}</span> : null}
            </div>
            {item.description ? <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{item.description}</p> : null}
            <div className="mt-auto flex items-center justify-between gap-3 pt-4">
              {item.duration ? <span className="text-[13px] text-muted-foreground">{item.duration}</span> : <span />}
              {item.bookable && hasBooking ? (
                <a href={bookHref} className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground">
                  {presentation?.actionLabel ?? "Book"}
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const REVIEW_FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "5", label: "5 stars", test: (rating: number) => rating === 5 },
  { id: "4", label: "4 stars & up", test: (rating: number) => rating >= 4 },
] as const;

export function ReviewWall({ site, presentation, limit = 6 }: { site: Site; presentation?: WidgetPresentation; limit?: number }) {
  const items = reviewWallItems(site.reviews ?? [], limit);
  const [filter, setFilter] = useState<(typeof REVIEW_FILTERS)[number]["id"]>("all");
  if (!items.length) return null;
  const average = items.reduce((sum, r) => sum + r.rating, 0) / items.length;
  // Filter chips only appear when they would change what is shown: they
  // sort real published reviews and never hide the average above them.
  const filters = REVIEW_FILTERS.filter((option) => option.id === "all" || (items.length >= 4 && items.some((r) => option.test(r.rating)) && items.some((r) => !option.test(r.rating))));
  const active = REVIEW_FILTERS.find((option) => option.id === filter) ?? REVIEW_FILTERS[0];
  const shown = items.filter((r) => active.test(r.rating));
  return (
    <div data-live-block="review_wall" style={widgetPresentationStyle(presentation)} className="w-full">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          {presentation?.eyebrow ? <p className="eyebrow">{presentation.eyebrow}</p> : null}
          {presentation?.title ? <h3 className="mt-1 font-display text-[22px] font-semibold">{presentation.title}</h3> : null}
        </div>
        <p className="flex items-center gap-1.5 text-[14px] text-muted-foreground" aria-label={`Average rating ${average.toFixed(1)} out of 5`}>
          <Star className="size-4 fill-current text-primary" aria-hidden="true" />
          <span className="tnum font-semibold text-foreground">{average.toFixed(1)}</span> · {items.length} review{items.length === 1 ? "" : "s"}
        </p>
      </div>
      {filters.length > 1 ? (
        <div role="group" aria-label="Filter reviews" className="mb-4 flex flex-wrap gap-2">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === active.id}
              onClick={() => setFilter(option.id)}
              className={`min-h-11 rounded-full border px-4 text-[14px] transition ${option.id === active.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((review) => (
          <li key={review.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 text-card-foreground">
            <div className="flex gap-0.5 text-primary" aria-label={`${review.rating} out of 5 stars`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} aria-hidden="true" className={i < review.rating ? "size-4 fill-current" : "size-4 opacity-30"} />
              ))}
            </div>
            <blockquote className="mt-3 text-[15px] leading-relaxed">“{review.comment}”</blockquote>
            <p className="mt-auto pt-4 text-[13px] font-medium text-muted-foreground">{review.author}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

