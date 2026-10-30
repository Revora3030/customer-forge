/**
 * Booking date picker as a strip of day chips (quality bar #1), replacing the
 * native date input. A radiogroup with roving focus: arrows move between open
 * days (and choose, as radios do), Home/End jump; closed days from the owner's
 * hours are shown but disabled. "More dates" extends the strip.
 *
 * Submits "YYYY-MM-DD" through a hidden input with the same name, the exact
 * value the native input sent. Until hydration (and without JavaScript) the
 * native date input is rendered instead.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { dateChipDays, localIsoToday, nextOpenChip } from "@/lib/date-chips";
import { cn } from "@/lib/utils";

const STEP = 14;
const MAX_DAYS = 90;

export function DateChips({
  id,
  name,
  value,
  onChange,
  hours,
  labelledBy,
  describedBy,
  fallback,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (iso: string) => void;
  hours: unknown;
  labelledBy: string;
  describedBy?: string | undefined;
  /** The native input shown before hydration / without JavaScript. */
  fallback: ReactNode;
}) {
  const [today, setToday] = useState("");
  const [count, setCount] = useState(STEP);
  const chipsRef = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => setToday(localIsoToday()), []);
  if (!today) return <>{fallback}</>;

  const chips = dateChipDays(today, count, hours);
  const picked = chips.findIndex((c) => c.iso === value);
  const firstOpen = chips.findIndex((c) => !c.closed);
  const focusIndex = picked >= 0 ? picked : firstOpen;

  const move = (index: number) => {
    const chip = chips[index];
    if (!chip || chip.closed) return;
    onChange(chip.iso);
    chipsRef.current[index]?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = nextOpenChip(chips, index, 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = nextOpenChip(chips, index, -1);
    else if (event.key === "Home") next = firstOpen;
    else if (event.key === "End") next = nextOpenChip(chips, chips.length, -1);
    if (next == null || next < 0) return;
    event.preventDefault();
    move(next);
  };

  return (
    <div className="min-w-0">
      <input type="hidden" name={name} value={value} />
      <div
        id={id}
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-required="true"
        data-date-chips=""
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:thin] motion-reduce:snap-none"
      >
        {chips.map((chip, index) => {
          const on = index === picked;
          return (
            <button
              key={chip.iso}
              ref={(el) => { chipsRef.current[index] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={chip.closed || undefined}
              aria-label={`${chip.label}${chip.closed ? ", closed" : ""}`}
              tabIndex={index === focusIndex ? 0 : -1}
              data-iso={chip.iso}
              onClick={() => move(index)}
              onKeyDown={(event) => onKey(event, index)}
              className={cn(
                "grid min-h-16 min-w-[4.25rem] shrink-0 snap-start place-items-center rounded-xl border px-2 py-2 text-center leading-tight transition-[border-color,background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:-translate-y-px hover:border-primary/60 motion-reduce:hover:translate-y-0",
                chip.closed && "cursor-not-allowed opacity-45 hover:translate-y-0 hover:border-border",
              )}
            >
              <span aria-hidden="true" className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">{chip.relative ?? chip.weekday}</span>
              <span aria-hidden="true" className="text-[19px] font-semibold tabular-nums">{chip.day}</span>
              <span aria-hidden="true" className="text-[11px] opacity-75">{chip.closed ? "Closed" : chip.month}</span>
            </button>
          );
        })}
        {count < MAX_DAYS ? (
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(MAX_DAYS, c + STEP))}
            className="grid min-h-16 min-w-[4.25rem] shrink-0 place-items-center rounded-xl border border-dashed border-border px-3 text-[13px] font-medium hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            More dates
          </button>
        ) : null}
      </div>
    </div>
  );
}
