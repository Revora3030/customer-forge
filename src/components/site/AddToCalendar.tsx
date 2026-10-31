import { useMemo } from "react";
import { CalendarPlus } from "lucide-react";
import {
  bookingCalendarEvent,
  bookingIcs,
  googleCalendarUrl,
  icsFileName,
  type BookingCalendarInput,
} from "@/lib/booking-ics";

/**
 * "Add to calendar" after a booking request: an .ics download (Apple Calendar,
 * Outlook, anything) and a Google Calendar link. Built in the browser; nothing
 * is fetched. Hidden when the slot can't be turned into an event.
 */
export function AddToCalendar(props: BookingCalendarInput) {
  const event = useMemo(() => bookingCalendarEvent(props), [props]);
  if (!event) return null;
  const download = async () => {
    const ics = await bookingIcs(event);
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFileName(props.localDate);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  return (
    <div className="mt-4" data-testid="add-to-calendar">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <button
          type="button"
          onClick={() => void download()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Add to calendar (.ics)
        </button>
        <a
          href={googleCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted"
        >
          Google Calendar
        </a>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">Not confirmed until {props.businessName.trim() || "the business"} replies.</p>
    </div>
  );
}
