import { useEffect, useId, useState } from "react";
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
import { currency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStepScroll } from "@/lib/use-step-scroll";
import { DirectContact } from "@/components/site/ContactDetails";

type Site = NonNullable<PublicSite>;

function useTracker(slug: string) {
  const track = useServerFn(trackPublicEvent);
  return (eventType: string) => {
    void track({
      data: {
        slug,
        eventType,
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
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{body}</p>
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

export function QuoteCalculator({ site }: { site: Site }) {
  const quote = site.quote;
  const submit = useServerFn(submitPublicLead);
  const track = useTracker(site.org.slug);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<"questions" | "contact">("questions");
  const stepRef = useStepScroll<HTMLDivElement>(step);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!quote) return null;
  if (done) {
    return (
      <div ref={stepRef}>
        <Success
          title="Your estimate is on its way"
          body={`${site.org.name} has your details and price range, and will confirm the exact quote shortly.`}
        />
      </div>
    );
  }

  const base = Number(quote.form.base_price ?? 0);
  const selected = quote.questions.map((question) => {
    const optionId = answers[question.id];
    const option = question.options.find((o) => o.id === optionId);
    return { question, option };
  });

  let total = base;
  for (const { option } of selected) {
    if (!option) continue;
    total =
      option.modifier_type === "multiply"
        ? total * option.price_modifier
        : total + option.price_modifier;
  }
  const addons = quote.addons ?? [];
  const chosenAddons = addons.filter((a) => picked.includes(a.id));
  total += chosenAddons.reduce((sum, a) => sum + Number(a.price), 0);
  const min = Math.max(Number(quote.form.min_price ?? 0), Math.round(total * 0.9));
  const max = Math.max(
    min,
    Math.min(
      Number(quote.form.max_price ?? total * 1.15) || total * 1.15,
      Math.round(total * 1.15),
    ),
  );
  const answered = selected.filter((s) => s.option).length;
  const complete = answered === quote.questions.length && quote.questions.length > 0;

  return (
    <div ref={stepRef} className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <p className="eyebrow">Instant estimate</p>
        <h3 className="mt-1 font-display text-[19px] font-semibold">{quote.form.name}</h3>
      </div>

      {step === "questions" ? (
        <div className="space-y-6 px-5 py-5">
          {quote.questions.map((question) => (
            <fieldset key={question.id}>
              <legend className="text-[14px] font-medium">{question.label}</legend>
              {question.helper_text ? (
                <p className="mt-1 text-[13px] text-muted-foreground">{question.helper_text}</p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const active = answers[question.id] === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        if (!answered) track("quote_start");
                        setAnswers((prev) => ({ ...prev, [question.id]: option.id }));
                      }}
                      aria-pressed={active}
                      className={cn(
                        "cursor-pointer rounded-md border px-3.5 py-2.5 text-left text-[13px] transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border hover:bg-elevated",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {addons.length ? (
            <fieldset className="border-t border-border pt-4">
              <legend className="text-[14px] font-medium">Optional extras</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {addons.map((addon) => {
                  const active = picked.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setPicked((prev) =>
                          prev.includes(addon.id)
                            ? prev.filter((id) => id !== addon.id)
                            : [...prev, addon.id],
                        )
                      }
                      className={cn(
                        "cursor-pointer rounded-md border px-3.5 py-2.5 text-left text-[13px] transition-colors",
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
                        <span className="mt-1 block text-[13px] text-muted-foreground">
                          {addon.description}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              <p className="eyebrow">Estimated range</p>
              <p className="tnum mt-1 font-display text-[24px] font-semibold text-primary">
                {complete ? `${currency(min)} – ${currency(max)}` : "—"}
              </p>
            </div>
            <Button
              variant="signal"
              disabled={!complete}
              onClick={() => {
                track("quote_complete");
                setStep("contact");
              }}
            >
              Lock in this price
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4 px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setPending(true);
            submit({
              data: {
                slug: site.org.slug,
                kind: "quote",
                name: String(form.get("name") ?? ""),
                email: String(form.get("email") ?? ""),
                phone: String(form.get("phone") ?? ""),
                message: String(form.get("message") ?? ""),
                companyWebsite: String(form.get("company_website") ?? ""),
                serviceInterest: quote.form.name,
                estimatedValue: Math.round((min + max) / 2),
                ...(() => {
                  const attribution = readAttribution();
                  return { source: attribution.source, campaign: attribution.campaign };
                })(),
                quote: {
                  formId: quote.form.id,
                  answers: [
                    ...selected
                      .filter((s) => s.option)
                      .map((s) => ({
                        question: s.question.label,
                        answer: s.option!.label,
                        modifier: s.option!.price_modifier,
                      })),
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
          <p className="tnum text-[13px] text-muted-foreground">
            Your estimate:{" "}
            <span className="font-semibold text-primary">
              {currency(min)} – {currency(max)}
            </span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="q-name">Your name</Label>
            <Input id="q-name" name="name" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q-phone">Phone</Label>
              <Input id="q-phone" name="phone" type="tel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-email">Email</Label>
              <Input id="q-email" name="email" type="email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-message">Anything we should know?</Label>
            <Textarea id="q-message" name="message" rows={3} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="signal" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Send my quote request
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("questions")}>
              Back
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function BookingForm({ site }: { site: Site }) {
  const uid = useId();
  const fid = (key: string) => `b-${key}-${uid}`;
  const submit = useServerFn(submitPublicLead);
  const track = useTracker(site.org.slug);
  const bookable = site.services.filter((s) => s.bookable);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [serviceId, setServiceId] = useState(bookable[0]?.id ?? "");
  const doneRef = useStepScroll<HTMLDivElement>(done);
  // "Today" is the visitor's own date, so it is only known in the browser.
  // Reading it during the server render made the first paint disagree with the
  // browser whenever the two were on different calendar days.
  const [today, setToday] = useState("");
  useEffect(() => {
    const local = new Date();
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    setToday(local.toISOString().slice(0, 10));
  }, []);

  if (done) {
    return (
      <div ref={doneRef}>
        <Success
          title="Booking request received"
          body={`${site.org.name} will confirm your time slot by phone or email shortly.`}
        />
        <div className="mt-4">
          <DirectContact
            profile={site.profile}
            businessName={site.org.name}
            label={`Need it sooner? Reach ${site.org.name} directly`}
          />
        </div>
      </div>
    );
  }

  const service = bookable.find((s) => s.id === serviceId);

  return (
    <form
      className="panel space-y-4 p-5"
      onFocus={() => track("booking_start")}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const date = String(form.get("date") ?? "");
        const time = String(form.get("time") ?? "");
        setPending(true);
        submit({
          data: {
            slug: site.org.slug,
            kind: bookable.length ? "booking" : "contact",
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            phone: String(form.get("phone") ?? ""),
            message: String(form.get("message") ?? ""),
            city: String(form.get("city") ?? ""),
            companyWebsite: String(form.get("company_website") ?? ""),
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
        <p className="eyebrow">Book now</p>
        <h3 className="mt-1 font-display text-[19px] font-semibold">Request your appointment</h3>
      </div>

      <Honeypot />
      <DirectContact profile={site.profile} businessName={site.org.name} />

      {bookable.length ? (
        <div className="space-y-1.5">
          <Label htmlFor={fid("service")}>Service</Label>
          <select
            id={fid("service")}
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-[13px]"
          >
            {bookable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.price ? ` — ${currency(Number(s.price))}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={fid("name")}>Your name</Label>
          <Input id={fid("name")} name="name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fid("phone")}>Phone</Label>
          <Input id={fid("phone")} name="phone" type="tel" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fid("email")}>Email</Label>
          <Input id={fid("email")} name="email" type="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fid("city")}>City / address</Label>
          <Input id={fid("city")} name="city" />
        </div>
        {bookable.length ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={fid("date")}>Preferred date</Label>
              <Input id={fid("date")} name="date" type="date" min={today || undefined} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fid("time")}>Preferred time (your local time)</Label>
              <Input id={fid("time")} name="time" type="time" defaultValue="09:00" required />
            </div>
          </>
        ) : null}
      </div>
      {bookable.length ? (
        <p className="text-[11px] text-muted-foreground">
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
        <Label htmlFor={fid("message")}>Details</Label>
        <Textarea id={fid("message")} name="message" rows={3} />
      </div>

      <Button type="submit" variant="signal" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null} Request appointment
      </Button>
      <p className="text-[11px] text-muted-foreground">
        No payment now — you'll get a confirmation before anything is charged.
      </p>
    </form>
  );
}
