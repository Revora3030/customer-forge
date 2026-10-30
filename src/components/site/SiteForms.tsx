import { checkBookingTime } from "@/lib/booking-hours";
import { RollingNumber } from "@/components/site/CountUp";
import { SiteSelect } from "@/components/site/SiteSelect";
import { DateChips } from "@/components/site/DateChips";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitPublicLead, trackPublicEvent, type PublicSite } from "@/lib/public-site.functions";
import { readAttribution } from "@/lib/attribution";
import { visitToken } from "@/lib/performance/web-vitals";
import { currency } from "@/lib/format";
import { estimateQuote, isUsableQuote } from "@/lib/quote-estimate";
import { cn } from "@/lib/utils";
import { useStepScroll } from "@/lib/use-step-scroll";
import { DirectContact } from "@/components/site/ContactDetails";
import { PrintableEstimate } from "@/components/site/PrintableEstimate";
import { AltchaField, altchaPayload } from "@/components/site/AltchaField";
import { AddToCalendar } from "@/components/site/AddToCalendar";
import { useHolidayClosures } from "@/components/site/use-holiday-closures";
import { widgetPresentationStyle } from "@/components/site/contact-details-utils";
import type { WidgetPresentation } from "@/lib/builder/composition-tree";
import { usePreviewMode } from "@/components/site/preview-mode-context";
import { shouldTrackFormEvent } from "@/lib/site-event-once";
import { mergeSplitServices } from "@/lib/builder/intake-sanitize";
import { SiteNotLiveNotice } from "@/components/site/SiteNotLiveNotice";

type Site = NonNullable<PublicSite>;

/** The visit's own opaque token, or "" during SSR / when storage is blocked.
 * The server validator drops anything that isn't a well-formed token. */
function currentSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    return visitToken();
  } catch {
    return "";
  }
}

function useTracker(slug: string) {
  const track = useServerFn(trackPublicEvent);
  const preview = usePreviewMode();
  const seen = useRef(new Set<string>());
  return (eventType: string) => {
    if (!shouldTrackFormEvent(seen.current, eventType, preview)) return;
    void track({
      data: {
        slug,
        eventType,
        sessionId: currentSessionId(),
        ...(typeof window === "undefined" ? {} : { path: window.location.pathname }),
        device: typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop",
      },
    }).catch(() => undefined);
  };
}

function Success({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel flex flex-col items-center px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
        <Check className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-display text-[17px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/**
 * Invisible to real visitors — hidden from sighted users, keyboard tab order
 * and screen readers alike — but still a normal input in the DOM, so a script
 * that blindly fills every field on the page fills this one too. A human
 * never can, so any value here means the submission is bogus. Paired with a
 * matching check in submitPublicLead's validator (see public-site.functions.ts).
 */
function Honeypot() {
  return (
    <input
      type="text"
      name="company_website"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
    />
  );
}

/**
 * The business can only reply through an email or a phone number. Checked in
 * the browser before sending so the visitor is told what to fix right away
 * (the server enforces the same rule).
 */
function contactProblem(email: string, phone: string): string | null {
  if (!email && !phone) return "Add an email or phone number so the business can reach you.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email address doesn't look right.";
  if (phone && phone.replace(/\D/g, "").length < 7) return "That phone number looks too short.";
  return null;
}

/**
 * Sends a lead, or SIMULATES sending it in the owner's draft preview: the form
 * runs its real validation and shows its real success screen, but no lead,
 * booking, CRM webhook or email is created. Owners can test every widget
 * without polluting their own pipeline.
 */
/**
 * The database refuses submissions for a site that isn't published yet (the
 * ORG_NOT_PUBLIC gate), so on a shared preview of an unpublished draft the
 * form is replaced by a plain "not live yet" note rather than letting a
 * visitor type out a request that cannot be saved. The owner's own builder
 * preview keeps the working, simulated form.
 */
export function formsBlockedForSite(site: Pick<Site, "acceptsSubmissions">, preview: boolean): boolean {
  return !preview && site.acceptsSubmissions === false;
}

function NotLiveGate({ site, children }: { site: Site; children: ReactNode }) {
  const preview = usePreviewMode();
  if (formsBlockedForSite(site, preview)) return <SiteNotLiveNotice organizationId={site.org.id} />;
  return <>{children}</>;
}

function useLeadSubmit(): typeof submitPublicLead {
  const send = useServerFn(submitPublicLead);
  const preview = usePreviewMode();
  if (!preview) return send as typeof submitPublicLead;
  const simulated = async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    toast.success("Preview only — this test was not sent to your leads.");
    return { ok: true as const, simulated: true as const };
  };
  return simulated as unknown as typeof submitPublicLead;
}

export function QuoteCalculator(props: { site: Site; presentation?: WidgetPresentation }) {
  return (
    <NotLiveGate site={props.site}>
      <QuoteCalculatorLive {...props} />
    </NotLiveGate>
  );
}

function QuoteCalculatorLive({ site, presentation }: { site: Site; presentation?: WidgetPresentation }) {
  const uid = useId();
  const fid = (key: string) => `q-${key}-${uid}`;
  const quote = site.quote;
  const submit = useLeadSubmit();
  const track = useTracker(site.org.slug);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<"questions" | "contact">("questions");
  const stepRef = useStepScroll<HTMLDivElement>(step);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

  // A form with no choosable options can never produce an estimate: show nothing rather than a dead widget.
  if (!quote || !isUsableQuote(quote.questions)) return null;
  // Only questions with options can be answered (the server ignores the rest too).
  const questions = quote.questions.filter((question) => question.options.length > 0);
  const selected = questions.map((question) => {
    const optionId = answers[question.id];
    const option = question.options.find((o) => o.id === optionId);
    return { question, option };
  });
  const addons = quote.addons ?? [];
  const chosenAddons = addons.filter((a) => picked.includes(a.id));
  // Same arithmetic as the server recompute (quote-estimate.ts).
  const { min, max } = estimateQuote({
    base: quote.form.base_price,
    min: quote.form.min_price,
    max: quote.form.max_price,
    picks: selected.flatMap(({ option }) => (option ? [{ modifier: option.price_modifier, type: option.modifier_type }] : [])),
    addons: chosenAddons.map((a) => a.price),
  });
  const answered = selected.filter((s) => s.option).length;
  const complete = answered === questions.length && questions.length > 0;
  // A floor the owner set is a fact; a partial total is not (later answers can multiply it).
  const floor = Number(quote.form.min_price ?? 0);
  const fromPrice = Number.isFinite(floor) && floor > 0 ? floor : null;

  if (done) {
    return (
      <div ref={stepRef}>
        <Success
          title={presentation?.successTitle ?? "Request received"}
          body={
            presentation?.successBody ??
            (confirmationEmail
              ? "Thank you! Your request has been received. Check your email for confirmation."
              : "Thank you! Your request has been received. We'll get back to you shortly.")
          }
        />
        {complete ? (
          <PrintableEstimate
            businessName={site.org.name}
            title={presentation?.title ?? quote.form.name}
            min={min}
            max={max}
            lines={selected.flatMap(({ question, option }) => (option ? [{ question: question.label, answer: option.label }] : []))}
            extras={chosenAddons.map((addon) => ({ label: addon.label, price: Number(addon.price) }))}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div ref={stepRef} className="panel overflow-hidden" style={widgetPresentationStyle(presentation)}>
      <div className="border-b border-border px-5 py-4">
        <p className="eyebrow">{presentation?.eyebrow ?? "Instant estimate"}</p>
        <h3 className="mt-1 font-display text-[19px] font-semibold">{presentation?.title ?? quote.form.name}</h3>
        {presentation?.description ? <p className="mt-2 text-[14px] text-muted-foreground">{presentation.description}</p> : null}
      </div>

      {step === "questions" ? (
        <div className="space-y-6 px-5 py-5">
          {questions.map((question) => (
            <fieldset key={question.id}>
              <legend className="text-[14px] font-medium">{question.label}</legend>
              {question.helper_text ? (
                <p className="mt-1 text-[14px] text-muted-foreground">{question.helper_text}</p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const active = answers[question.id] === option.id;
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        track("quote_start");
                        setAnswers((prev) => ({ ...prev, [question.id]: option.id }));
                      }}
                      aria-pressed={active}
                      className={cn(
                        "min-h-11 justify-start rounded-md border px-3.5 py-2.5 text-left text-[14px] transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:bg-elevated",
                      )}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {addons.length ? (
            <fieldset className="border-t border-border pt-4">
              <legend className="text-[14px] font-medium">{presentation?.extraLabel ?? "Optional extras"}</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {addons.map((addon) => {
                  const active = picked.includes(addon.id);
                  return (
                    <Button
                      key={addon.id}
                      type="button"
                      variant="outline"
                      aria-pressed={active}
                      onClick={() =>
                        setPicked((prev) =>
                          prev.includes(addon.id)
                            ? prev.filter((id) => id !== addon.id)
                            : [...prev, addon.id],
                        )
                      }
                      className={cn(
                        "min-h-11 flex-col items-stretch rounded-md border px-3.5 py-2.5 text-left text-[14px] transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:bg-elevated",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span>{addon.label}</span>
                        <span className="tnum text-primary">+{currency(Number(addon.price))}</span>
                      </span>
                      {addon.description ? (
                        <span className="mt-1 block text-[14px] text-muted-foreground">
                          {addon.description}
                        </span>
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              <p className="eyebrow">{presentation?.estimateLabel ?? "Estimated range"}</p>
              {/* Before the visitor has chosen, an empty dash reads as broken.
                  Say what is needed instead — never show an invented number. */}
              {complete ? (
                <p role="status" aria-live="polite" className="tnum mt-1 font-display text-[24px] font-semibold text-primary">
                  <RollingNumber value={min} format={currency} /> – <RollingNumber value={max} format={currency} />
                </p>
              ) : (
                <>
                  <p className="mt-1 text-[14px] text-muted-foreground">
                    {presentation?.optionPrompt ?? "Choose your options to see your price"}
                  </p>
                  <p className="tnum mt-1 text-[14px] text-muted-foreground" aria-live="polite">
                    {answered} of {questions.length} answered
                    {fromPrice !== null ? <> · From {currency(fromPrice)}</> : null}
                  </p>
                </>
              )}
            </div>
            <Button
              variant="signal"
              className="min-h-11 sm:min-h-11"
              disabled={!complete}
              onClick={() => {
                track("quote_complete");
                setStep("contact");
              }}
            >
              {presentation?.actionLabel ?? "Continue"}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4 px-5 py-5 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
            const form = new FormData(e.currentTarget);
            const email = String(form.get("email") ?? "").trim();
            const problem = contactProblem(email, String(form.get("phone") ?? "").trim());
            if (problem) {
              toast.error(problem);
              return;
            }
            setConfirmationEmail(email);
            setPending(true);
            submit({
              data: {
                slug: site.org.slug,
                kind: "quote",
                name: String(form.get("name") ?? ""),
                email,
                phone: String(form.get("phone") ?? ""),
                message: String(form.get("message") ?? ""),
                companyWebsite: String(form.get("company_website") ?? ""),
                altcha: altchaPayload(form),
                sessionId: currentSessionId(),
                serviceInterest: quote.form.name,
                estimatedValue: Math.round((min + max) / 2),
                ...(() => {
                  const attribution = readAttribution();
                  return { source: attribution.source, campaign: attribution.campaign };
                })(),
                quote: {
                  formId: quote.form.id,
                  answers: [
                    ...selected.flatMap((s) => s.option ? [{
                        question: s.question.label,
                        answer: s.option.label,
                        modifier: s.option.price_modifier,
                      }] : []),
                    ...chosenAddons.map((a) => ({
                      question: "Add-on",
                      answer: a.label,
                      modifier: Number(a.price),
                    })),
                  ],
                  min,
                  max,
                },
              },
            })
              .then(() => setDone(true))
              .catch((error: Error) => toast.error(friendlyError(error)))
              .finally(() => setPending(false));
          }}
        >
          <Honeypot />
          <AltchaField />
          <p className="tnum text-[14px] text-muted-foreground">
            Your estimate:{" "}
            <span className="font-semibold text-primary">
              {currency(min)} – {currency(max)}
            </span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={fid("name")}>{presentation?.fieldLabels?.name ?? "Your name"}</Label>
            <Input id={fid("name")} name="name" required autoComplete="name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={fid("phone")}>{presentation?.fieldLabels?.phone ?? "Phone"}</Label>
              <Input id={fid("phone")} name="phone" type="tel" autoComplete="tel" inputMode="tel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fid("email")}>{presentation?.fieldLabels?.email ?? "Email"}</Label>
              <Input id={fid("email")} name="email" type="email" autoComplete="email" inputMode="email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fid("message")}>{presentation?.fieldLabels?.details ?? "Anything we should know?"}</Label>
            <Textarea id={fid("message")} name="message" rows={3} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="signal" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} {presentation?.submitLabel ?? "Send request"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("questions")}>
              {presentation?.backLabel ?? "Back"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function BookingForm(props: { site: Site; presentation?: WidgetPresentation }) {
  return (
    <NotLiveGate site={props.site}>
      <BookingFormLive {...props} />
    </NotLiveGate>
  );
}

function BookingFormLive({ site, presentation }: { site: Site; presentation?: WidgetPresentation }) {
  const uid = useId();
  const fid = (key: string) => `b-${key}-${uid}`;
  const submit = useLeadSubmit();
  const track = useTracker(site.org.slug);
  const bookable = mergeSplitServices(site.services).filter((s) => s.bookable);
  // `bookable` is a brand-new array on every render, so it cannot be an effect
  // dependency: the effect would re-run on every keystroke and drag the visitor
  // back to the service named in the address bar. This joined id list is the
  // stable identity of the same list, and only changes when the services do.
  const bookableIds = bookable.map((s) => s.id).join("|");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [booked, setBooked] = useState<{ localDate: string; localTime: string; durationMinutes: number; serviceName: string | null } | null>(null);
  const [serviceId, setServiceId] = useState(bookable[0]?.id ?? "");
  const doneRef = useStepScroll<HTMLDivElement>(done);
  // "Today" is the visitor's own date, so it is only known in the browser.
  // Reading it during the server render made the first paint disagree with the
  // browser whenever the two were on different calendar days.
  const [today, setToday] = useState("");
  const [pickedDate, setPickedDate] = useState("");
  const holidays = useHolidayClosures((site.profile as { hours?: unknown } | null)?.hours ?? null);
  const [pickedTime, setPickedTime] = useState("09:00");
  useEffect(() => {
    const local = new Date();
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    setToday(local.toISOString().slice(0, 10));
  }, []);
  useEffect(() => {
    // Read the list from the stable key rather than the render's array, so this
    // effect only ever runs when the bookable services genuinely change.
    const known = new Set(bookableIds.split("|").filter(Boolean));
    const apply = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#book")) return;
      const id = decodeURIComponent(hash.slice("#book-".length));
      if (id && known.has(id)) setServiceId(id);
      const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("book")?.scrollIntoView({ behavior: motion ? "auto" : "smooth", block: "start" });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [bookableIds]);

  if (done) {
    return (
      <div ref={doneRef}>
        <Success
          title={presentation?.successTitle ?? "Request received"}
          body={
            presentation?.successBody ??
            (confirmationEmail
              ? "Thank you! Your request has been received. Check your email for confirmation."
              : "Thank you! Your request has been received. We'll get back to you shortly.")
          }
        />
        {booked ? (
          <AddToCalendar
            {...booked}
            businessName={site.org.name}
            phone={(site.profile as { phone?: string | null } | null)?.phone ?? null}
          />
        ) : null}
        <div className="mt-4">
          <DirectContact
            profile={site.profile}
            businessName={site.org.name}
            label={presentation?.contactLabel ?? `Need it sooner? Reach ${site.org.name} directly`}
            {...(presentation ? { presentation } : {})}
          />
        </div>
      </div>
    );
  }

  const service = bookable.find((s) => s.id === serviceId);
  // The same opening-hours rule the server enforces, shown while choosing, so
  // a customer is told before they press send rather than after.
  const hoursProblem =
    bookable.length && pickedDate && pickedTime
      ? (() => {
          const verdict = checkBookingTime({
            hours: (site.profile as { hours?: unknown } | null)?.hours ?? null,
            localDate: pickedDate,
            localTime: pickedTime,
            durationMinutes: service?.duration_minutes ?? 60,
            holidays,
          });
          return verdict.ok ? null : verdict.reason;
        })()
      : null;

  return (
    <form
      id="book"
      className="panel space-y-4 p-5 scroll-mt-24 text-left"
      style={widgetPresentationStyle(presentation)}
      onFocus={() => track("booking_start")}
      onSubmit={(e) => {
        e.preventDefault();
        if (hoursProblem) {
          toast.error(hoursProblem);
          return;
        }
        const form = new FormData(e.currentTarget);
        const date = String(form.get("date") ?? "");
        const time = String(form.get("time") ?? "");
        // The date chips submit through a hidden input, which the browser's
        // own "required" check cannot see, so ask here.
        if (bookable.length && !date) {
          toast.error("Choose a preferred date.");
          document.getElementById(fid("date"))?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
          return;
        }
        const email = String(form.get("email") ?? "").trim();
        const problem = contactProblem(email, String(form.get("phone") ?? "").trim());
        if (problem) {
          toast.error(problem);
          return;
        }
        setConfirmationEmail(email);
        setBooked(
          bookable.length && date && time
            ? {
                localDate: date,
                localTime: time,
                durationMinutes: service?.duration_minutes ?? 60,
                serviceName: service?.name ?? null,
              }
            : null,
        );
        setPending(true);
        submit({
          data: {
            slug: site.org.slug,
            kind: bookable.length ? "booking" : "contact",
            name: String(form.get("name") ?? ""),
            email,
            phone: String(form.get("phone") ?? ""),
            message: String(form.get("message") ?? ""),
            city: String(form.get("city") ?? ""),
            companyWebsite: String(form.get("company_website") ?? ""),
            altcha: altchaPayload(form),
            sessionId: currentSessionId(),
            serviceId: serviceId || null,
            serviceInterest: service?.name ?? null,
            estimatedValue: Number(service?.price ?? 0),
            ...(() => {
              const attribution = readAttribution();
              return { source: attribution.source, campaign: attribution.campaign };
            })(),
            booking:
              bookable.length && date && time
                ? {
                    startsAt: new Date(`${date}T${time}`).toISOString(),
                    durationMinutes: service?.duration_minutes ?? 60,
                    localDate: date,
                    localTime: time,
                  }
                : null,
          },
        })
          .then(() => setDone(true))
          .catch((error: Error) => toast.error(friendlyError(error)))
          .finally(() => setPending(false));
      }}
    >
      <div>
        <p className="eyebrow">{presentation?.eyebrow ?? "Appointment request"}</p>
        <h3 className="mt-1 font-display text-[19px] font-semibold">{presentation?.title ?? "Request your appointment"}</h3>
        {presentation?.description ? <p className="mt-2 text-[14px] text-muted-foreground">{presentation.description}</p> : null}
      </div>

      <Honeypot />
      <AltchaField />
      <DirectContact profile={site.profile} businessName={site.org.name} {...(presentation ? { presentation } : {})} />

      {bookable.length ? (
        <div className="space-y-1.5">
          <Label id={fid("service-label")} htmlFor={fid("service")}>{presentation?.fieldLabels?.service ?? "Service"}</Label>
          <SiteSelect
            id={fid("service")}
            labelledBy={fid("service-label")}
            value={serviceId}
            onChange={setServiceId}
            options={bookable.map((s) => ({ value: s.id, label: `${s.name}${s.price ? ` — ${currency(Number(s.price))}` : ""}` }))}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={fid("name")}>{presentation?.fieldLabels?.name ?? "Your name"}</Label>
          <Input id={fid("name")} name="name" required autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fid("phone")}>{presentation?.fieldLabels?.phone ?? "Phone"}</Label>
          <Input id={fid("phone")} name="phone" type="tel" autoComplete="tel" inputMode="tel" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fid("email")}>{presentation?.fieldLabels?.email ?? "Email"}</Label>
          <Input id={fid("email")} name="email" type="email" autoComplete="email" inputMode="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fid("city")}>{presentation?.fieldLabels?.location ?? "City / address"}</Label>
          <Input id={fid("city")} name="city" />
        </div>
        {bookable.length ? (
          <>
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label id={fid("date-label")} htmlFor={fid("date")}>{presentation?.fieldLabels?.date ?? "Preferred date"}</Label>
              <DateChips
                id={fid("date")}
                name="date"
                value={pickedDate}
                onChange={setPickedDate}
                hours={(site.profile as { hours?: unknown } | null)?.hours ?? null}
                holidays={holidays}
                labelledBy={fid("date-label")}
                describedBy={hoursProblem ? fid("hours-note") : undefined}
                fallback={
                  <Input
                    id={fid("date")}
                    name="date"
                    type="date"
                    // iOS Safari gives native date/time inputs an intrinsic min-width
                    // that pushed them past the card edge on phones.
                    className="w-full min-w-0 max-w-full appearance-none"
                    min={today || undefined}
                    required
                    value={pickedDate}
                    onChange={(event) => setPickedDate(event.target.value)}
                    aria-describedby={hoursProblem ? fid("hours-note") : undefined}
                  />
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fid("time")}>{presentation?.fieldLabels?.time ?? "Preferred time (your local time)"}</Label>
              <Input
                id={fid("time")}
                name="time"
                type="time"
                // iOS Safari gives native date/time inputs an intrinsic min-width
                // that pushed them past the card edge on phones.
                className="w-full min-w-0 max-w-full appearance-none"
                required
                value={pickedTime}
                onChange={(event) => setPickedTime(event.target.value)}
                aria-describedby={hoursProblem ? fid("hours-note") : undefined}
              />
            </div>
            {hoursProblem ? (
              <p id={fid("hours-note")} role="alert" className="text-[14px] font-medium text-destructive sm:col-span-2">
                {hoursProblem}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {bookable.length ? (
        <p className="text-[14px] text-muted-foreground">
          {/* Real limitation, not just copy: nothing in this codebase stores the
              business's own timezone, so a time typed here is captured in the
              visitor's own device timezone. If a customer books while set to a
              different timezone than the business operates in, the saved
              appointment time will be genuinely off — not a display glitch, the
              stored time itself. This line makes that visible instead of silent,
              and the business gets a chance to catch and correct it before it's
              confirmed. The real fix needs a stored business timezone (a schema
              column + settings field), which isn't something to guess at. */}
          Times are shown in your device's local time — we'll confirm your exact appointment time
          before it's booked.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={fid("message")}>{presentation?.fieldLabels?.details ?? "Details"}</Label>
        <Textarea id={fid("message")} name="message" rows={3} />
      </div>

      <Button type="submit" variant="signal" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null} {presentation?.actionLabel ?? "Request appointment"}
      </Button>
      <p className="text-[14px] text-muted-foreground">
        No payment now — you'll get a confirmation before anything is charged.
      </p>
    </form>
  );
}

/**
 * The general enquiry form: name, a way to reply (phone or email), and a
 * message. Every site has one so a visitor can always reach the business,
 * even when no service is bookable and no quote calculator exists. It uses
 * the same protected submit as booking and quotes (server validation, rate
 * limit, honeypot, owner alert, CRM webhook) and is simulated in previews.
 */
export function EnquiryForm(props: { site: Site; presentation?: WidgetPresentation }) {
  return (
    <NotLiveGate site={props.site}>
      <EnquiryFormLive {...props} />
    </NotLiveGate>
  );
}

function EnquiryFormLive({ site, presentation }: { site: Site; presentation?: WidgetPresentation }) {
  const uid = useId();
  const fid = (key: string) => `e-${key}-${uid}`;
  const submit = useLeadSubmit();
  const track = useTracker(site.org.slug);
  const services = (site.services ?? []).filter((s) => s.name);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const doneRef = useStepScroll<HTMLDivElement>(done);

  if (done) {
    return (
      <div ref={doneRef} id="contact-form" role="status" aria-live="polite">
        <Success
          title={presentation?.successTitle ?? "Message sent"}
          body={
            presentation?.successBody ??
            (confirmationEmail
              ? `Thanks — ${site.org.name} has your message. A copy is on its way to your inbox.`
              : `Thanks — ${site.org.name} has your message and will reply using the details you gave.`)
          }
        />
      </div>
    );
  }

  return (
    <form
      id="contact-form"
      className="panel space-y-4 p-5 scroll-mt-24 text-left"
      style={widgetPresentationStyle(presentation)}
      noValidate
      aria-describedby={problem ? fid("problem") : undefined}
      onFocus={() => track("enquiry_start")}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const form = new FormData(e.currentTarget);
        const name = String(form.get("name") ?? "").trim();
        const email = String(form.get("email") ?? "").trim();
        const phone = String(form.get("phone") ?? "").trim();
        const message = String(form.get("message") ?? "").trim();
        const found =
          name.length < 2 ? "Please enter your name." : contactProblem(email, phone) ?? (message.length < 2 ? "Tell us a little about what you need." : null);
        setProblem(found);
        if (found) return;
        const serviceName = String(form.get("service") ?? "");
        const service = services.find((s) => s.name === serviceName);
        setConfirmationEmail(email);
        setPending(true);
        submit({
          data: {
            slug: site.org.slug,
            kind: "inquiry",
            name,
            email,
            phone,
            message,
            city: String(form.get("city") ?? ""),
            companyWebsite: String(form.get("company_website") ?? ""),
            altcha: altchaPayload(form),
            sessionId: currentSessionId(),
            serviceId: service?.id ?? null,
            serviceInterest: service?.name ?? null,
            estimatedValue: Number(service?.price ?? 0),
            ...(() => {
              const attribution = readAttribution();
              return { source: attribution.source, campaign: attribution.campaign };
            })(),
          },
        })
          .then(() => {
            track("enquiry_submitted");
            setDone(true);
          })
          .catch((error: Error) => setProblem(friendlyError(error)))
          .finally(() => setPending(false));
      }}
    >
      <div>
        <p className="eyebrow">{presentation?.eyebrow ?? "Send a message"}</p>
        <h3 className="mt-1 font-display text-[19px] font-semibold">{presentation?.title ?? `Contact ${site.org.name}`}</h3>
        {presentation?.description ? <p className="mt-2 text-[14px] text-muted-foreground">{presentation.description}</p> : null}
      </div>

      <Honeypot />
      <AltchaField />

      {services.length > 1 ? (
        <div className="space-y-1.5">
          <Label id={fid("service-label")} htmlFor={fid("service")}>{presentation?.fieldLabels?.service ?? "What can we help with? (optional)"}</Label>
          <SiteSelect
            id={fid("service")}
            name="service"
            labelledBy={fid("service-label")}
            defaultValue=""
            options={[{ value: "", label: "Not sure yet" }, ...services.map((s) => ({ value: s.name, label: s.name }))]}
          />
        </div>
      ) : services.length === 1 ? (
        <input type="hidden" name="service" value={services[0]!.name} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={fid("name")}>
            {presentation?.fieldLabels?.name ?? "Your name"} <span aria-hidden="true">*</span>
          </Label>
          <Input id={fid("name")} name="name" required aria-required="true" autoComplete="name" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fid("phone")}>{presentation?.fieldLabels?.phone ?? "Phone"}</Label>
          <Input id={fid("phone")} name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={40} aria-describedby={fid("reach")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fid("email")}>{presentation?.fieldLabels?.email ?? "Email"}</Label>
          <Input id={fid("email")} name="email" type="email" autoComplete="email" inputMode="email" maxLength={160} aria-describedby={fid("reach")} />
        </div>
        <p id={fid("reach")} className="-mt-2 text-[13px] text-muted-foreground sm:col-span-2">
          Phone or email — at least one, so we can reply.
        </p>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={fid("city")}>{presentation?.fieldLabels?.location ?? "Your town or ZIP (optional)"}</Label>
          <Input id={fid("city")} name="city" autoComplete="address-level2" maxLength={120} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={fid("message")}>
          {presentation?.fieldLabels?.details ?? "How can we help?"} <span aria-hidden="true">*</span>
        </Label>
        <Textarea id={fid("message")} name="message" rows={4} required aria-required="true" maxLength={2000} />
      </div>

      {problem ? (
        <p id={fid("problem")} role="alert" className="text-[14px] font-medium text-destructive">
          {problem}
        </p>
      ) : null}

      <Button type="submit" variant="signal" disabled={pending} aria-busy={pending} className="min-h-11 w-full sm:w-auto">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} {presentation?.actionLabel ?? "Send message"}
      </Button>
      <p className="text-[13px] text-muted-foreground">Your details are only used to reply to this message.</p>
    </form>
  );
}
