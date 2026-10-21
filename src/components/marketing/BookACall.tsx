import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ExternalLink } from "lucide-react";
import { getRevoraBookingOptions } from "@/lib/calendly.functions";

/** "Book a call" card on Revora's contact page. Hidden entirely when Calendly is unavailable. */
export function BookACall() {
  const { data } = useQuery({
    queryKey: ["revora-booking-options"],
    queryFn: () => getRevoraBookingOptions(),
    staleTime: 10 * 60 * 1000,
  });
  if (!data?.available || data.options.length === 0) return null;
  return (
    <section className="panel hairline-gold mt-6 p-5" aria-labelledby="book-call-title">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" aria-hidden="true" />
        <h2 id="book-call-title" className="font-editorial text-[22px] leading-tight">
          Book a call
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">Pick a time that works for you. Opens Calendly.</p>
      <ul className="mt-4 grid gap-2">
        {data.options.map((o) => (
          <li key={o.url}>
            <a
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 text-[14px] font-medium transition-colors hover:border-primary hover:text-primary"
            >
              <span className="truncate">{o.name}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                {o.minutes ? `${o.minutes} min` : null}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
