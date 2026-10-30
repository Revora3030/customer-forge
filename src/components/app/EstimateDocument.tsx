import { formatCents, type DocumentModel } from "@/lib/estimates/printable-estimate";
import type { EstimateSignature } from "@/lib/estimates/estimate-signature";

const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

const labelClass = "text-[11px] font-semibold uppercase tracking-wider text-neutral-500";

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <p className="whitespace-pre-line break-words">{value}</p>
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div className="break-inside-avoid">
      <div className="h-10 border-b border-neutral-700" aria-hidden="true" />
      <p className="mt-1 text-[11px] text-neutral-600">{label}</p>
    </div>
  );
}

/**
 * The paper itself: an estimate or a work order built only from what the owner entered and what the
 * workspace already holds about the customer. Shown once as the on-screen preview and once more, hidden,
 * as the copy that prints.
 */
export function EstimateDocument({
  doc,
  signature = null,
}: {
  doc: DocumentModel;
  /** The customer's on-screen signature for this exact estimate, when they signed. */
  signature?: EstimateSignature | null;
}) {
  const isEstimate = doc.kind === "estimate";
  const contact = [doc.business.phone, doc.business.email, doc.business.website].filter(Boolean);
  const markUntaxed = doc.showPrices && doc.taxRateLabel !== null;

  return (
    <article
      aria-label={`${doc.title} ${doc.number}`}
      className="estimate-paper rounded-md border border-neutral-300 bg-white p-5 text-left text-[13px] leading-relaxed text-neutral-900 sm:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-neutral-300 pb-4">
        <div className="min-w-0">
          <p className="break-words text-[19px] font-semibold leading-tight">{doc.business.name}</p>
          {doc.business.address ? <p className="mt-1 text-neutral-600">{doc.business.address}</p> : null}
          {contact.length ? <p className="break-words text-neutral-600">{contact.join(" · ")}</p> : null}
        </div>
        <div className="text-right">
          <h2 className="text-[20px] font-semibold uppercase tracking-[0.08em]">{doc.title}</h2>
          <p className="tnum mt-0.5 font-medium">{doc.number}</p>
          <p className="text-neutral-600">Prepared {doc.preparedOn}</p>
          {doc.validUntil ? <p className="text-neutral-600">Valid until {doc.validUntil}</p> : null}
        </div>
      </header>

      <section className="mt-4 grid gap-4 sm:grid-cols-2" aria-label="Customer and job">
        <div>
          <p className={labelClass}>{isEstimate ? "Prepared for" : "Customer"}</p>
          <p className="break-words font-medium">{doc.customer.name}</p>
          {doc.customer.phone ? <p>{doc.customer.phone}</p> : null}
          {doc.customer.email ? <p className="break-words">{doc.customer.email}</p> : null}
        </div>
        <div className="space-y-2">
          <Detail label="Job site" value={doc.jobSite} />
          <Detail label="Scheduled" value={doc.scheduledFor} />
          <Detail label="Crew" value={doc.assignedTo} />
        </div>
      </section>

      <table className="mt-5 w-full border-collapse text-left">
        <caption className="sr-only">{isEstimate ? "Work and materials" : "Tasks for the crew"}</caption>
        <thead>
          <tr className="border-b border-neutral-400 text-[11px] uppercase tracking-wider text-neutral-500">
            {isEstimate ? null : (
              <th scope="col" className="w-7 py-1.5 pr-2">
                <span className="sr-only">Done</span>
              </th>
            )}
            <th scope="col" className="py-1.5 pr-3 font-semibold">
              Description
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-semibold">
              Qty
            </th>
            {doc.showPrices ? (
              <>
                <th scope="col" className="py-1.5 pr-3 text-right font-semibold">
                  Unit price
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  Amount
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line, index) => (
            <tr key={index} className="break-inside-avoid border-b border-neutral-200 align-top">
              {isEstimate ? null : (
                <td className="py-2 pr-2">
                  <span aria-hidden="true" className="mt-0.5 block size-4 rounded-[3px] border border-neutral-500" />
                </td>
              )}
              <td className="break-words py-2 pr-3">
                {line.description}
                {markUntaxed && !line.taxable ? <span className="text-neutral-500"> (not taxed)</span> : null}
              </td>
              <td className="tnum py-2 pr-3 text-right">{quantityFormat.format(line.quantity)}</td>
              {doc.showPrices ? (
                <>
                  <td className="tnum py-2 pr-3 text-right">{line.unitCents === null ? "" : formatCents(line.unitCents)}</td>
                  <td className="tnum py-2 text-right font-medium">
                    {line.amountCents === null ? "" : formatCents(line.amountCents)}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {doc.showPrices ? (
        <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 break-inside-avoid">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">Subtotal</dt>
            <dd className="tnum">{formatCents(doc.subtotalCents)}</dd>
          </div>
          {doc.taxRateLabel ? (
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-600">Tax ({doc.taxRateLabel})</dt>
              <dd className="tnum">{formatCents(doc.taxCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-neutral-400 pt-1.5 text-[16px] font-semibold">
            <dt>Total</dt>
            <dd className="tnum">{formatCents(doc.totalCents)}</dd>
          </div>
        </dl>
      ) : null}

      {doc.notes ? (
        <section className="mt-5 break-inside-avoid">
          <h3 className={labelClass}>{isEstimate ? "Scope of work" : "Notes for the crew"}</h3>
          <p className="mt-1 whitespace-pre-line break-words">{doc.notes}</p>
        </section>
      ) : null}

      {doc.terms ? (
        <section className="mt-4 break-inside-avoid">
          <h3 className={labelClass}>Terms</h3>
          <p className="mt-1 whitespace-pre-line break-words text-neutral-700">{doc.terms}</p>
        </section>
      ) : null}

      <section aria-label="Signatures" className="mt-8 break-inside-avoid space-y-6">
        {isEstimate ? (
          <div className="grid gap-6 sm:grid-cols-[2fr_1fr]">
            {signature ? (
              <>
                <div className="break-inside-avoid">
                  <div className="flex h-16 items-end border-b border-neutral-700">
                    <img
                      src={signature.dataUrl}
                      alt={`Signature of ${signature.signerName}`}
                      className="max-h-16 max-w-[240px] object-contain"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-600">
                    Approved by {signature.signerName} — signed electronically
                  </p>
                </div>
                <div className="break-inside-avoid">
                  <div className="flex h-16 items-end border-b border-neutral-700">
                    <span className="tnum">{new Date(signature.signedAt).toLocaleString("en-US")}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-600">Date</p>
                </div>
              </>
            ) : (
              <>
                <SignatureLine label="Customer approval — signature" />
                <SignatureLine label="Date" />
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-[2fr_1fr]">
              <SignatureLine label="Work completed by — signature" />
              <SignatureLine label="Date completed" />
            </div>
            <div className="grid gap-6 sm:grid-cols-[2fr_1fr]">
              <SignatureLine label="Customer sign-off — signature" />
              <SignatureLine label="Date" />
            </div>
          </>
        )}
      </section>
    </article>
  );
}
