import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { EmptyState, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCreateAppointment, useServices } from "@/lib/queries";
import {
  useDeleteQuote,
  useQuotes,
  useSaveQuote,
  useSetQuoteStatus,
} from "@/lib/service-catalog.hooks";
import {
  QUOTE_STATUSES,
  bookingFromQuote,
  canOfferBooking,
  editableLine,
  lineFromService,
  parseAmount,
  parseEditableLines,
  quoteTotal,
  type EditableQuoteLine,
  type QuoteLineDraft,
  type QuoteStatus,
} from "@/lib/service-catalog";
import { toast } from "@/lib/ui/notify";
import { currency, relative } from "@/lib/format";
import type { Tone } from "@/lib/domain";

export type QuotePrefill = {
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  lead_id: string | null;
  lines?: QuoteLineDraft[];
};

type Draft = Omit<QuotePrefill, "lines"> & {
  id?: string;
  notes: string;
  status: QuoteStatus;
  /** Price and quantity stay as typed until save (decimals included). */
  lines: EditableQuoteLine[];
};

/** Running total of lines being edited; anything not yet a number counts as 0. */
const draftTotal = (lines: EditableQuoteLine[]) =>
  quoteTotal(
    lines.map((line) => ({
      unit_price: parseAmount(line.unit_price) ?? 0,
      quantity: parseAmount(line.quantity) ?? 1,
    })),
  );

const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  sent: "info",
  accepted: "signal",
  declined: "danger",
};

const selectClass =
  "h-11 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm";

/**
 * Owner-written quotes. Every line can be picked from the services catalog —
 * it copies the service's name and price (or "starting at" price) and stays
 * editable. An accepted quote offers one click to put the job on the calendar,
 * sized by the quoted services' durations; nothing is booked automatically.
 */
export function OwnerQuotes({
  organizationId,
  businessName,
  prefill,
  onPrefillUsed,
  canDelete = false,
}: {
  organizationId: string | undefined;
  businessName: string | null;
  prefill?: QuotePrefill | null;
  onPrefillUsed?: () => void;
  /** Managers and owners only; the database refuses anyone else. */
  canDelete?: boolean;
}) {
  const quotes = useQuotes(organizationId);
  const services = useServices(organizationId);
  const save = useSaveQuote(organizationId);
  const setStatus = useSetQuoteStatus(organizationId);
  const remove = useDeleteQuote(organizationId);
  const createAppointment = useCreateAppointment(organizationId, businessName);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  /** Quotes booked in this session: the button goes at once, before the refetch. */
  const [bookedIds, setBookedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [pick, setPick] = useState("");

  const catalog = useMemo(
    () => (services.data ?? []).filter((service) => service.is_active),
    [services.data],
  );
  const rows = quotes.data ?? [];
  const booking = rows.find((quote) => quote.id === bookingId) ?? null;
  const bookingPlan = booking
    ? bookingFromQuote(booking, booking.quote_line_items, services.data ?? [])
    : null;

  useEffect(() => {
    if (!prefill) return;
    setDraft({ ...prefill, lines: (prefill.lines ?? []).map(editableLine), notes: "", status: "draft" });
    onPrefillUsed?.();
  }, [prefill, onPrefillUsed]);

  const blank = (): Draft => ({
    customer_name: "",
    customer_email: null,
    customer_phone: null,
    lead_id: null,
    notes: "",
    status: "draft",
    lines: [],
  });

  const updateLine = (index: number, patch: Partial<EditableQuoteLine>) =>
    setDraft((current) =>
      current
        ? { ...current, lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }
        : current,
    );

  return (
    <Panel className="p-5">
      <SectionHeading
        eyebrow="Quotes"
        title="Quotes you send"
        description="Pick services from your catalog; each line copies its name and price, and you can change either."
        action={
          <Button variant="signal" size="sm" className="min-h-11" onClick={() => setDraft(blank())}>
            <Plus className="size-4" /> New quote
          </Button>
        }
      />

      <div className="mt-4">
        {quotes.isError ? (
          <QueryErrorNotice
            title="Your quotes couldn't be loaded."
            retry={quotes.refetch}
            retrying={quotes.isFetching}
          />
        ) : quotes.isLoading ? (
          <LoadingRows rows={2} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No quotes yet"
            description="Write a quote from your services, or turn a website quote request below into one."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((quote) => (
              <li key={quote.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{quote.customer_name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {quote.quote_line_items.map((line) => line.name).join(", ")} ·{" "}
                      {relative(quote.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={STATUS_TONE[quote.status] ?? "neutral"}>
                      {QUOTE_STATUSES.find((s) => s.value === quote.status)?.label ?? quote.status}
                    </Pill>
                    <span className="tnum text-[13px] font-semibold text-primary">
                      {currency(quoteTotal(quote.quote_line_items))}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Status for ${quote.customer_name}'s quote`}
                    value={quote.status}
                    onChange={(e) =>
                      setStatus.mutate({ id: quote.id, status: e.target.value as QuoteStatus })
                    }
                    className="h-11 cursor-pointer rounded-md border border-input bg-background px-2 text-[12px]"
                  >
                    {QUOTE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {canOfferBooking(quote) && !bookedIds.has(quote.id) ? (
                    <Button
                      variant="signal"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setBookingId(quote.id)}
                    >
                      <CalendarPlus className="size-4" /> Book this job
                    </Button>
                  ) : quote.appointment_id || bookedIds.has(quote.id) ? (
                    <Link
                      to="/app/calendar"
                      className="inline-flex min-h-11 items-center text-[12px] text-primary hover:underline"
                    >
                      Booked — view calendar
                    </Link>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() =>
                      setDraft({
                        id: quote.id,
                        customer_name: quote.customer_name,
                        customer_email: quote.customer_email,
                        customer_phone: quote.customer_phone,
                        lead_id: quote.lead_id,
                        notes: quote.notes ?? "",
                        status: quote.status as QuoteStatus,
                        lines: quote.quote_line_items.map((line) => ({
                          service_id: line.service_id,
                          name: line.name,
                          unit_price: String(Number(line.unit_price)),
                          quantity: String(Number(line.quantity)),
                        })),
                      })
                    }
                  >
                    Edit
                  </Button>
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11"
                      aria-label={`Delete ${quote.customer_name}'s quote`}
                      disabled={remove.isPending}
                      onClick={() => setDeleting({ id: quote.id, name: quote.customer_name })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quote editor */}
      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {draft ? (
            <>
              <DialogHeader>
                <DialogTitle>{draft.id ? "Edit quote" : "New quote"}</DialogTitle>
                <DialogDescription>
                  Prices come from your services. Change any line for this customer.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = parseEditableLines(draft.lines);
                  if (!parsed.ok) {
                    toast.error(parsed.error);
                    return;
                  }
                  save.mutate(
                    { ...draft, lines: parsed.lines },
                    {
                      onSuccess: (id) => {
                        // Keep the saved id so any further save updates this quote.
                        setDraft((current) => (current ? { ...current, id } : current));
                        setDraft(null);
                      },
                    },
                  );
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="oq-name">Customer name</Label>
                  <Input
                    id="oq-name"
                    className="h-11"
                    required
                    value={draft.customer_name}
                    onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="oq-email">Email</Label>
                    <Input
                      id="oq-email"
                      type="email"
                      className="h-11"
                      value={draft.customer_email ?? ""}
                      onChange={(e) => setDraft({ ...draft, customer_email: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oq-phone">Phone</Label>
                    <Input
                      id="oq-phone"
                      inputMode="tel"
                      className="h-11"
                      value={draft.customer_phone ?? ""}
                      onChange={(e) => setDraft({ ...draft, customer_phone: e.target.value || null })}
                    />
                  </div>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-[13px] font-medium">Line items</legend>
                  {services.isError ? (
                    <QueryErrorNotice
                      title="Your services couldn't be loaded."
                      retry={services.refetch}
                      retrying={services.isFetching}
                    />
                  ) : catalog.length === 0 && !services.isLoading ? (
                    <p className="text-[12px] text-muted-foreground">
                      You have no active services yet.{" "}
                      <Link to="/app/services" className="text-primary hover:underline">
                        Add your services
                      </Link>{" "}
                      to pick them here, or add a custom line.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <select
                        aria-label="Add a service to this quote"
                        value={pick}
                        onChange={(e) => setPick(e.target.value)}
                        className={`${selectClass} min-w-0 flex-1`}
                      >
                        <option value="">Choose a service…</option>
                        {catalog.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                            {service.price !== null
                              ? ` · ${currency(Number(service.price))}`
                              : service.starting_price !== null
                                ? ` · from ${currency(Number(service.starting_price))}`
                                : " · no price set"}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={!pick}
                        onClick={() => {
                          const service = catalog.find((s) => s.id === pick);
                          if (!service) return;
                          setDraft({
                            ...draft,
                            lines: [...draft.lines, editableLine(lineFromService(service))],
                          });
                          setPick("");
                        }}
                      >
                        <Plus className="size-4" /> Add service
                      </Button>
                    </div>
                  )}

                  <ul className="space-y-2">
                    {draft.lines.map((line, index) => (
                      <li key={index} className="panel-inset grid gap-2 p-3 sm:grid-cols-[1fr_7rem_5rem_auto] sm:items-end">
                        <div className="space-y-1">
                          <Label htmlFor={`oq-line-${index}`} className="text-[11px]">
                            {line.service_id ? "Service" : "Custom line"}
                          </Label>
                          <Input
                            id={`oq-line-${index}`}
                            className="h-11"
                            value={line.name}
                            onChange={(e) => updateLine(index, { name: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:contents">
                          <div className="space-y-1">
                            <Label htmlFor={`oq-price-${index}`} className="text-[11px]">
                              {line.from_starting_price ? "Price (from)" : "Price ($)"}
                            </Label>
                            <Input
                              id={`oq-price-${index}`}
                              inputMode="decimal"
                              className="h-11"
                              value={line.unit_price}
                              aria-invalid={!Number.isFinite(parseAmount(line.unit_price) ?? 0)}
                              onChange={(e) =>
                                updateLine(index, {
                                  unit_price: e.target.value,
                                  from_starting_price: false,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`oq-qty-${index}`} className="text-[11px]">
                              Qty
                            </Label>
                            <Input
                              id={`oq-qty-${index}`}
                              inputMode="decimal"
                              className="h-11"
                              value={line.quantity}
                              aria-invalid={!Number.isFinite(parseAmount(line.quantity) ?? 1)}
                              onChange={(e) => updateLine(index, { quantity: e.target.value })}
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="min-h-11 min-w-11 justify-self-end"
                          aria-label={`Remove ${line.name || "line"}`}
                          onClick={() =>
                            setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          lines: [...draft.lines, { service_id: null, name: "", unit_price: "0", quantity: "1" }],
                        })
                      }
                    >
                      <Plus className="size-4" /> Custom line
                    </Button>
                    <p className="tnum text-[14px] font-semibold">
                      Total {currency(draftTotal(draft.lines))}
                    </p>
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="oq-status">Status</Label>
                    <select
                      id="oq-status"
                      value={draft.status}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value as QuoteStatus })}
                      className={selectClass}
                    >
                      {QUOTE_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oq-notes">Notes</Label>
                    <Textarea
                      id="oq-notes"
                      rows={2}
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    variant="signal"
                    className="min-h-11"
                    disabled={save.isPending || draft.lines.length === 0}
                  >
                    Save quote
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* One-click booking from an accepted quote */}
      <Dialog open={!!booking} onOpenChange={(open) => !open && setBookingId(null)}>
        <DialogContent>
          {booking && bookingPlan ? (
            <>
              <DialogHeader>
                <DialogTitle>Book {booking.customer_name}</DialogTitle>
                <DialogDescription>
                  {bookingPlan.durationFromServices
                    ? `${bookingPlan.durationMinutes} minutes, from the quoted services.`
                    : `None of the quoted lines is a catalog service with a length, so this uses ${bookingPlan.durationMinutes} minutes.`}
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const quoteId = booking.id;
                  // One transaction books the job and links the quote; a quote
                  // that was booked meanwhile is refused ("already booked").
                  createAppointment.mutate(
                    {
                      name: bookingPlan.name,
                      email: bookingPlan.email,
                      phone: bookingPlan.phone,
                      leadId: bookingPlan.leadId,
                      serviceId: bookingPlan.serviceId,
                      durationMinutes: bookingPlan.durationMinutes,
                      estimatedValue: bookingPlan.estimatedValue,
                      startsAt: `${String(form.get("date"))}T${String(form.get("time"))}`,
                      notes: `From accepted quote (${currency(bookingPlan.estimatedValue)}).`,
                      quoteId,
                    },
                    {
                      onSuccess: () => {
                        setBookedIds((current) => new Set(current).add(quoteId));
                        setBookingId(null);
                      },
                      onError: () => setBookingId(null),
                    },
                  );
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="oqb-date">Date</Label>
                    <Input id="oqb-date" name="date" type="date" className="h-11" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="oqb-time">Time</Label>
                    <Input id="oqb-time" name="time" type="time" className="h-11" required defaultValue="09:00" />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    variant="signal"
                    className="min-h-11"
                    disabled={createAppointment.isPending}
                  >
                    Add to calendar
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (managers and owners only) */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}'s quote?</AlertDialogTitle>
            <AlertDialogDescription>
              The quote and its lines are removed for good. A booking made from it stays on the
              calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Delete quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
