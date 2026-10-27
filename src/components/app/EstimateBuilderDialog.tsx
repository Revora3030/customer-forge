import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EstimateDocument } from "@/components/app/EstimateDocument";
import { currency } from "@/lib/format";
import { useAppointments, useBusinessProfile, useQuoteRequests } from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  MAX_LINES,
  blankLine,
  buildDocument,
  businessAddress,
  initialFormState,
  latestQuoteFor,
  loadDefaults,
  nextAppointmentLabel,
  parseTaxRate,
  quoteChoicesText,
  saveDefaults,
  type DocumentBusiness,
  type DocumentFormState,
  type DocumentKind,
  type DocumentModel,
  type LineDraft,
  type QuoteReference,
} from "@/lib/estimates/printable-estimate";

type ServiceOption = { id: string; name: string; price: number | null; starting_price: number | null; is_active: boolean };

type Lead = { id: string; name: string; email: string | null; phone: string | null };

const VALID_PRESETS = ["14", "30", "60"] as const;

/** The copy that prints. It lives straight under <body>, outside the scrolling dialog, so a long document paginates. */
function PrintCopy({ doc }: { doc: DocumentModel }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div data-print-document="" aria-hidden="true">
      <EstimateDocument doc={doc} />
    </div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="eyebrow">{title}</p>
      {children}
    </section>
  );
}

function EstimateBuilder({
  organizationId,
  lead,
  business,
  serviceName,
  scheduledFor,
  assignedName,
  services,
  quote,
  onPrepared,
}: {
  organizationId: string | undefined;
  lead: Lead;
  business: DocumentBusiness;
  serviceName: string | null;
  scheduledFor: string;
  assignedName: string;
  services: readonly ServiceOption[];
  quote: QuoteReference | null;
  onPrepared?: ((doc: DocumentModel) => void) | undefined;
}) {
  const uid = useId();
  const [now] = useState(() => new Date());
  const [form, setForm] = useState<DocumentFormState>(() =>
    initialFormState({ serviceName, scheduledFor, assignedTo: assignedName, defaults: loadDefaults(organizationId) }),
  );
  const [logIt, setLogIt] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const logged = useRef<string | null>(null);

  const set = <K extends keyof DocumentFormState>(key: K, value: DocumentFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, patch: Partial<LineDraft>) =>
    setForm((current) => ({ ...current, lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));
  const addLine = (line: LineDraft = blankLine()) =>
    setForm((current) => (current.lines.length >= MAX_LINES ? current : { ...current, lines: [...current.lines, line] }));
  const removeLine = (index: number) =>
    setForm((current) => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }));

  const customer = useMemo(() => ({ name: lead.name, email: lead.email, phone: lead.phone }), [lead]);
  const doc = useMemo(
    () => buildDocument({ form, leadId: lead.id, now, business, customer }),
    [form, lead.id, now, business, customer],
  );

  const isEstimate = form.kind === "estimate";
  const priced = doc.showPrices;
  const taxApplies = priced && (parseTaxRate(form.taxRate) ?? 0) > 0;
  const activeServices = services.filter((service) => service.is_active);

  const print = () => {
    if (doc.problems.length > 0) {
      setAttempted(true);
      return;
    }
    saveDefaults(organizationId, { taxRate: form.taxRate, validDays: form.validDays, terms: form.terms });
    const fingerprint = `${doc.kind}|${doc.number}|${doc.totalCents}|${doc.lines.length}`;
    if (logIt && onPrepared && logged.current !== fingerprint) {
      logged.current = fingerprint;
      onPrepared(doc);
    }
    // A saved PDF takes its file name from the page title.
    const previousTitle = document.title;
    document.title = `${doc.title} ${doc.number} - ${doc.business.name}`;
    try {
      window.print();
    } finally {
      document.title = previousTitle;
    }
  };

  const chip = (active: boolean) =>
    cn(
      "min-h-11 cursor-pointer rounded-md border px-3 text-xs font-medium sm:min-h-10",
      active ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/40",
    );

  return (
    <>
      <div className="space-y-6">
        <Section title="Document">
          <div role="group" aria-label="Document type" className="grid grid-cols-2 gap-2">
            {(["estimate", "work_order"] as DocumentKind[]).map((kind) => (
              <Button
                key={kind}
                type="button"
                variant={form.kind === kind ? "signal" : "outline"}
                aria-pressed={form.kind === kind}
                onClick={() => set("kind", kind)}
              >
                {kind === "estimate" ? "Estimate" : "Work order"}
              </Button>
            ))}
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {isEstimate
              ? "Priced lines, tax if you charge it, and a customer approval line."
              : "A task checklist with completion and customer sign-off lines. Prices stay off unless you turn them on."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${uid}-site`}>Job site</Label>
              <Input
                id={`${uid}-site`}
                value={form.jobSite}
                maxLength={200}
                placeholder="Street address where the work happens"
                onChange={(event) => set("jobSite", event.target.value)}
              />
            </div>
            {isEstimate ? null : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-when`}>Scheduled for</Label>
                  <Input
                    id={`${uid}-when`}
                    value={form.scheduledFor}
                    maxLength={120}
                    placeholder="Date and time"
                    onChange={(event) => set("scheduledFor", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-crew`}>Crew</Label>
                  <Input
                    id={`${uid}-crew`}
                    value={form.assignedTo}
                    maxLength={120}
                    placeholder="Who is doing the work"
                    onChange={(event) => set("assignedTo", event.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </Section>

        {quote ? (
          <div className="rounded-md border border-border bg-muted/30 p-3.5 text-[13px]">
            <p className="eyebrow">From their quote request</p>
            {quote.max > 0 ? (
              <p className="tnum mt-1.5">
                The calculator showed them {currency(quote.min)} – {currency(quote.max)}. Your prices below replace that range.
              </p>
            ) : null}
            {quote.choices.length > 0 ? (
              <>
                <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                  {quote.choices.map((choice) => (
                    <li key={`${choice.question}:${choice.answer}`}>
                      {choice.question}: <span className="text-foreground">{choice.answer}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2.5"
                  onClick={() =>
                    set("notes", [form.notes.trim(), quoteChoicesText(quote.choices)].filter(Boolean).join("\n\n"))
                  }
                >
                  <Plus className="size-4" aria-hidden="true" /> Add their choices to the scope notes
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        <Section title={isEstimate ? "Work and materials" : "Tasks"}>
          <ul className="space-y-2.5">
            {form.lines.map((line, index) => {
              const row = index + 1;
              return (
                <li key={index} className="space-y-2 rounded-md border border-border p-3">
                  <Label htmlFor={`${uid}-d${index}`} className="sr-only">
                    Line {row} description
                  </Label>
                  <Input
                    id={`${uid}-d${index}`}
                    value={line.description}
                    maxLength={160}
                    placeholder={isEstimate ? "What the work or material is" : "What the crew should do"}
                    onChange={(event) => setLine(index, { description: event.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Line ${row} quantity`}
                      inputMode="decimal"
                      className="w-20 shrink-0"
                      value={line.quantity}
                      onChange={(event) => setLine(index, { quantity: event.target.value })}
                    />
                    <Input
                      aria-label={`Line ${row} unit price in dollars`}
                      inputMode="decimal"
                      className="min-w-0 flex-1"
                      value={line.unitPrice}
                      placeholder={priced ? "Unit price $" : "Price (optional)"}
                      onChange={(event) => setLine(index, { unitPrice: event.target.value })}
                    />
                    {taxApplies ? (
                      <button
                        type="button"
                        aria-pressed={line.taxable}
                        aria-label={`Charge tax on line ${row}`}
                        className={chip(line.taxable)}
                        onClick={() => setLine(index, { taxable: !line.taxable })}
                      >
                        {line.taxable ? "Taxed" : "No tax"}
                      </button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove line ${row}`}
                      onClick={() => removeLine(index)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {form.lines.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No lines yet. Add the first one below.</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={form.lines.length >= MAX_LINES} onClick={() => addLine()}>
              <Plus className="size-4" aria-hidden="true" /> Add a line
            </Button>
            {activeServices.length > 0 ? (
              <div>
                <Label htmlFor={`${uid}-svc`} className="sr-only">
                  Add a line from your services
                </Label>
                <select
                  id={`${uid}-svc`}
                  value=""
                  onChange={(event) => {
                    const service = activeServices.find((s) => s.id === event.target.value);
                    if (!service) return;
                    const price = service.price ?? service.starting_price;
                    addLine({ ...blankLine(), description: service.name, unitPrice: price ? String(price) : "" });
                  }}
                  className="min-h-11 cursor-pointer rounded-md border border-input bg-background px-3 text-sm sm:min-h-10"
                >
                  <option value="">Add from your services…</option>
                  {activeServices.map((service) => {
                    const price = service.price ?? service.starting_price;
                    return (
                      <option key={service.id} value={service.id}>
                        {service.name}
                        {price ? ` · ${currency(price)}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Totals and terms">
          {isEstimate ? null : (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 cursor-pointer accent-[var(--primary)]"
                checked={form.showPrices}
                onChange={(event) => set("showPrices", event.target.checked)}
              />
              Show prices on this work order
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {priced ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-tax`}>Sales tax rate (%)</Label>
                <Input
                  id={`${uid}-tax`}
                  inputMode="decimal"
                  value={form.taxRate}
                  maxLength={8}
                  placeholder="Leave blank if you don't charge tax"
                  onChange={(event) => set("taxRate", event.target.value)}
                />
                <p className="text-[12px] text-muted-foreground">
                  Your rate, entered by you. Tax is charged only on lines marked Taxed.
                </p>
              </div>
            ) : null}
            {isEstimate ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-valid`}>Valid for (days)</Label>
                <Input
                  id={`${uid}-valid`}
                  inputMode="numeric"
                  value={form.validDays}
                  maxLength={3}
                  placeholder="Blank prints no expiry"
                  onChange={(event) => set("validDays", event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {VALID_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      aria-pressed={form.validDays === days}
                      className={chip(form.validDays === days)}
                      onClick={() => set("validDays", days)}
                    >
                      {days} days
                    </button>
                  ))}
                  <button type="button" className={chip(form.validDays === "")} onClick={() => set("validDays", "")}>
                    No expiry
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-notes`}>{isEstimate ? "Scope of work" : "Notes for the crew"}</Label>
            <Textarea
              id={`${uid}-notes`}
              rows={3}
              value={form.notes}
              maxLength={2000}
              onChange={(event) => set("notes", event.target.value)}
            />
          </div>
          {isEstimate ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-terms`}>Terms</Label>
              <Textarea
                id={`${uid}-terms`}
                rows={3}
                value={form.terms}
                maxLength={2000}
                placeholder="Payment, deposit or warranty terms, in your own words. Remembered on this device."
                onChange={(event) => set("terms", event.target.value)}
              />
            </div>
          ) : null}
        </Section>

        {onPrepared ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px]">
            <input
              type="checkbox"
              className="size-5 cursor-pointer accent-[var(--primary)]"
              checked={logIt}
              onChange={(event) => setLogIt(event.target.checked)}
            />
            Note this in the lead's activity when I print it
          </label>
        ) : null}

        {attempted && doc.problems.length > 0 ? (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3.5 text-[13px]">
            <p className="font-medium">Fix this before printing:</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {doc.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Section title="Preview">
          <div className="overflow-x-auto">
            <EstimateDocument doc={doc} />
          </div>
        </Section>
      </div>

      <div className="sticky -bottom-5 -mx-5 -mb-5 flex justify-end border-t border-border bg-background px-5 py-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
        <Button type="button" variant="signal" className="w-full sm:w-auto" onClick={print}>
          <Printer className="size-4" aria-hidden="true" /> Print or save as PDF
        </Button>
      </div>

      <PrintCopy doc={doc} />
    </>
  );
}

/**
 * Estimate or work order for one lead, printable or savable as a PDF from the browser.
 * It prefills only from records the workspace already holds and sends nothing to the customer.
 */
export function EstimateBuilderDialog({
  open,
  onOpenChange,
  organizationId,
  businessName,
  lead,
  serviceName,
  assignedName,
  services,
  onPrepared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | undefined;
  businessName: string | null;
  lead: Lead;
  serviceName: string | null;
  assignedName: string;
  services: readonly ServiceOption[];
  onPrepared?: ((doc: DocumentModel) => void) | undefined;
}) {
  const scopedOrg = open ? organizationId : undefined;
  const profile = useBusinessProfile(scopedOrg);
  const quotes = useQuoteRequests(scopedOrg);
  const appointments = useAppointments(scopedOrg);
  const ready = !profile.isLoading && !quotes.isLoading && !appointments.isLoading;

  const business = useMemo<DocumentBusiness>(
    () => ({
      name: businessName ?? "",
      phone: profile.data?.phone ?? null,
      email: profile.data?.email ?? null,
      address: businessAddress(profile.data) || null,
      website: profile.data?.website ?? null,
    }),
    [businessName, profile.data],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Estimate or work order</DialogTitle>
          <DialogDescription>
            For {lead.name}. The prices, tax and terms are yours to enter. Nothing is sent to the customer from here.
          </DialogDescription>
        </DialogHeader>
        {ready ? (
          <EstimateBuilder
            key={lead.id}
            organizationId={organizationId}
            lead={lead}
            business={business}
            serviceName={serviceName}
            scheduledFor={nextAppointmentLabel(lead.id, appointments.data ?? [])}
            assignedName={assignedName}
            services={services}
            quote={latestQuoteFor(lead.id, quotes.data ?? [])}
            onPrepared={onPrepared}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Loading their details…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
